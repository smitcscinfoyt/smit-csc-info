import { sendWelcomeEmail } from "../lib/emailService";
import { Router } from "express";
import { db, paymentsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { GetPaymentsResponse, VerifyPaymentResponse } from "@workspace/api-zod";
import {
  checkPhonePeStatus,
  isPhonePeConfigured,
  getCallbackBaseUrl,
  verifyV1Callback,
} from "../lib/phonepe";

const router = Router();

const PLAN_DURATIONS: Record<string, number> = {
  monthly: 30,
  quarterly: 90,
  yearly: 365,
};

// ─── GET /payments — list user payments ──────────────────────────────────────
router.get("/payments", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;

  const payments = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.userId, userId))
    .orderBy(paymentsTable.createdAt);

  res.json(
    GetPaymentsResponse.parse(
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

// ─── PhonePe Payment Callback (GET + POST) ────────────────────────────────────
// Handles both browser redirects (GET) and server-to-server POST callbacks from PhonePe.
async function handlePhonePeCallback(req: any, res: any): Promise<void> {
    const isS2S = req.method === "POST";
  const base = getCallbackBaseUrl();

  try {
    console.log(
      `[PhonePe Callback] ${req.method} ${req.url}\n` +
      `  query:   ${JSON.stringify(req.query)}\n` +
      `  body:    ${JSON.stringify(req.body)}\n` +
      `  headers: ${JSON.stringify({
        "x-verify":     req.headers["x-verify"],
        "content-type": req.headers["content-type"],
      })}`
    );

    // v1 S2S callback: verify X-VERIFY checksum before trusting the payload
    const xVerify          = req.headers["x-verify"] as string | undefined;
    const callbackResponse = req.body?.response as string | undefined;
    if (callbackResponse && xVerify) {
      const valid = verifyV1Callback(callbackResponse, xVerify);
      console.log(`[PhonePe Callback] v1 X-VERIFY: ${valid ? "✅ VALID" : "❌ INVALID"}`);
      if (!valid) {
        console.warn(`[PhonePe Callback] Checksum mismatch — proceeding with status API re-check.`);
      }
    }

    // Extract the transaction ID from all locations PhonePe may send it
    let merchantTransactionId: string | undefined =
      (req.query?.merchantOrderId as string | undefined) ||
      (req.query?.orderId         as string | undefined) ||
      (req.body?.merchantOrderId  as string | undefined) ||
      (req.body?.orderId          as string | undefined);

    // v1 fallback: transaction ID is encoded inside base64 body.response
    if (!merchantTransactionId) {
      const rawResponse = req.body?.response as string | undefined;
      if (rawResponse) {
        try {
          const decoded = Buffer.from(rawResponse, "base64").toString("utf-8");
          const parsed  = JSON.parse(decoded) as { merchantTransactionId?: string };
          merchantTransactionId = parsed.merchantTransactionId;
          console.log(`[PhonePe Callback] Decoded v1 txnId: ${merchantTransactionId}`);
        } catch (e) {
          console.warn(`[PhonePe Callback] Failed to decode base64 body.response:`, e);
        }
      }
    }

    // Generic fallbacks
    if (!merchantTransactionId) {
      merchantTransactionId =
        (req.body?.merchantTransactionId as string | undefined) ||
        (req.query?.transactionId        as string | undefined) ||
        (req.query?.merchantTransactionId as string | undefined);
    }

    console.log(`[PhonePe Callback] Resolved txnId: ${merchantTransactionId ?? "NOT FOUND"}`);

    if (!merchantTransactionId) {
      console.error(`[PhonePe Callback] No transaction ID found. Redirecting to pending.`);
      res.redirect(`${base}/payment/pending`);
      return;
    }

    if (!isPhonePeConfigured()) {
      console.warn(`[PhonePe Callback] PhonePe not configured — skipping verification.`);
      res.redirect(`${base}/payment/pending?txn=${merchantTransactionId}`);
      return;
    }

    const { success, state } = await checkPhonePeStatus(merchantTransactionId);
    console.log(`[PhonePe Callback] state=${state}, success=${success}`);

    if (success) {
      await activateMembership(merchantTransactionId);
      console.log(`[PhonePe Callback] ✅ Membership activated for txn: ${merchantTransactionId}`);
            if (isS2S) { res.status(200).json({ code: "SUCCESS" }); return; }
      res.redirect(`${base}/payment/success?txn=${merchantTransactionId}`);
    } else if (state === "PENDING") {
      console.log(`[PhonePe Callback] Payment PENDING for txn: ${merchantTransactionId}`);
            if (isS2S) { res.status(200).json({ code: "SUCCESS" }); return; }
      res.redirect(`${base}/payment/pending?txn=${merchantTransactionId}`);
    } else {
      console.log(`[PhonePe Callback] Payment FAILED (state=${state}) for txn: ${merchantTransactionId}`);
      await db
        .update(paymentsTable)
        .set({ status: "failed" })
        .where(eq(paymentsTable.transactionId, merchantTransactionId));
       if (isS2S) { res.status(200).json({ code: "SUCCESS" }); return; }
      res.redirect(`${base}/payment/pending?txn=${merchantTransactionId}&failed=1`);
    }
  } catch (err: any) {
    console.error(`[PhonePe Callback] Unexpected error:`, err);
      if (isS2S) { res.status(200).json({ code: "SUCCESS" }); return; }
    res.redirect(`${base}/payment/pending`);
  }
}

router.post("/payments/phonepe/callback", handlePhonePeCallback);
router.get("/payments/phonepe/callback", handlePhonePeCallback);

// ─── POST /payments/:transactionId/verify — manual re-check ──────────────────
router.post(
  "/payments/:transactionId/verify",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const raw = Array.isArray(req.params.transactionId)
      ? req.params.transactionId[0]
      : req.params.transactionId;
    const userId = req.userId!;

    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(and(eq(paymentsTable.transactionId, raw), eq(paymentsTable.userId, userId)));

    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }

    if (payment.status === "success") {
      res.json(
        VerifyPaymentResponse.parse({
          id:            payment.id,
          userId:        payment.userId,
          amount:        payment.amount,
          plan:          payment.plan,
          transactionId: payment.transactionId,
          status:        payment.status,
          expiryDate:    payment.expiryDate ? payment.expiryDate.toISOString() : null,
          createdAt:     payment.createdAt.toISOString(),
        })
      );
      return;
    }

    if (!isPhonePeConfigured()) {
      res.status(503).json({ error: "Payment gateway not configured" });
      return;
    }

    console.log(`[PhonePe Verify] Manual verify for txn: ${raw}`);

    const { success, state } = await checkPhonePeStatus(raw);
    console.log(`[PhonePe Verify] state=${state}, success=${success}`);

    if (success) {
      const updated = await activateMembership(raw);
      if (updated) {
        res.json(
          VerifyPaymentResponse.parse({
            id:            updated.id,
            userId:        updated.userId,
            amount:        updated.amount,
            plan:          updated.plan,
            transactionId: updated.transactionId,
            status:        updated.status,
            expiryDate:    updated.expiryDate ? updated.expiryDate.toISOString() : null,
            createdAt:     updated.createdAt.toISOString(),
          })
        );
        return;
      }
    }

    res.status(402).json({ error: "Payment not confirmed by PhonePe", state });
  }
);

// ─── Activate Membership ──────────────────────────────────────────────────────
async function activateMembership(transactionId: string) {
  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.transactionId, transactionId));

  if (!payment) {
    console.error(`[activateMembership] Payment not found: ${transactionId}`);
    return null;
  }
  if (payment.status === "success") {
    console.log(`[activateMembership] Already activated: ${transactionId}`);
    return payment;
  }

  const days       = PLAN_DURATIONS[payment.plan] ?? 30;
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + days);

  // Step 1: Mark payment record as successful with expiry date
  const [updated] = await db
    .update(paymentsTable)
    .set({ status: "success", expiryDate })
    .where(eq(paymentsTable.id, payment.id))
    .returning();

  // Step 2: FIX — Set users.role = "prime" in the users table.
  // The old code only updated the payments table but never touched users.role.
  // Any middleware or route that checks user.role for premium gating always saw "user"
  // and denied access even after a successful payment. This line fixes that.
  await db
    .update(usersTable)
    .set({ role: "prime" })
    .where(eq(usersTable.id, payment.userId));

  console.log(`[activateMembership] ✅ users.role="prime" set for userId=${payment.userId}`);

  // Step 3: Record coupon redemption if a coupon was applied (idempotent on transactionId)
  if (payment.couponCode) {
    try {
      const { couponsTable }    = await import("@workspace/db");
      const { recordRedemption } = await import("../lib/coupons");
      const [c] = await db
        .select()
        .from(couponsTable)
        .where(eq(couponsTable.code, payment.couponCode));
      if (c) {
        await recordRedemption({
          couponId:         c.id,
          userId:           payment.userId,
          scope:            "prime",
          planId:           payment.plan,
          transactionId:    payment.transactionId,
          discountPaise:    payment.discountPaise ?? 0,
          finalAmountPaise: payment.amount * 100,
        });
      }
    } catch (err) {
      console.error("[activateMembership] coupon redemption error:", err);
    }
  }

  console.log(
    `[activateMembership] ✅ Plan "${payment.plan}" activated — expires ${expiryDate.toISOString()}`
  );
  return updated;
}

export default router;
