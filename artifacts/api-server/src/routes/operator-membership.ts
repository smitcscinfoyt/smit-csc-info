/**
 * Operator-tier membership: one-time lifetime upgrade to Gold/Premium for
 * higher recharge commissions. Distinct from "Prime" content subscription.
 *
 * Routes:
 *   GET  /operator-membership/plans   — list plans (public)
 *   GET  /operator-membership/status  — current user's tier (auth)
 *   POST /operator-membership/init    — start PhonePe payment for gold/premium
 *   ANY  /operator-membership/phonepe/callback — PhonePe redirect/webhook
 */
import { Router } from "express";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { db, usersTable, operatorMembershipPaymentsTable, couponsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { sendWelcomeEmail } from "../lib/emailService";
import {
  initiatePhonePePayment,
  checkPhonePeStatus,
  isPhonePeConfigured,
  getCallbackBaseUrl,
} from "../lib/phonepe";
import {
  OPERATOR_PLANS,
  getOperatorPlan,
  getUserOperatorTier,
  getEffectiveOperatorTier,
  type OperatorTier,
} from "../lib/operator-tier";
import { getPrimeStatus } from "../lib/prime-status";
import { validateCoupon, recordRedemption } from "../lib/coupons";
import { z } from "zod";

const router = Router();

const billingSchema = z.object({
  name: z.string().trim().min(2).max(100),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile"),
  email: z.string().trim().email().max(255),
  state: z.string().trim().min(2).max(80),
  district: z.string().trim().min(2).max(80),
}).optional();

function genTxn(userId: number): string {
  return `OPM${userId}${Date.now()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

// ─── GET /operator-membership/plans ──────────────────────────────────────────
router.get("/operator-membership/plans", (_req, res): void => {
  res.json({
    plans: OPERATOR_PLANS.map((p) => ({
      id: p.id,
      name: p.name,
      pricePaise: p.pricePaise,
      tagline: p.tagline,
      commissionLabel: p.commissionLabel,
      features: p.features,
    })),
  });
});

// ─── GET /operator-membership/status ─────────────────────────────────────────
router.get("/operator-membership/status", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const purchased = await getUserOperatorTier(userId);
  const prime = await getPrimeStatus(userId);
  const { effective, viaPrime } = getEffectiveOperatorTier(purchased, prime);
  res.json({
    tier: effective,            // what the user effectively has (used for badges & gating)
    purchasedTier: purchased,   // what they actually paid for (silver/gold/premium)
    viaPrime,                   // true → premium auto-active because of Prime content sub
    primeActive: viaPrime,
    plan: getOperatorPlan(effective) ?? null,
  });
});

// ─── POST /operator-membership/init ──────────────────────────────────────────
router.post("/operator-membership/init", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const planId = String(req.body?.planId ?? "") as OperatorTier;
  const plan = getOperatorPlan(planId);
  if (!plan) {
    res.status(400).json({ error: "Invalid plan" });
    return;
  }
  if (plan.id === "silver") {
    // Silver is free — apply immediately, no PhonePe.
    await db.update(usersTable).set({ operatorTier: "silver" }).where(eq(usersTable.id, userId));
    res.json({ status: "success", tier: "silver" });
    return;
  }

  const current = await getUserOperatorTier(userId);
  if (current === plan.id) {
    res.status(400).json({ error: `You are already on ${plan.name} plan` });
    return;
  }
  // Disallow downgrade from premium → gold via this endpoint.
  if (current === "premium" && plan.id === "gold") {
    res.status(400).json({ error: "You already have a higher plan (Premium)" });
    return;
  }

  // Optional billing details (when called from new checkout page)
  const billingParsed = billingSchema.safeParse(req.body?.billing);
  if (req.body?.billing && !billingParsed.success) {
    res.status(400).json({ error: "Invalid billing details", details: billingParsed.error.format() });
    return;
  }
  const billing = billingParsed.success ? billingParsed.data : undefined;

  // Optional coupon
  const couponCodeRaw = typeof req.body?.couponCode === "string" ? req.body.couponCode.trim() : "";
  let couponId: number | null = null;
  let discountPaise = 0;
  let finalPaise = plan.pricePaise;
  let appliedCode: string | null = null;
  if (couponCodeRaw) {
    const v = await validateCoupon({
      code: couponCodeRaw,
      userId,
      scope: "operator",
      planId: plan.id,
      basePaise: plan.pricePaise,
    });
    if (!v.ok) {
      res.status(400).json({ error: v.reason ?? "Invalid coupon" });
      return;
    }
    couponId = v.coupon!.id;
    discountPaise = v.discountPaise!;
    finalPaise = v.finalPaise!;
    appliedCode = v.coupon!.code;
  }

  // Free after coupon → apply immediately, no PhonePe
  if (finalPaise === 0) {
    const transactionId = genTxn(userId);
    await db.insert(operatorMembershipPaymentsTable).values({
      userId,
      plan: plan.id,
      amountPaise: 0,
      transactionId,
      status: "success",
      completedAt: new Date(),
      billingName: billing?.name ?? null,
      billingMobile: billing?.mobile ?? null,
      billingEmail: billing?.email ?? null,
      billingState: billing?.state ?? null,
      billingDistrict: billing?.district ?? null,
      couponCode: appliedCode,
      discountPaise,
      originalAmountPaise: plan.pricePaise,
    });
    await db.update(usersTable).set({ operatorTier: plan.id }).where(eq(usersTable.id, userId));
    if (couponId) {
      await recordRedemption({
        couponId, userId, scope: "operator", planId: plan.id,
        transactionId, discountPaise, finalAmountPaise: 0,
      });
    }
    res.json({ status: "success", tier: plan.id, transactionId, discountPaise, finalPaise: 0 });
    return;
  }

  if (!isPhonePeConfigured()) {
    res.status(503).json({ error: "Payment gateway not configured" });
    return;
  }

  const transactionId = genTxn(userId);
  await db.insert(operatorMembershipPaymentsTable).values({
    userId,
    plan: plan.id,
    amountPaise: finalPaise,
    transactionId,
    status: "pending",
    billingName: billing?.name ?? null,
    billingMobile: billing?.mobile ?? null,
    billingEmail: billing?.email ?? null,
    billingState: billing?.state ?? null,
    billingDistrict: billing?.district ?? null,
    couponCode: appliedCode,
    discountPaise,
    originalAmountPaise: plan.pricePaise,
  });

      const base = getCallbackBaseUrl();
  const callbackUrl = `${base}/api/operator-membership/phonepe/callback`;
  const redirectUrl = `${callbackUrl}?txn=${transactionId}`;
  const [user] = await db.select({ mobile: usersTable.mobile }).from(usersTable).where(eq(usersTable.id, userId));

  try {
    const { phonePeRedirectUrl } = await initiatePhonePePayment({
      merchantTransactionId: transactionId,
      merchantUserId: `USER_${userId}`,
      amount: finalPaise / 100,
      redirectUrl,
      callbackUrl,
      mobileNumber: billing?.mobile ?? user?.mobile ?? undefined,
    });
    
    res.json({
      transactionId,
      redirectUrl: phonePeRedirectUrl,
      plan: plan.id,
      amountPaise: finalPaise,
      originalAmountPaise: plan.pricePaise,
      discountPaise,
      couponCode: appliedCode,
    });
  } catch (err: any) {
    await db.update(operatorMembershipPaymentsTable)
      .set({ status: "failed", errorReason: err?.message ?? "init failed", updatedAt: new Date() })
      .where(eq(operatorMembershipPaymentsTable.transactionId, transactionId));
    req.log.error({ err }, "[operator-membership/init] PhonePe failed");
    res.status(502).json({ error: err?.message ?? "Payment initiation failed" });
  }
});

/** Idempotently sync a payment from PhonePe and apply the upgrade on success. */
async function reconcileMembershipPayment(txn: string): Promise<{ status: string; tier?: OperatorTier; error?: string }> {
  const [p] = await db.select().from(operatorMembershipPaymentsTable).where(eq(operatorMembershipPaymentsTable.transactionId, txn));
  if (!p) return { status: "not_found" };
  if (p.status === "success") return { status: "success", tier: p.plan as OperatorTier };

  const { success, state } = await checkPhonePeStatus(txn);

  if (success) {
    const [updated] = await db
      .update(operatorMembershipPaymentsTable)
      .set({ status: "success", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(operatorMembershipPaymentsTable.id, p.id), eq(operatorMembershipPaymentsTable.status, "pending")))
      .returning();
    if (updated) {
      await db.update(usersTable).set({ operatorTier: p.plan }).where(eq(usersTable.id, p.userId));

      // Fire-and-forget congratulations email
      try {
        const { sendOperatorTierSuccessEmail } = await import("../lib/mailer");
        const [u] = await db.select().from(usersTable).where(eq(usersTable.id, p.userId));
        const toEmail = p.billingEmail || u?.email;
        const toName = p.billingName || u?.name || "Member";
        if (toEmail && (p.plan === "gold" || p.plan === "premium")) {
          sendOperatorTierSuccessEmail({
            toEmail,
            toName,
            tier: p.plan as "gold" | "premium",
            amountPaise: Number(p.amountPaise),
            transactionId: p.transactionId,
            completedAt: updated.completedAt ?? new Date(),
          }).catch((e) => console.error("[operator-membership] email send failed:", e?.message ?? e));
        }
      } catch (e: any) {
        console.error("[operator-membership] email prep failed:", e?.message ?? e);
      }
            try {
        const [u] = await db.select({ email: usersTable.email, name: usersTable.name })
          .from(usersTable).where(eq(usersTable.id, p.userId));
        if (u?.email) {
          await sendWelcomeEmail({
            to: u.email, name: u.name, plan: p.plan,
            amountRupees: Number(p.amountPaise) / 100,
            transactionId: p.transactionId,
          });
        }
      } catch (e) { console.error("[email] welcome failed:", e); }
      // Record coupon redemption if a coupon was applied
      if (p.couponCode) {
        const [c] = await db.select().from(couponsTable).where(eq(couponsTable.code, p.couponCode));
        if (c) {
          await recordRedemption({
            couponId: c.id,
            userId: p.userId,
            scope: "operator",
            planId: p.plan,
            transactionId: p.transactionId,
            discountPaise: Number(p.discountPaise ?? 0),
            finalAmountPaise: Number(p.amountPaise),
          });
        }
      }
    }
    return { status: "success", tier: p.plan as OperatorTier };
  }
  if (state === "PENDING") return { status: "pending" };

  await db
    .update(operatorMembershipPaymentsTable)
    .set({ status: "failed", errorReason: `PhonePe state: ${state}`, updatedAt: new Date() })
    .where(and(eq(operatorMembershipPaymentsTable.id, p.id), eq(operatorMembershipPaymentsTable.status, "pending")));
  return { status: "failed", error: `PhonePe state: ${state}` };
}

async function handleMembershipCallback(req: any, res: any): Promise<void> {
  const base = getCallbackBaseUrl();
  const appBase = (process.env.SMIT_CSC_BASE_PATH ?? "/").replace(/\/$/, "");
   try {
    let txn: string | undefined =
      (req.query?.merchantOrderId as string | undefined) ||
      (req.query?.orderId as string | undefined) ||
      (req.body?.merchantOrderId as string | undefined) ||
      (req.body?.orderId as string | undefined) ||
      (req.body?.merchantTransactionId as string | undefined) ||
      (req.query?.transactionId as string | undefined) ||
      (req.query?.merchantTransactionId as string | undefined) ||
      (req.query?.txn as string | undefined) ||                 // FIX: redirectUrl uses ?txn=
      (req.query?.transaction_id as string | undefined) ||
      (req.body?.transactionId as string | undefined) ||
      (req.body?.txn as string | undefined);

    if (!txn && req.body?.response) {
      try {
        const decoded = Buffer.from(req.body.response, "base64").toString("utf-8");
        const parsed = JSON.parse(decoded);
        txn = parsed.merchantTransactionId;
      } catch {}
    }

    if (!txn) {
      res.redirect(`${base}${appBase}/recharge#upgrade?status=pending`);
      return;
    }

    if (isPhonePeConfigured()) {
      await reconcileMembershipPayment(String(txn));
    }
    res.redirect(`${base}${appBase}/recharge#upgrade?txn=${txn}`);
  } catch (err) {
    req.log?.error({ err }, "[operator-membership/cb] error");
    res.redirect(`${base}${appBase}/recharge#upgrade?status=pending`);
  }
}
router.post("/operator-membership/phonepe/callback", handleMembershipCallback);
router.get("/operator-membership/phonepe/callback", handleMembershipCallback);

// ─── POST /operator-membership/:txn/verify — manual re-check ─────────────────
router.post("/operator-membership/:txn/verify", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const txn = String(req.params.txn);
  const [p] = await db.select().from(operatorMembershipPaymentsTable)
    .where(and(eq(operatorMembershipPaymentsTable.transactionId, txn), eq(operatorMembershipPaymentsTable.userId, userId)));
  if (!p) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  if (!isPhonePeConfigured()) {
    res.status(503).json({ error: "Payment gateway not configured" });
    return;
  }
  const r = await reconcileMembershipPayment(txn);
  res.json({ status: r.status, tier: r.tier ?? (await getUserOperatorTier(userId)), error: r.error });
});

export default router;
