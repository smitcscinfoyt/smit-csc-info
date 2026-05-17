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

const PENDING_REG_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
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

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── POST /api/auth/register ───────────────────────────────────────────────────

router.post("/auth/register", async (req, res): Promise<void> => {
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

  const passwordHash      = await bcrypt.hash(password, 10);
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

// ── POST /api/auth/login ──────────────────────────────────────────────────────

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    // Email not found in DB → both email and password are effectively invalid
    res.status(401).json({ error: "Invalid email and password", code: "invalid_email_and_password" });
    return;
  }

  // Block soft-deleted accounts. The email is anonymized on
  // delete (`deleted_<id>_<ts>@deleted.local`), so a freshly
  // anonymized account would never match an organic login email.
  // This guard is defense-in-depth for any race window.
  if (user.isDeleted) {
    res.status(401).json({ error: "Invalid email and password", code: "invalid_email_and_password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    // Email exists but password is wrong → only password is invalid
    res.status(401).json({ error: "Invalid password", code: "invalid_password" });
    return;
  }

  // ── STRICT: block unverified accounts ───────────────────────────────────────
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
  const token = typeof req.query.token === "string" ? req.query.token.trim() : null;
  const frontendUrl = getFrontendUrl();

  if (!token) {
    res.status(400).send("Missing verification token.");
    return;
  }

  // ── Path A: New JWT-based pending registration ────────────────────────────
  const pending = verifyPendingRegistration(token);
  if (pending) {
    // Insert the user only now (after successful verification).
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, pending.email));
    if (existing.length > 0) {
      // Account already exists (perhaps verified earlier or via Google) — just redirect.
      res.redirect(`${frontendUrl}/login?verified=already`);
      return;
    }

    const [created] = await db
      .insert(usersTable)
      .values({
        name:              pending.name,
        email:             pending.email,
        mobile:            pending.mobile,
        passwordHash:      pending.passwordHash,
        role:              "user",
        isVerified:        true,
        verificationToken: null,
      })
      .returning();

    console.log(`[Auth] Email verified & account created for ${created.email} (ID ${created.id})`);
    res.redirect(`${frontendUrl}/login?verified=true`);
    return;
  }

  // ── Path B: Legacy DB-stored verification token (backward compat) ─────────
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.verificationToken, token));

  if (!user) {
    res.status(400).send("Invalid or expired verification token.");
    return;
  }

  if (user.isVerified) {
    res.redirect(`${frontendUrl}/login?verified=already`);
    return;
  }

  await db
    .update(usersTable)
    .set({ isVerified: true, verificationToken: null })
    .where(eq(usersTable.id, user.id));

  console.log(`[Auth] Email verified for user ${user.email} (ID ${user.id})`);
  res.redirect(`${frontendUrl}/login?verified=true`);
});

// ── POST /api/auth/resend-verification ───────────────────────────────────────

router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    // Don't reveal whether the account exists
    res.json({ message: "If that email is registered, a new verification link has been sent." });
    return;
  }

  if (user.isVerified) {
    res.json({ message: "This account is already verified. You can log in." });
    return;
  }

  // Generate a fresh token
  const newToken = crypto.randomBytes(32).toString("hex");
  await db
    .update(usersTable)
    .set({ verificationToken: newToken })
    .where(eq(usersTable.id, user.id));

  sendVerificationEmail(email, user.name, newToken).catch((err) =>
    console.error("[MAILER] Failed to resend verification email:", err),
  );

  res.json({ message: "A new verification email has been sent. Please check your inbox." });
});

// ── POST /api/auth/forgot-password ───────────────────────────────────────────

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};

  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!user) {
    console.log(`[Auth] Forgot-password: no account found for ${email}`);
    res.status(404).json({ error: "This email is not registered with us." });
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

  res.json({
    message: "A password reset link has been sent to your email. Check your inbox (and spam folder).",
  });
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

  const passwordHash = await bcrypt.hash(password, 10);

  await db
    .update(usersTable)
    .set({ passwordHash, resetToken: null, resetTokenExpiry: null })
    .where(eq(usersTable.id, user.id));

  console.log(`[Auth] Password reset successful for ${user.email} (ID ${user.id})`);

  res.json({ message: "Password reset successfully. You can now log in with your new password." });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

router.post("/auth/logout", (_req, res): void => {
  res.json({ success: true, message: "Logged out successfully" });
});

// ── POST /api/auth/firebase ───────────────────────────────────────────────────

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
    const fakeHash = await bcrypt.hash(Math.random().toString(36) + Date.now(), 10);
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

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

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

// ── Util ──────────────────────────────────────────────────────────────────────

function getFrontendUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "http://localhost:22649";
}

export default router;
