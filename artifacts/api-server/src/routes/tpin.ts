import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { db, usersTable, walletsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { setTpin, changeTpin, hasTpin, isValidPinFormat } from "../lib/tpin";
import { sendTpinResetEmail } from "../lib/mailer";

const router = Router();

// ── GET /api/tpin/status ─────────────────────────────────────────────────────
router.get("/tpin/status", requireAuth, async (req: AuthRequest, res) => {
  const set = await hasTpin(req.userId!);
  res.json({ tpinSet: set });
});

// ── POST /api/tpin/set ───────────────────────────────────────────────────────
const setBody = z.object({ pin: z.string().regex(/^[0-9]{4,6}$/) });
router.post("/tpin/set", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const parsed = setBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "T-PIN must be 4-6 digits" }); return; }
  const already = await hasTpin(req.userId!);
  if (already) { res.status(409).json({ error: "T-PIN already set. Use change endpoint." }); return; }
  await setTpin(req.userId!, parsed.data.pin);
  res.json({ ok: true });
});

// ── POST /api/tpin/change ─────────────────────────────────────────────────────
const changeBody = z.object({ oldPin: z.string(), newPin: z.string().regex(/^[0-9]{4,6}$/) });
router.post("/tpin/change", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const parsed = changeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid pins" }); return; }
  try {
    await changeTpin(req.userId!, parsed.data.oldPin, parsed.data.newPin);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(401).json({ error: err?.message ?? "Failed" });
  }
});

// ── POST /api/tpin/forgot ────────────────────────────────────────────────────
// Authenticated user requests a T-PIN reset link via email
router.post("/tpin/forgot", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  try {
    const [user] = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!));

    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await db
      .update(usersTable)
      .set({ tpinResetToken: token, tpinResetTokenExpiry: expiry })
      .where(eq(usersTable.id, req.userId!));

    // Send email — non-blocking, don't fail request if email fails
    sendTpinResetEmail(user.email, user.name, token).catch((err) =>
      console.error("[MAILER] Failed to send T-PIN reset email:", err)
    );

    res.json({ ok: true, message: "A secure T-PIN reset link has been sent to your registered email address." });
  } catch (err: any) {
    console.error("[TPIN] forgot error:", err);
    res.status(500).json({ error: "Failed to send reset email. Please try again." });
  }
});

// ── POST /api/tpin/reset ──────────────────────────────────────────────────────
// Public endpoint — verifies token and sets new T-PIN
const resetBody = z.object({
  token: z.string().min(1),
  pin: z.string().regex(/^[0-9]{4,6}$/, "T-PIN must be 4-6 digits"),
});
router.post("/tpin/reset", async (req, res): Promise<void> => {
  const parsed = resetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
    return;
  }

  const { token, pin } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.tpinResetToken, token));

  if (!user || !user.tpinResetTokenExpiry) {
    res.status(400).json({ error: "Invalid or expired reset link. Please request a new one." });
    return;
  }

  if (user.tpinResetTokenExpiry < new Date()) {
    res.status(400).json({ error: "This reset link has expired (valid for 15 minutes). Please request a new one." });
    return;
  }

  // Set new T-PIN (overwrite existing hash directly)
  await setTpin(user.id, pin);

  // Invalidate token
  await db
    .update(usersTable)
    .set({ tpinResetToken: null, tpinResetTokenExpiry: null })
    .where(eq(usersTable.id, user.id));

  res.json({ ok: true, message: "T-PIN reset successfully." });
});

// ── GET /api/tpin/verify-reset-token ─────────────────────────────────────────
// Frontend uses this to validate token before showing the form
router.get("/tpin/verify-reset-token", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : null;
  if (!token) {
    res.status(400).json({ valid: false, error: "Token is required." });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, tpinResetTokenExpiry: usersTable.tpinResetTokenExpiry })
    .from(usersTable)
    .where(eq(usersTable.tpinResetToken, token));

  if (!user || !user.tpinResetTokenExpiry) {
    res.json({ valid: false, error: "Invalid or expired link." });
    return;
  }

  if (user.tpinResetTokenExpiry < new Date()) {
    res.json({ valid: false, error: "This link has expired. Please request a new one." });
    return;
  }

  res.json({ valid: true });
});

export default router;
void isValidPinFormat;
