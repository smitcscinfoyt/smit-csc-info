import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db, usersTable, paymentsTable, contentTable, operatorMembershipPaymentsTable } from "@workspace/db";
import { eq, count, sum, gte, desc, and, ne } from "drizzle-orm";
import {
  requireAdmin,
  requireAdminOrManager,
  invalidateUserActiveCache,
  type AuthRequest,
} from "../lib/auth";
import {
  requireSuperAdmin,
  isSuperAdminEmail,
  getUserEmail,
} from "../lib/super-admins";
import { sendPasswordResetEmail } from "../lib/mailer";
import { syncYoutubeChannel } from "../lib/youtube-sync";
import { logger } from "../lib/logger";
import { z } from "zod";
import {
  AdminGetUsersQueryParams,
  AdminGetUsersResponse,
  AdminGetPaymentsResponse,
  AdminCreateContentBody,
  AdminUpdateContentBody,
  AdminUpdateContentParams,
  AdminDeleteContentParams,
  AdminGetStatsResponse,
} from "@workspace/api-zod";

const router = Router();

router.get("/admin/users", requireAdminOrManager, async (req: AuthRequest, res): Promise<void> => {
  const parsed = AdminGetUsersQueryParams.safeParse(req.query);
  const page = parsed.success && parsed.data.page ? parsed.data.page : 1;
  const limit = parsed.success && parsed.data.limit ? parsed.data.limit : 20;
  const offset = (page - 1) * limit;

  // Hide soft-deleted accounts from the admin user list. Their
  // financial records still exist in payments / wallet / recharge
  // tables (kept for RBI / NPCI / GST retention), but the user row
  // itself is anonymized and login-blocked.
  const [{ total }] = await db
    .select({ total: count() })
    .from(usersTable)
    .where(eq(usersTable.isDeleted, false));

  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.isDeleted, false))
    .orderBy(desc(usersTable.createdAt))
    .limit(limit)
    .offset(offset);

  const primeUserIds = new Set(
    (await db
      .select({ userId: paymentsTable.userId })
      .from(paymentsTable)
      .where(eq(paymentsTable.status, "success"))
    ).map((p) => p.userId)
  );

  res.json(
    AdminGetUsersResponse.parse({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        mobile: u.mobile,
        role: u.role,
        createdAt: u.createdAt.toISOString(),
        isPrime: primeUserIds.has(u.id),
      })),
      total,
      page,
      limit,
    })
  );
});

// ─── DELETE /admin/users/:id — super-admin only ──────────────────────────────
// Permanently removes a user account. Restricted to the hard-coded
// super-admin allowlist (see lib/super-admins.ts). Defends against:
//   • self-deletion (would lock the caller out of their own account)
//   • deleting another super-admin (mutually-protected accounts)
router.delete(
  "/admin/users/:id",
  requireSuperAdmin,
  async (req: AuthRequest, res): Promise<void> => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    if (id === req.userId) {
      res.status(400).json({ error: "You cannot delete your own account" });
      return;
    }
    const targetEmail = await getUserEmail(id);
    if (!targetEmail) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (isSuperAdminEmail(targetEmail)) {
      res
        .status(403)
        .json({ error: "Super-admin accounts cannot be deleted" });
      return;
    }
    // Hybrid delete strategy:
    //   1. Try a hard delete — clean removal for users with no
    //      financial activity (no payments / wallet / recharges).
    //   2. If Postgres rejects with FK violation (23503), the user
    //      has referenced records that we are *legally required to
    //      keep* (RBI: KYC 5 yr, NPCI: money-transfer 8 yr, GST
    //      audit etc. — see Privacy/ToS). Fall back to a soft
    //      delete that:
    //        • blocks future login
    //        • frees the email/mobile for reuse (anonymized)
    //        • preserves all financial / audit records intact
    try {
      await db.delete(usersTable).where(eq(usersTable.id, id));
      invalidateUserActiveCache(id);
      res.json({ success: true, deletedId: id, mode: "hard" });
      return;
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code !== "23503") throw err;
    }

    // Soft-delete fallback. Anonymize PII so the original
    // email/mobile become reusable, and rotate the password hash
    // to a random value so the old credentials are useless even
    // if `isDeleted` is somehow bypassed.
    const anonEmail = `deleted_${id}_${Date.now()}@deleted.local`;
    const randomHash = await bcrypt.hash(crypto.randomUUID(), 10);
    const updated = await db
      .update(usersTable)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        email: anonEmail,
        mobile: null,
        passwordHash: randomHash,
        resetToken: null,
        resetTokenExpiry: null,
        verificationToken: null,
      })
      .where(eq(usersTable.id, id))
      .returning({ id: usersTable.id });

    if (updated.length === 0) {
      // Race: row vanished between FK failure and update
      res.status(404).json({ error: "User not found" });
      return;
    }

    invalidateUserActiveCache(id);
    req.log.info({ targetUserId: id, by: req.userId }, "user soft-deleted");
    res.json({
      success: true,
      deletedId: id,
      mode: "soft",
      message:
        "User had financial / audit records (payments, wallet, recharges or KYC). Account has been deactivated and PII anonymized; financial history is preserved per RBI / NPCI retention rules.",
    });
  },
);

router.patch("/admin/users/:id/role", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const RoleBody = z.object({ role: z.enum(["user", "manager", "admin"]) });
  const parsed = RoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ role: parsed.data.role })
    .where(eq(usersTable.id, id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ id: user.id, name: user.name, role: user.role });
});

router.get("/admin/payments", requireAdminOrManager, async (_req, res): Promise<void> => {
  const payments = await db
    .select()
    .from(paymentsTable)
    .orderBy(desc(paymentsTable.createdAt));

  res.json(
    AdminGetPaymentsResponse.parse(
      payments.map((p) => ({
        id: p.id,
        userId: p.userId,
        amount: p.amount,
        plan: p.plan,
        transactionId: p.transactionId,
        status: p.status,
        expiryDate: p.expiryDate ? p.expiryDate.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
      }))
    )
  );
});

router.post("/admin/content", requireAdminOrManager, async (req, res): Promise<void> => {
  const parsed = AdminCreateContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db.insert(contentTable).values(parsed.data).returning();

  res.status(201).json({
    id: item.id,
    title: item.title,
    titleGu: item.titleGu,
    category: item.category,
    type: item.type,
    link: item.link,
    description: item.description,
    isPrime: item.isPrime,
    thumbnailUrl: item.thumbnailUrl,
    createdAt: item.createdAt.toISOString(),
  });
});

router.patch("/admin/content/:id", requireAdminOrManager, async (req, res): Promise<void> => {
  const paramsParsed = AdminUpdateContentParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = AdminUpdateContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .update(contentTable)
    .set(parsed.data)
    .where(eq(contentTable.id, paramsParsed.data.id))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Content not found" });
    return;
  }

  res.json({
    id: item.id,
    title: item.title,
    titleGu: item.titleGu,
    category: item.category,
    type: item.type,
    link: item.link,
    description: item.description,
    isPrime: item.isPrime,
    thumbnailUrl: item.thumbnailUrl,
    createdAt: item.createdAt.toISOString(),
  });
});

router.post("/admin/content/sync-youtube", requireAdminOrManager, async (_req, res): Promise<void> => {
  try {
    const result = await syncYoutubeChannel();
    res.json({
      success: true,
      playlists: result.playlists,
      videos: result.videos,
      inserted: result.inserted,
      updated: result.updated,
      message: `Synced ${result.videos} videos across ${result.playlists} playlists (${result.inserted} new, ${result.updated} updated).`,
    });
  } catch (e: any) {
    logger.error({ err: e?.message, stack: e?.stack }, "[admin] youtube sync failed");
    res.status(500).json({ error: e?.message || "YouTube sync failed" });
  }
});

router.delete("/admin/content/:id", requireAdminOrManager, async (req, res): Promise<void> => {
  const paramsParsed = AdminDeleteContentParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  await db.delete(contentTable).where(eq(contentTable.id, paramsParsed.data.id));

  res.json({ success: true, message: "Content deleted" });
});


router.get("/admin/stats", requireAdminOrManager, async (_req, res): Promise<void> => {
  const [{ totalUsers }] = await db
    .select({ totalUsers: count() })
    .from(usersTable);

  // Active = Prime success payment users
  const [{ primeActive }] = await db
    .select({ primeActive: count() })
    .from(paymentsTable)
    .where(eq(paymentsTable.status, "success"));

  // Active = users with paid operator tier (gold/premium)
  const [{ operatorActive }] = await db
    .select({ operatorActive: count() })
    .from(usersTable)
    .where(ne(usersTable.operatorTier, "free"));

  // Prime revenue (rupees)
  const [{ primeRevenue }] = await db
    .select({ primeRevenue: sum(paymentsTable.amount) })
    .from(paymentsTable)
    .where(eq(paymentsTable.status, "success"));

  // Operator membership revenue (paise → rupees)
  const [{ opRevenuePaise }] = await db
    .select({ opRevenuePaise: sum(operatorMembershipPaymentsTable.amountPaise) })
    .from(operatorMembershipPaymentsTable)
    .where(eq(operatorMembershipPaymentsTable.status, "success"));

  const [{ totalContent }] = await db
    .select({ totalContent: count() })
    .from(contentTable);

  const activeMembers  = Number(primeActive) + Number(operatorActive);
  const totalRevenue   = Number(primeRevenue ?? 0) + Number(opRevenuePaise ?? 0) / 100;

  res.json({
    data: {
      totalUsers,
      activeMembers,
      totalRevenue,
      totalContent,
    },
  });
});

// ── Grant Prime Membership by Email (Admin only) ────────────────────────────

const GrantPrimeBody = z.object({
  email: z.string().email(),
  days: z.number().int().min(1).max(365).optional().default(30),
  plan: z.string().optional().default("Manual Grant"),
});

router.post("/admin/grant-prime", requireAdmin, async (req, res): Promise<void> => {
  const parsed = GrantPrimeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "email is required and must be valid", details: parsed.error.flatten() });
    return;
  }

  const { email, days, plan } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(404).json({ error: `No user found with email: ${email}` });
    return;
  }

  const now = new Date();
  const expiryDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const transactionId = `MANUAL_GRANT_${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 15)}`;

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      userId: user.id,
      amount: 0,
      plan,
      transactionId,
      status: "success",
      expiryDate,
      createdAt: now,
    })
    .returning();

  res.status(201).json({
    success: true,
    message: `Prime membership granted to ${user.name} (${user.email}) for ${days} days`,
    user: { id: user.id, name: user.name, email: user.email },
    membership: {
      plan: payment.plan,
      grantedAt: payment.createdAt!.toISOString(),
      expiresAt: payment.expiryDate!.toISOString(),
      daysGranted: days,
      transactionId: payment.transactionId,
    },
  });
});

// ── Revoke Prime Membership by Email (Admin only) ───────────────────────────

router.post("/admin/revoke-prime", requireAdmin, async (req, res): Promise<void> => {
  const body = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, body.data.email));
  if (!user) {
    res.status(404).json({ error: `No user found with email: ${body.data.email}` });
    return;
  }

  const now = new Date();

  await db
    .update(paymentsTable)
    .set({ expiryDate: now })
    .where(
      and(
        eq(paymentsTable.userId, user.id),
        eq(paymentsTable.status, "success"),
        gte(paymentsTable.expiryDate, now)
      )
    );

  res.json({
    success: true,
    message: `Prime membership revoked for ${user.name} (${user.email})`,
  });
});

// ── Admin-triggered Password Reset ─────────────────────────────────────────
// Generates a fresh reset token, persists it, and emails the user a link.
// Reuses the same token mechanism as POST /auth/forgot-password.
router.post("/admin/users/:id/reset-password", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db
    .update(usersTable)
    .set({ resetToken, resetTokenExpiry })
    .where(eq(usersTable.id, user.id));

  sendPasswordResetEmail(user.email, user.name, resetToken).catch((err) =>
    console.error("[admin-reset-password] mailer failed:", err)
  );

  res.json({
    success: true,
    message: `Password reset email sent to ${user.email}`,
  });
});

export default router;
