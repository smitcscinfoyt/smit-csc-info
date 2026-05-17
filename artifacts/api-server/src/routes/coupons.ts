/**
 * Coupons:
 *   POST /api/coupons/validate           — auth, validate code for a plan
 *   GET  /api/admin/coupons              — list all
 *   POST /api/admin/coupons              — create
 *   PATCH /api/admin/coupons/:id         — update
 *   DELETE /api/admin/coupons/:id        — delete
 */
import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, couponsTable, couponRedemptionsTable, paymentsTable, operatorMembershipPaymentsTable } from "@workspace/db";
import { requireAuth, requireAdmin, type AuthRequest } from "../lib/auth";
import { validateCoupon, type CouponScope } from "../lib/coupons";
import { OPERATOR_PLANS } from "../lib/operator-tier";

const router = Router();

const PRIME_PLAN_PRICES_PAISE: Record<string, number> = {
  monthly: 29900,
  quarterly: 79900,
  yearly: 249900,
};

function basePaiseFor(scope: CouponScope, planId: string): number | null {
  if (scope === "operator") {
    const p = OPERATOR_PLANS.find((x) => x.id === planId);
    return p ? p.pricePaise : null;
  }
  if (scope === "prime") {
    return PRIME_PLAN_PRICES_PAISE[planId] ?? null;
  }
  return null;
}

// ─── Public-auth: validate ───────────────────────────────────────────────────
router.post("/coupons/validate", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const parsed = z.object({
    code: z.string().min(1).max(40),
    scope: z.enum(["operator", "prime"]),
    planId: z.string().min(1).max(40),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ ok: false, reason: "Invalid input" }); return; }

  const basePaise = basePaiseFor(parsed.data.scope, parsed.data.planId);
  if (basePaise == null || basePaise <= 0) {
    res.status(400).json({ ok: false, reason: "Plan not eligible for coupon" });
    return;
  }

  const result = await validateCoupon({
    code: parsed.data.code,
    userId: req.userId!,
    scope: parsed.data.scope,
    planId: parsed.data.planId,
    basePaise,
  });

  if (!result.ok) {
    res.json({ ok: false, reason: result.reason });
    return;
  }
  res.json({
    ok: true,
    code: result.coupon!.code,
    description: result.coupon!.description ?? null,
    discountType: result.coupon!.discountType,
    discountValue: result.coupon!.discountValue,
    basePaise,
    discountPaise: result.discountPaise!,
    finalPaise: result.finalPaise!,
  });
});

// ─── Admin: list ─────────────────────────────────────────────────────────────
router.get("/admin/coupons", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(couponsTable).orderBy(desc(couponsTable.createdAt));
  const now = new Date();
  res.json({
    items: rows.map((c) => ({
      id: c.id,
      code: c.code,
      description: c.description,
      discountType: c.discountType,
      discountValue: c.discountValue,
      applicablePlans: c.applicablePlans,
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      perUserLimit: c.perUserLimit,
      minOrderPaise: Number(c.minOrderPaise),
      validFrom: c.validFrom.toISOString(),
      validUntil: c.validUntil.toISOString(),
      isActive: c.isActive,
      isLive: c.isActive && now >= c.validFrom && now <= c.validUntil && (c.maxUses == null || c.usedCount < c.maxUses),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  });
});

const couponBody = z.object({
  code: z.string().trim().min(2).max(40).transform((s) => s.toUpperCase()),
  description: z.string().max(500).optional().nullable(),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().int().min(1).max(1000000),
  applicablePlans: z.string().max(200).default("*"),
  maxUses: z.number().int().min(1).optional().nullable(),
  perUserLimit: z.number().int().min(0).default(1),
  minOrderPaise: z.number().int().min(0).default(0),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  isActive: z.boolean().default(true),
});

// ─── Admin: create ───────────────────────────────────────────────────────────
router.post("/admin/coupons", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const parsed = couponBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.format() }); return; }
  const d = parsed.data;
  if (new Date(d.validUntil) <= new Date(d.validFrom)) {
    res.status(400).json({ error: "validUntil must be after validFrom" });
    return;
  }
  if (d.discountType === "percent" && d.discountValue > 100) {
    res.status(400).json({ error: "Percent discount cannot exceed 100" });
    return;
  }
  try {
    const [row] = await db.insert(couponsTable).values({
      code: d.code,
      description: d.description ?? null,
      discountType: d.discountType,
      discountValue: d.discountValue,
      applicablePlans: d.applicablePlans,
      maxUses: d.maxUses ?? null,
      perUserLimit: d.perUserLimit,
      minOrderPaise: d.minOrderPaise,
      validFrom: new Date(d.validFrom),
      validUntil: new Date(d.validUntil),
      isActive: d.isActive,
      createdBy: req.userId,
    }).returning();
    res.json({ id: row.id });
  } catch (err: any) {
    if (String(err?.code) === "23505") {
      res.status(409).json({ error: "Coupon code already exists" });
      return;
    }
    throw err;
  }
});

// ─── Admin: update ───────────────────────────────────────────────────────────
router.patch("/admin/coupons/:id", requireAdmin, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = couponBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.format() }); return; }
  const d = parsed.data;
  await db.update(couponsTable).set({
    ...(d.code ? { code: d.code } : {}),
    ...(d.description !== undefined ? { description: d.description } : {}),
    ...(d.discountType ? { discountType: d.discountType } : {}),
    ...(d.discountValue !== undefined ? { discountValue: d.discountValue } : {}),
    ...(d.applicablePlans ? { applicablePlans: d.applicablePlans } : {}),
    ...(d.maxUses !== undefined ? { maxUses: d.maxUses } : {}),
    ...(d.perUserLimit !== undefined ? { perUserLimit: d.perUserLimit } : {}),
    ...(d.minOrderPaise !== undefined ? { minOrderPaise: d.minOrderPaise } : {}),
    ...(d.validFrom ? { validFrom: new Date(d.validFrom) } : {}),
    ...(d.validUntil ? { validUntil: new Date(d.validUntil) } : {}),
    ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
    updatedAt: new Date(),
  }).where(eq(couponsTable.id, id));
  res.json({ ok: true });
});

// ─── Admin: delete ───────────────────────────────────────────────────────────
router.delete("/admin/coupons/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  // Block delete if redemptions exist (preserve audit history)
  const [{ cnt }] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(couponRedemptionsTable)
    .where(eq(couponRedemptionsTable.couponId, id));
  if (Number(cnt) > 0) {
    res.status(400).json({ error: "Cannot delete coupon with redemption history. Deactivate instead." });
    return;
  }
  // Block delete if pending/success payments reference this coupon code —
  // otherwise their settlement would silently fail to record the redemption.
  const [c] = await db.select().from(couponsTable).where(eq(couponsTable.id, id));
  if (c) {
    const [{ pcnt }] = await db
      .select({ pcnt: sql<number>`count(*)::int` })
      .from(paymentsTable)
      .where(eq(paymentsTable.couponCode, c.code));
    const [{ ocnt }] = await db
      .select({ ocnt: sql<number>`count(*)::int` })
      .from(operatorMembershipPaymentsTable)
      .where(eq(operatorMembershipPaymentsTable.couponCode, c.code));
    if (Number(pcnt) + Number(ocnt) > 0) {
      res.status(400).json({ error: "Cannot delete coupon referenced by existing payments. Deactivate instead." });
      return;
    }
  }
  await db.delete(couponsTable).where(eq(couponsTable.id, id));
  res.json({ ok: true });
});

export default router;
void and;
