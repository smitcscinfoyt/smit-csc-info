import { Router } from "express";
import { z } from "zod";
import { db, rechargesTable, walletsTable, walletLedgerTable, walletTopupsTable, commissionSlabsTable, usersTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAdmin, type AuthRequest } from "../lib/auth";
import { creditWallet, debitWallet } from "../lib/wallet-engine";
import { getGlobalSettings, updateGlobalSettings, ensureDefaultSlabs, resetSlabsToDefaults } from "../lib/recharge-config";
import { getBalance as getA1Balance, isA1TopupConfigured } from "../lib/a1topup";

const router = Router();

// ─── GET /admin/recharge — list all recharges with filters ───────────────────
router.get("/admin/recharge", requireAdmin, async (req: AuthRequest, res) => {
  const status = req.query.status ? String(req.query.status) : null;
  const limit = Math.min(parseInt(String(req.query.limit ?? "100")) || 100, 500);
  const where = status ? eq(rechargesTable.status, status) : undefined;
  const rows = await db.select({
    r: rechargesTable,
    user: { id: usersTable.id, name: usersTable.name, email: usersTable.email, mobile: usersTable.mobile },
  })
  .from(rechargesTable)
  .innerJoin(usersTable, eq(rechargesTable.userId, usersTable.id))
  .where(where)
  .orderBy(desc(rechargesTable.createdAt))
  .limit(limit);
  res.json({
    items: rows.map((row) => ({
      id: row.r.id,
      user: row.user,
      type: row.r.type,
      operatorName: row.r.operatorName,
      operatorCode: row.r.operatorCode,
      accountNumber: row.r.accountNumber,
      amountPaise: Number(row.r.amountPaise),
      commissionPaise: Number(row.r.commissionPaise),
      tier: row.r.commissionTier,
      status: row.r.status,
      a1RequestId: row.r.a1RequestId,
      a1OrderId: row.r.a1OrderId,
      a1OperatorRef: row.r.a1OperatorRef,
      errorReason: row.r.errorReason,
      createdAt: row.r.createdAt.toISOString(),
      completedAt: row.r.completedAt ? row.r.completedAt.toISOString() : null,
    })),
  });
});

// ─── ADMIN: manual refund (force) ────────────────────────────────────────────
router.post("/admin/recharge/:id/refund", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const reason = String((req.body && req.body.reason) ?? "Admin manual refund").slice(0, 500);
  const [row] = await db.select().from(rechargesTable).where(eq(rechargesTable.id, id));
  if (!row) { res.status(404).json({ error: "Recharge not found" }); return; }
  if (row.status === "refunded") { res.status(409).json({ error: "Already refunded" }); return; }
  if (!row.debitLedgerId) { res.status(400).json({ error: "No debit to refund" }); return; }

  const credit = await creditWallet(row.userId, {
    type: "recharge_refund",
    amountPaise: Number(row.amountPaise),
    refType: "recharge",
    refId: row.id,
    refCode: row.a1RequestId,
    note: `Admin refund: ${reason}`,
  });
  // Reverse commission if it was credited
  if (row.status === "success" && Number(row.commissionPaise) > 0 && row.commissionLedgerId) {
    try {
      await debitWallet(row.userId, {
        type: "reversal",
        amountPaise: Number(row.commissionPaise),
        refType: "recharge",
        refId: row.id,
        refCode: row.a1RequestId,
        note: `Commission reversal (refund)`,
      });
    } catch {/* best-effort */}
  }
  await db.update(rechargesTable).set({
    status: "refunded",
    refundLedgerId: credit.ledgerEntryId,
    errorReason: reason,
    updatedAt: new Date(),
    completedAt: new Date(),
  }).where(eq(rechargesTable.id, id));
  res.json({ ok: true });
});

// ─── ADMIN: list/update commission slabs ─────────────────────────────────────
router.get("/admin/commission-slabs", requireAdmin, async (_req, res) => {
  await ensureDefaultSlabs();
  const slabs = await db.select().from(commissionSlabsTable).orderBy(commissionSlabsTable.type, commissionSlabsTable.tier);
  res.json({ slabs: slabs.map((s) => ({
    id: s.id, type: s.type, operatorCode: s.operatorCode, tier: s.tier,
    percentBp: s.percentBp,
    minAmountPaise: Number(s.minAmountPaise),
    maxAmountPaise: Number(s.maxAmountPaise),
    isActive: !!s.isActive,
  })) });
});

const slabBody = z.object({
  type: z.enum(["mobile", "dth", "bill"]),
  operatorCode: z.string().min(1).default("*"),
  tier: z.enum(["base", "free", "prime", "premium"]).default("base"),
  percentBp: z.number().int().min(0).max(5000),
  minAmountPaise: z.number().int().min(0).default(1000),
  maxAmountPaise: z.number().int().min(0).default(500000),
  isActive: z.boolean().default(true),
});

router.post("/admin/commission-slabs", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const parsed = slabBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.format() }); return; }
  const d = parsed.data;
  const [row] = await db.insert(commissionSlabsTable).values({
    type: d.type, operatorCode: d.operatorCode, tier: d.tier, percentBp: d.percentBp,
    minAmountPaise: d.minAmountPaise, maxAmountPaise: d.maxAmountPaise,
    isActive: d.isActive ? 1 : 0, updatedBy: req.userId,
  }).returning();
  res.json({ id: row.id });
});

router.patch("/admin/commission-slabs/:id", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const parsed = slabBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.format() }); return; }
  const d = parsed.data;
  await db.update(commissionSlabsTable).set({
    ...(d.type ? { type: d.type } : {}),
    ...(d.operatorCode ? { operatorCode: d.operatorCode } : {}),
    ...(d.tier ? { tier: d.tier } : {}),
    ...(d.percentBp !== undefined ? { percentBp: d.percentBp } : {}),
    ...(d.minAmountPaise !== undefined ? { minAmountPaise: d.minAmountPaise } : {}),
    ...(d.maxAmountPaise !== undefined ? { maxAmountPaise: d.maxAmountPaise } : {}),
    ...(d.isActive !== undefined ? { isActive: d.isActive ? 1 : 0 } : {}),
    updatedBy: req.userId, updatedAt: new Date(),
  }).where(eq(commissionSlabsTable.id, id));
  res.json({ ok: true });
});

router.delete("/admin/commission-slabs/:id", requireAdmin, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  await db.delete(commissionSlabsTable).where(eq(commissionSlabsTable.id, id));
  res.json({ ok: true });
});

router.post("/admin/commission-slabs/reset", requireAdmin, async (_req: AuthRequest, res) => {
  await resetSlabsToDefaults();
  res.json({ ok: true });
});

// ─── ADMIN: settings get/set ─────────────────────────────────────────────────
router.get("/admin/recharge-settings", requireAdmin, async (_req, res) => {
  const s = await getGlobalSettings();
  let providerBalance: number | null = null;
  let providerOk = false;
  if (isA1TopupConfigured()) {
    try { const b = await getA1Balance(); providerBalance = b.balance; providerOk = true; }
    catch { providerOk = false; }
  }
  res.json({ ...s, providerConfigured: isA1TopupConfigured(), providerOk, providerBalance });
});

router.patch("/admin/recharge-settings", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const parsed = z.object({
    rechargeEnabled: z.boolean().optional(),
    mobileEnabled: z.boolean().optional(),
    dthEnabled: z.boolean().optional(),
    billEnabled: z.boolean().optional(),
    walletCapNoKycPaise: z.number().int().positive().optional(),
    walletCapKycPaise: z.number().int().positive().optional(),
    minRechargePaise: z.number().int().positive().optional(),
    maxRechargePaise: z.number().int().positive().optional(),
    minTopupPaise: z.number().int().positive().optional(),
    maxTopupPaise: z.number().int().positive().optional(),
    dailyRechargeCountLimit: z.number().int().positive().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.format() }); return; }
  const next = await updateGlobalSettings(parsed.data, req.userId!);
  res.json(next);
});

// ─── ADMIN: wallet view + manual adjust ──────────────────────────────────────
router.get("/admin/wallets", requireAdmin, async (req: AuthRequest, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100")) || 100, 500);
  const rows = await db.select({
    w: walletsTable,
    user: { id: usersTable.id, name: usersTable.name, email: usersTable.email, mobile: usersTable.mobile },
  })
  .from(walletsTable)
  .innerJoin(usersTable, eq(walletsTable.userId, usersTable.id))
  .orderBy(desc(walletsTable.balancePaise))
  .limit(limit);
  res.json({
    items: rows.map((r) => ({
      id: r.w.id, userId: r.w.userId, user: r.user,
      balancePaise: Number(r.w.balancePaise),
      kycLevel: r.w.kycLevel, isFrozen: !!r.w.isFrozen, freezeReason: r.w.freezeReason,
      updatedAt: r.w.updatedAt.toISOString(),
    })),
  });
});

router.post("/admin/wallets/:userId/adjust", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const userId = parseInt(String(req.params.userId), 10);
  const parsed = z.object({
    direction: z.enum(["credit", "debit"]),
    amountPaise: z.number().int().positive(),
    reason: z.string().min(3).max(500),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.format() }); return; }
  const { direction, amountPaise, reason } = parsed.data;
  try {
    const r = direction === "credit"
      ? await creditWallet(userId, { type: "admin_credit", amountPaise, refType: "admin", refId: req.userId, note: reason })
      : await debitWallet(userId, { type: "admin_debit", amountPaise, refType: "admin", refId: req.userId, note: reason });
    res.json({ ok: true, balancePaise: r.balancePaise, ledgerEntryId: r.ledgerEntryId });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? "Adjust failed", code: err?.code });
  }
});

router.post("/admin/wallets/:userId/freeze", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const userId = parseInt(String(req.params.userId), 10);
  const reason = String((req.body && req.body.reason) ?? "Frozen by admin").slice(0, 255);
  await db.update(walletsTable).set({ isFrozen: 1, freezeReason: reason, updatedAt: new Date() }).where(eq(walletsTable.userId, userId));
  res.json({ ok: true });
});
router.post("/admin/wallets/:userId/unfreeze", requireAdmin, async (req: AuthRequest, res) => {
  const userId = parseInt(String(req.params.userId), 10);
  await db.update(walletsTable).set({ isFrozen: 0, freezeReason: null, updatedAt: new Date() }).where(eq(walletsTable.userId, userId));
  res.json({ ok: true });
});

// ─── ADMIN: stats ────────────────────────────────────────────────────────────
// ─── Manual wallet top-up moderation ─────────────────────────────────────────
router.get("/admin/manual-topups", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const status = String(req.query.status ?? "awaiting_review");
  const limit = Math.min(parseInt(String(req.query.limit ?? "100")) || 100, 500);
  const rows = await db
    .select({
      id: walletTopupsTable.id,
      transactionId: walletTopupsTable.transactionId,
      userId: walletTopupsTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
      userMobile: usersTable.mobile,
      amountPaise: walletTopupsTable.amountPaise,
      method: walletTopupsTable.method,
      channel: walletTopupsTable.channel,
      utr: walletTopupsTable.utr,
      proofUrl: walletTopupsTable.proofUrl,
      userNote: walletTopupsTable.userNote,
      adminNote: walletTopupsTable.adminNote,
      status: walletTopupsTable.status,
      createdAt: walletTopupsTable.createdAt,
      reviewedAt: walletTopupsTable.reviewedAt,
    })
    .from(walletTopupsTable)
    .leftJoin(usersTable, eq(usersTable.id, walletTopupsTable.userId))
    .where(and(
      eq(walletTopupsTable.status, status),
      sql`${walletTopupsTable.method} != 'phonepe'`,
    ))
    .orderBy(desc(walletTopupsTable.createdAt))
    .limit(limit);
  res.json({
    items: rows.map((r) => ({
      ...r,
      amountPaise: Number(r.amountPaise),
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    })),
  });
});

const reviewBody = z.object({ note: z.string().trim().max(500).optional() });

router.post("/admin/manual-topups/:id/approve", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = reviewBody.safeParse(req.body ?? {});
  const note = parsed.success ? (parsed.data.note ?? null) : null;
  const adminId = req.userId!;

  const [t] = await db.select().from(walletTopupsTable).where(eq(walletTopupsTable.id, id));
  if (!t) { res.status(404).json({ error: "Top-up not found" }); return; }
  if (t.status === "success") { res.json({ ok: true, alreadyApproved: true }); return; }
  if (t.status !== "awaiting_review") { res.status(400).json({ error: `Cannot approve from status ${t.status}` }); return; }

  // Atomically claim the row before crediting
  const [claimed] = await db
    .update(walletTopupsTable)
    .set({ status: "success", completedAt: new Date(), reviewedAt: new Date(), reviewedBy: adminId, adminNote: note, updatedAt: new Date() })
    .where(and(eq(walletTopupsTable.id, id), eq(walletTopupsTable.status, "awaiting_review")))
    .returning();
  if (!claimed) { res.status(409).json({ error: "Already processed" }); return; }

  try {
    const credit = await creditWallet(t.userId, {
      type: "topup",
      amountPaise: Number(t.amountPaise),
      refType: "wallet_topup",
      refId: t.id,
      refCode: t.transactionId,
      note: `Manual top-up (${t.method}) UTR ${t.utr ?? ""}`,
    });
    await db.update(walletTopupsTable)
      .set({ ledgerEntryId: credit.ledgerEntryId, updatedAt: new Date() })
      .where(eq(walletTopupsTable.id, id));

    // ── Fire-and-forget wallet topup success email to member ──────────────
    void (async () => {
      try {
        const { sendWalletTopupSuccessEmail } = await import("../lib/mailer");
        const [u] = await db.select().from(usersTable).where(eq(usersTable.id, t.userId));
        const toEmail = (u?.email ?? "").trim();
        if (toEmail) {
          await sendWalletTopupSuccessEmail({
            toEmail,
            toName: u?.name || "Member",
            amountPaise: Number(t.amountPaise),
            transactionId: t.transactionId,
            completedAt: new Date(),
            method: t.method ?? "Manual",
            newBalancePaise: credit.balancePaise,
          });
        }
      } catch (e: any) {
        req.log.error({ err: e?.message }, "[admin/manual-topup] email failed");
      }
    })();

    res.json({ ok: true, balancePaise: credit.balancePaise });
  } catch (err: any) {
    // Roll back status so admin can retry
    await db.update(walletTopupsTable)
      .set({ status: "awaiting_review", completedAt: null, reviewedAt: null, reviewedBy: null, adminNote: null, updatedAt: new Date() })
      .where(eq(walletTopupsTable.id, id));
    req.log.error({ err, id }, "[admin/manual-topup] credit failed");
    res.status(500).json({ error: err?.message ?? "Credit failed" });
  }
});

router.post("/admin/manual-topups/:id/reject", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = reviewBody.safeParse(req.body ?? {});
  const reason = parsed.success ? (parsed.data.note ?? "Rejected by admin") : "Rejected by admin";
  const adminId = req.userId!;
  const [updated] = await db.update(walletTopupsTable)
    .set({ status: "rejected", errorReason: reason, adminNote: reason, reviewedAt: new Date(), reviewedBy: adminId, updatedAt: new Date() })
    .where(and(eq(walletTopupsTable.id, id), eq(walletTopupsTable.status, "awaiting_review")))
    .returning();
  if (!updated) { res.status(409).json({ error: "Not pending review" }); return; }
  res.json({ ok: true });
});

router.get("/admin/recharge-stats", requireAdmin, async (_req, res) => {
  const stats = await db.select({
    status: rechargesTable.status,
    count: sql<number>`count(*)::int`,
    sumPaise: sql<number>`coalesce(sum(${rechargesTable.amountPaise}), 0)::bigint`,
    commissionPaise: sql<number>`coalesce(sum(${rechargesTable.commissionPaise}), 0)::bigint`,
  }).from(rechargesTable).groupBy(rechargesTable.status);
  res.json({
    byStatus: stats.map((s) => ({
      status: s.status,
      count: Number(s.count),
      sumPaise: Number(s.sumPaise),
      commissionPaise: Number(s.commissionPaise),
    })),
  });
});

export default router;
void walletLedgerTable; void walletTopupsTable; void and;
