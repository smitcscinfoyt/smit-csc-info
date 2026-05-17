import { Router } from "express";
import { z } from "zod";
import { db, paymentsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth";
import {
  SubscribeMembershipBody,
  GetMembershipPlansResponse,
  GetMembershipStatusResponse,
  SubscribeMembershipResponse,
} from "@workspace/api-zod";
import crypto from "crypto";
import { initiatePhonePePayment, isPhonePeConfigured, getCallbackBaseUrl } from "../lib/phonepe";
import { getPrimeStatus, GRACE_PERIOD_DAYS } from "../lib/prime-status";
import { validateCoupon } from "../lib/coupons";

const billingSchema = z
  .object({
    name:     z.string().trim().min(2).max(100),
    mobile:   z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile"),
    email:    z.string().trim().email().max(255),
    state:    z.string().trim().min(2).max(80),
    district: z.string().trim().min(2).max(80),
  })
  .optional();

const router = Router();

const PLANS = [
  {
    id: "monthly",
    name: "Monthly Plan",
    nameGu: "માસિક પ્લાન",
    duration: 1,
    durationUnit: "month",
    price: 299,
    features: [
      "All government scheme tutorials",
      "Premium PDF forms download",
      "Exclusive video content",
      "WhatsApp support",
      "Scheme update notifications",
    ],
  },
  {
    id: "quarterly",
    name: "Quarterly Plan",
    nameGu: "ત્રિ-માસિક પ્લાન",
    duration: 3,
    durationUnit: "months",
    price: 799,
    features: [
      "All Monthly Plan benefits",
      "Priority support",
      "Offline PDF access",
      "3 months access",
      "Save ₹98 vs monthly",
    ],
  },
  {
    id: "yearly",
    name: "Annual Plan",
    nameGu: "વાર્ષિક પ્લાન",
    duration: 12,
    durationUnit: "months",
    price: 2499,
    features: [
      "All Quarterly Plan benefits",
      "Dedicated CSC operator support",
      "Admin toolkit access",
      "12 months access",
      "Best value — save ₹1089",
    ],
  },
];

router.get("/membership/plans", (_req, res): void => {
  res.json(GetMembershipPlansResponse.parse(PLANS));
});

router.get("/membership/status", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const status = await getPrimeStatus(userId);

  if (!status.payment || !status.expiryDate) {
    res.json(
      GetMembershipStatusResponse.parse({
        isActive:        false,
        hasEverBeenPrime: status.hasEverBeenPrime,
      })
    );
    return;
  }

  let gracePeriodDaysLeft: number | null = null;
  if (status.isInGracePeriod && status.graceEndsAt) {
    const msLeft        = status.graceEndsAt.getTime() - Date.now();
    gracePeriodDaysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  }

  res.json(
    GetMembershipStatusResponse.parse({
      isActive:            status.isActive || status.isInGracePeriod,
      plan:                status.payment.plan,
      expiresAt:           status.expiryDate.toISOString(),
      daysRemaining:       status.daysUntilExpiry,
      inGracePeriod:       status.isInGracePeriod,
      gracePeriodDaysLeft,
      isExpired:           status.isExpired,
      daysSinceExpiry:     status.daysSinceExpiry,
      hasEverBeenPrime:    true,
    })
  );
});

router.post("/membership/subscribe", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const parsed = SubscribeMembershipBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const plan = PLANS.find((p) => p.id === parsed.data.planId);
  if (!plan) {
    res.status(400).json({ error: "Invalid plan" });
    return;
  }

  const transactionId = `SMIT${Date.now()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const userId        = req.userId!;

  const [user] = await db
    .select({ mobile: usersTable.mobile })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  // Optional billing details
  const billingParsed = billingSchema.safeParse(req.body?.billing);
  if (req.body?.billing && !billingParsed.success) {
    res.status(400).json({ error: "Invalid billing details", details: billingParsed.error.format() });
    return;
  }
  const billing = billingParsed.success ? billingParsed.data : undefined;

  // ─── Coupon validation ────────────────────────────────────────────────────
  const couponCodeRaw = typeof req.body?.couponCode === "string" ? req.body.couponCode.trim() : "";
  const basePaise     = plan.price * 100;
  let discountPaise   = 0;
  let finalPaise      = basePaise;
  let appliedCode: string | null = null;

  if (couponCodeRaw) {
    const v = await validateCoupon({
      code:      couponCodeRaw,
      userId,
      scope:     "prime",
      planId:    plan.id,
      basePaise,
    });
    if (!v.ok) {
      res.status(400).json({ error: v.reason ?? "Invalid coupon" });
      return;
    }
    discountPaise = v.discountPaise!;
    finalPaise    = v.finalPaise!;
    appliedCode   = v.coupon!.code;
  }

  // ─── Insert pending payment row ───────────────────────────────────────────
  await db.insert(paymentsTable).values({
    userId,
    amount:          Math.ceil(finalPaise / 100),  // stored in rupees
    plan:            plan.id,
    transactionId,
    status:          "pending",
    billingName:     billing?.name     ?? null,
    billingMobile:   billing?.mobile   ?? null,
    billingEmail:    billing?.email    ?? null,
    billingState:    billing?.state    ?? null,
    billingDistrict: billing?.district ?? null,
    couponCode:      appliedCode,
    discountPaise,
    // FIX: Multiply by 100 — plan.price is in rupees; this column must store paise.
    // Old code wrote plan.price (e.g. 299) which is wrong; correct value is 29900.
    originalAmountPaise: plan.price * 100,
  });

  if (!isPhonePeConfigured()) {
    res.status(503).json({ error: "Payment gateway not configured. Please contact support." });
    return;
  }

  if (finalPaise === 0) {
    res.status(400).json({
      error: "Prime cannot be 100% free via coupon. Please choose a smaller discount.",
    });
    return;
  }

  // ─── Initiate PhonePe payment ─────────────────────────────────────────────
  try {
    const base        = getCallbackBaseUrl();
    const callbackUrl = `${base}/api/payments/phonepe/callback`;

    console.log(
      `[Membership] Initiating payment\n` +
      `  transactionId: ${transactionId}\n` +
      `  plan: ${plan.id} (₹${plan.price})\n` +
      `  finalAmount: ₹${finalPaise / 100}` +
      (discountPaise > 0
        ? ` (coupon ${appliedCode} saved ₹${discountPaise / 100})`
        : "") + `\n` +
      `  userId: ${userId}\n` +
      `  callbackUrl: ${callbackUrl}\n` +
      `  mobile: ${user?.mobile ? "provided" : "not set"}`
    );

    const { phonePeRedirectUrl } = await initiatePhonePePayment({
      merchantTransactionId: transactionId,
      merchantUserId:        `USER_${userId}`,
      amount:                finalPaise / 100,
      redirectUrl:           callbackUrl,
      callbackUrl,
      mobileNumber:          billing?.mobile ?? user?.mobile ?? undefined,
    });

    console.log(`[Membership] PhonePe redirect URL: ${phonePeRedirectUrl}`);

    res.json(
      SubscribeMembershipResponse.parse({
        transactionId,
        redirectUrl: phonePeRedirectUrl,
        amount:      plan.price,
        plan:        plan.id,
      })
    );
  } catch (err: any) {
    console.error(`[Membership] PhonePe initiation error:`, err);
    res.status(502).json({
      error: `Payment gateway error: ${err.message}`,
      hint:
        err.message?.includes("SU") || err.message?.includes("sandbox")
          ? "Sandbox credentials detected. UPI/QR requires production PhonePe credentials."
          : undefined,
    });
  }
});

export default router;
