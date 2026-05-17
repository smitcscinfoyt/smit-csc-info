/**
 * Coupon engine — validate, compute discount, redeem.
 *
 * Coupons are time-limited (validFrom/validUntil) and auto-disable when expired.
 * Discount types:
 *   - "percent" → discountValue is 0–100 (% off)
 *   - "fixed"   → discountValue is paise off
 *
 * Scope:
 *   - "operator"   → operator-tier upgrade plans (gold/premium)
 *   - "prime"      → prime content subscription (monthly/quarterly/yearly)
 *
 * applicablePlans is a comma-separated list of plan ids ("*" for all).
 */
import { db, couponsTable, couponRedemptionsTable, type Coupon } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

export type CouponScope = "operator" | "prime";

export interface CouponValidation {
  ok: boolean;
  reason?: string;
  coupon?: Coupon;
  discountPaise?: number;
  finalPaise?: number;
}

function parsePlans(csv: string): string[] {
  return csv.split(",").map((s) => s.trim()).filter(Boolean);
}

export function planAllowed(coupon: Coupon, planId: string): boolean {
  const list = parsePlans(coupon.applicablePlans);
  if (list.length === 0 || list.includes("*")) return true;
  return list.includes(planId);
}

export function computeDiscountPaise(coupon: Coupon, basePaise: number): number {
  if (coupon.discountType === "percent") {
    const pct = Math.max(0, Math.min(100, coupon.discountValue));
    return Math.floor((basePaise * pct) / 100);
  }
  // fixed paise
  return Math.max(0, Math.min(basePaise, coupon.discountValue));
}

export async function validateCoupon(opts: {
  code: string;
  userId: number;
  scope: CouponScope;
  planId: string;
  basePaise: number;
}): Promise<CouponValidation> {
  const code = opts.code.trim().toUpperCase();
  if (!code) return { ok: false, reason: "Enter a coupon code" };

  const [c] = await db.select().from(couponsTable).where(eq(couponsTable.code, code)).limit(1);
  if (!c) return { ok: false, reason: "Invalid coupon code" };

  const now = new Date();
  if (!c.isActive) return { ok: false, reason: "This coupon is disabled" };
  if (now < c.validFrom) return { ok: false, reason: "Coupon is not yet active" };
  if (now > c.validUntil) return { ok: false, reason: "Coupon has expired" };
  if (!planAllowed(c, opts.planId)) return { ok: false, reason: "Coupon not valid for this plan" };
  if (opts.basePaise < c.minOrderPaise) {
    return { ok: false, reason: `Minimum order ₹${(c.minOrderPaise / 100).toFixed(0)} required` };
  }
  if (c.maxUses != null && c.usedCount >= c.maxUses) {
    return { ok: false, reason: "Coupon usage limit reached" };
  }

  // Per-user limit (count successful redemptions only)
  if (c.perUserLimit > 0) {
    const [{ cnt }] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(couponRedemptionsTable)
      .where(and(eq(couponRedemptionsTable.couponId, c.id), eq(couponRedemptionsTable.userId, opts.userId)));
    if (Number(cnt) >= c.perUserLimit) {
      return { ok: false, reason: "You have already used this coupon" };
    }
  }

  const discountPaise = computeDiscountPaise(c, opts.basePaise);
  const finalPaise = Math.max(0, opts.basePaise - discountPaise);
  return { ok: true, coupon: c, discountPaise, finalPaise };
}

/**
 * Records a redemption + bumps usedCount.
 * Idempotent on transactionId (unique constraint).
 * Logs (but does NOT fail) if maxUses was already hit at settlement time —
 * the user has already paid by this point, so we honour their purchase.
 */
export async function recordRedemption(opts: {
  couponId: number;
  userId: number;
  scope: CouponScope;
  planId: string;
  transactionId: string;
  discountPaise: number;
  finalAmountPaise: number;
}): Promise<{ recorded: boolean; overLimit: boolean }> {
  try {
    const inserted = await db.insert(couponRedemptionsTable).values({
      couponId: opts.couponId,
      userId: opts.userId,
      scope: opts.scope,
      planId: opts.planId,
      transactionId: opts.transactionId,
      discountPaise: opts.discountPaise,
      finalAmountPaise: opts.finalAmountPaise,
    }).onConflictDoNothing({ target: couponRedemptionsTable.transactionId }).returning({ id: couponRedemptionsTable.id });

    if (inserted.length === 0) {
      // Already recorded for this transactionId (idempotent no-op).
      return { recorded: false, overLimit: false };
    }

    // Conditional increment: only bump if still under maxUses (or unlimited).
    // Returns the row when incremented; empty array means cap was hit.
    const bumped = await db
      .update(couponsTable)
      .set({ usedCount: sql`${couponsTable.usedCount} + 1`, updatedAt: new Date() })
      .where(sql`${couponsTable.id} = ${opts.couponId} AND (${couponsTable.maxUses} IS NULL OR ${couponsTable.usedCount} < ${couponsTable.maxUses})`)
      .returning({ id: couponsTable.id });

    return { recorded: true, overLimit: bumped.length === 0 };
  } catch (err) {
    // Re-throw real errors so callers can log/retry instead of silently dropping.
    throw err;
  }
}
