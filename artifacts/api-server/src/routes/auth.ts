import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import { signToken, requireAuth, type AuthRequest } from "../lib/auth";
import { RegisterBody, LoginBody, GetMeResponse } from "@workspace/api-zod";
import { verifyFirebaseToken } from "../lib/firebase-admin";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/mailer";
import { createRateLimiter, clientIp } from "../lib/rate-limit";
import { logger } from "../lib/logger";

const PENDING_REG_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "dev-secret-change-me";
type PendingRegistration = {
  type: "pending_registration";
  name: string;
  email: string;
  mobile: string | null;
  passwordHash: string;
};
function signPendingRegistration(data: Omit<PendingRegistration, "type">): string {
  return jwt.sign({ type: "pending_registration", ...data }, PENDING_REG_SECRET, { expiresIn: "24h" });
}
function verifyPendingRegistration(token: string): PendingRegistration | null {
  try {
    const decoded = jwt.verify(token, PENDING_REG_SECRET) as PendingRegistration;
    if (decoded.type !== "pending_registration") return null;
    return decoded;
  } catch {
    return null;
  }
}

// ── Rate limiters ──────────────────────────────────────────────────────────────
// Per-IP: 10 attempts per 15-minute window across login attempts
const loginIpLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 10 });
// Per-account: 5 attempts per 15-minute window (prevents targeted account brute-force)
const loginEmailLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 5 });
// Registration: 5 attempts per 10 minutes per IP
const registerLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 5 });
// Password reset: 3 attempts per 10 minutes per IP
const forgotPwdLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 3 });
// Resend verification: 3 attempts per 10 minutes per IP
const resendVerifyLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 3 });

// ── Bcrypt config ──────────────────────────────────────────────────────────────
const BCRYPT_ROUNDS = 12;

// Pre-computed cost-12 dummy hash used to equalize timing when an email is not
// found — prevents user enumeration via response-time differences.
// Generated once: bcrypt.hashSync("timing-dummy", 12)
const DUMMY_HASH =
  "$2b$12$Zr7mGdv5rZ6KkQv8L0N.muEWUWiR0KBJlXJmO.IFqXWm7u0cshLIu";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

function userPayload(user: typeof usersTable.$inferSelect, photoOverride?: string | null) {
  return {
    id:           user.id,
    name:         user.name,
    email:        user.email,
    mobile:       user.mobile ?? null,
    role:         user.role,
    createdAt:    user.createdAt.toISOString(),
    profilePhoto: (user as any).profilePhoto ?? photoOverride ?? null,
  };
}

// ── POST /api/auth/register ────────────────────────────────────────────────────

router.post("/auth/register", async (req, res): Promise<void> => {
  // Rate-limit registrations per IP to slow down mass account creation
  const ip = clientIp(req);
  const rlReg = registerLimiter(`ip:${ip}`);
  if (!rlReg.ok) {
    res.status(429).json({
      error: "Too many registration attempts. Please wait before trying again.",
      retryAfter: rlReg.retryAfter,
    });
    return;
  }

  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, mobile, password } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash      = await bcrypt.hash(password, BCRYPT_ROUNDS);
  // Encode the pending registration in a signed JWT (expires 24h).
  // Nothing is written to the database until the user clicks the verification link.
  const verificationToken = signPendingRegistration({
    name,
    email,
    mobile: mobile ?? null,
    passwordHash,
  });

  // Send verification email (non-blocking — don't fail registration if mail errors)
  sendVerificationEmail(email, name, verificationToken).catch((err) =>
    console.error("[MAILER] Failed to send verification email:", err),
  );

  console.log(`[Auth] Registration pending verification for ${email} (not yet saved to DB)`);

  res.status(201).json({
    requiresVerification: true,
    email,
    message: "Please check your inbox and click the verification link to activate your account. Your account will be created only after verification.",
  });
});

// ── POST /api/auth/login ───────────────────────────────────────────────────────

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const ip = clientIp(req);

  // ── Rate limiting: per-IP and per-email ────────────────────────────────────
  const rlIp    = loginIpLimiter(`ip:${ip}`);
  const rlEmail = loginEmailLimiter(`email:${email.toLowerCase()}`);
  if (!rlIp.ok || !rlEmail.ok) {
    res.status(429).json({
      error: "Too many login attempts. Please wait before trying again.",
      retryAfter: Math.max(rlIp.retryAfter ?? 0, rlEmail.retryAfter ?? 0),
    });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (!user || user.isDeleted) {
    // ── Timing equalization ────────────────────────────────────────────────
    // Run a dummy bcrypt compare so the response time is indistinguishable
    // from the "wrong password" branch, preventing email enumeration via timing.
    await bcrypt.compare(password, DUMMY_HASH);
    res.status(401).json({ error: "Invalid email or password", code: "invalid_credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password", code: "invalid_credentials" });
    return;
  }

  // ── Transparent bcrypt rehash (cost upgrade: 10 → 12) ─────────────────────
  // No forced password resets — the hash is silently upgraded on next login.
  try {
    const currentRounds = bcrypt.getRounds(user.passwordHash);
    if (currentRounds < BCRYPT_ROUNDS) {
      const upgraded = await bcrypt.hash(password, BCRYPT_ROUNDS);
      // Non-blocking: do not let a DB failure block the login response
      db.update(usersTable)
        .set({ passwordHash: upgraded })
        .where(eq(usersTable.id, user.id))
        .catch((e) => logger.warn({ err: e, userId: user.id }, "bcrypt rehash failed"));
    }
  } catch (e) {
    // getRounds can throw on malformed hashes — log and continue
    logger.warn({ err: e, userId: user.id }, "bcrypt getRounds failed during rehash check");
  }

  // ── STRICT: block unverified accounts ─────────────────────────────────────
  if (!user.isVerified) {
    res.status(403).json({
      error:              "email_not_verified",
      message:            "Your email is not verified. Please check your inbox and click the activation link.",
      email,
    });
    return;
  }

  const token = signToken({ userId: user.id, role: user.role });
  res.json({ user: userPayload(user), token });
});

// ── GET /api/auth/verify?token=... ────────────────────────────────────────────

router.get("/auth/verify", async (req, res): Promise<void> => {
  const { token } = req.query as { token?: string };
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Verification token is required." });
    return;
  }

  const pending = verifyPendingRegistration(token);
  if (!pending) {
    res.status(400).json({ error: "Invalid or expired verification link. Please register again." });
    return;
  }

  // Check if already registered (e.g., double-click on the link)
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, pending.email));
  if (existing.length > 0) {
    const frontendUrl = getFrontendUrl();
    res.redirect(`${frontendUrl}/auth/login?verified=already`);
    return;
  }

  // Create the user now that email is verified
  const [created] = await db
    .insert(usersTable)
    .values({
      name:              pending.name,
      email:             pending.email,
      mobile:            pending.mobile ?? null,
      passwordHash:      pending.passwordHash,
      role:              "user",
      isVerified:        true,
      verificationToken: null,
    })
    .returning();

  console.log(`[Auth] Account created for ${pending.email} (ID ${created.id}) via email verification`);

  const frontendUrl = getFrontendUrl();
  res.redirect(`${frontendUrl}/auth/login?verified=1`);
});

// ── POST /api/auth/resend-verification ────────────────────────────────────────

router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  // Rate-limit to prevent email flooding
  const ip = clientIp(req);
  const rlResend = resendVerifyLimiter(`ip:${ip}`);
  if (!rlResend.ok) {
    res.status(429).json({
      error: "Too many requests. Please wait before requesting another verification email.",
      retryAfter: rlResend.retryAfter,
    });
    return;
  }

  const { email } = req.body ?? {};
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  // Always return the same message regardless of whether the email exists
  // (prevents email enumeration)
  if (!user || user.isVerified) {
    res.json({ message: "If that email has a pending verification, a new link has been sent." });
    return;
  }

  const newToken = crypto.randomBytes(32).toString("hex");
  await db
    .update(usersTable)
    .set({ verificationToken: newToken })
    .where(eq(usersTable.id, user.id));

  sendVerificationEmail(email, user.name, newToken).catch((err) =>
    console.error("[MAILER] Failed to resend verification email:", err),
  );

  res.json({ message: "If that email has a pending verification, a new link has been sent." });
});

// ── POST /api/auth/forgot-password ────────────────────────────────────────────

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  // Rate-limit to prevent password reset link flooding
  const ip = clientIp(req);
  const rlForgot = forgotPwdLimiter(`ip:${ip}`);
  if (!rlForgot.ok) {
    res.status(429).json({
      error: "Too many requests. Please wait before requesting another password reset.",
      retryAfter: rlForgot.retryAfter,
    });
    return;
  }

  const { email } = req.body ?? {};

  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));

  // ── Always return 200 — never reveal whether the email is registered ────────
  // This prevents email enumeration via the forgot-password endpoint.
  const GENERIC_RESET_MSG = "If that email is registered with us, a password reset link has been sent. Please check your inbox (and spam folder).";

  if (!user) {
    console.log(`[Auth] Forgot-password: no account found for ${email} (response suppressed)`);
    res.json({ message: GENERIC_RESET_MSG });
    return;
  }

  const resetToken       = crypto.randomBytes(32).toString("hex");
  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db
    .update(usersTable)
    .set({ resetToken, resetTokenExpiry })
    .where(eq(usersTable.id, user.id));

  console.log(`[Auth] Password reset requested for ${email} (ID ${user.id})`);

  sendPasswordResetEmail(email, user.name, resetToken).catch((err) =>
    console.error("[MAILER] Failed to send password reset email:", err),
  );

  res.json({ message: GENERIC_RESET_MSG });
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────────

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body ?? {};

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Reset token is required." });
    return;
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.resetToken, token));

  if (!user || !user.resetTokenExpiry) {
    console.warn(`[Auth] Reset password: invalid token used`);
    res.status(400).json({ error: "Invalid or expired reset link. Please request a new one." });
    return;
  }

  if (user.resetTokenExpiry < new Date()) {
    console.warn(`[Auth] Reset password: expired token for ${user.email}`);
    res.status(400).json({ error: "This reset link has expired. Please request a new one." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await db
    .update(usersTable)
    .set({ passwordHash, resetToken: null, resetTokenExpiry: null })
    .where(eq(usersTable.id, user.id));

  console.log(`[Auth] Password reset successful for ${user.email} (ID ${user.id})`);

  res.json({ message: "Password reset successfully. You can now log in with your new password." });
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────────

router.post("/auth/logout", (_req, res): void => {
  // NOTE: JWT logout is currently client-side only (token remains valid until 8h expiry).
  // The client is expected to clear the token from sessionStorage on logout.
  // To implement server-side invalidation, see OWNER_ACTIONS.md § "Token Blacklist (future)".
  res.json({ success: true, message: "Logged out successfully" });
});

// ── POST /api/auth/firebase ────────────────────────────────────────────────────

router.post("/auth/firebase", async (req, res): Promise<void> => {
  const { idToken } = req.body ?? {};
  if (!idToken || typeof idToken !== "string") {
    res.status(400).json({ error: "idToken is required" });
    return;
  }

  let decoded;
  try {
    decoded = await verifyFirebaseToken(idToken);
  } catch (err: unknown) {
    console.error("[Firebase Auth] Token verification failed:", err instanceof Error ? err.message : err);
    res.status(401).json({ error: "Invalid or expired Firebase token" });
    return;
  }

  const email   = decoded.email ?? "";
  const name    = decoded.name ?? decoded.email?.split("@")[0] ?? "User";
  const picture = decoded.picture;

  if (!email) {
    res.status(400).json({ error: "Firebase account has no email address" });
    return;
  }

  let [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (!user) {
    // Firebase users get a cost-12 hash of a random string (they log in via
    // Firebase, not password, so this hash is never used for authentication).
    const fakeHash = await bcrypt.hash(Math.random().toString(36) + Date.now(), BCRYPT_ROUNDS);
    const [created] = await db
      .insert(usersTable)
      .values({
        name,
        email,
        mobile:            null,
        passwordHash:      fakeHash,
        role:              "user",
        isVerified:        true,   // Firebase already verified the email
        verificationToken: null,
      })
      .returning();
    user = created;
    console.log(`[Firebase Auth] New user created: ${email} (${name})`);
  } else {
    // Mark existing user as verified if they hadn't completed email/password verification
    if (!user.isVerified) {
      await db
        .update(usersTable)
        .set({ isVerified: true, verificationToken: null })
        .where(eq(usersTable.id, user.id));
      user = { ...user, isVerified: true };
    }
    console.log(`[Firebase Auth] Existing user logged in: ${email}`);
  }

  const token = signToken({ userId: user.id, role: user.role });

  res.json({
    token,
    user: userPayload(user, picture),
  });
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────────

router.get("/auth/me", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  // If a super-admin soft-deleted this user while they were
  // logged in, force-logout on their next session poll. The
  // client's /auth/me poller treats 401 as a session expiry
  // and clears local credentials.
  if (user.isDeleted) {
    res.status(401).json({ error: "Account deactivated", code: "account_deleted" });
    return;
  }
  res.json(GetMeResponse.parse(userPayload(user)));
});

// ── Util ───────────────────────────────────────────────────────────────────────

function getFrontendUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "http://localhost:22649";
}

export default router;
