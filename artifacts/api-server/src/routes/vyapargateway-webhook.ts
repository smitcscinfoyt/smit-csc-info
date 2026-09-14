import { Router, Request, Response } from "express";
import {
  db,
  walletTopupsTable,
  rechargesTable,
  operatorMembershipPaymentsTable,
  usersTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  verifyVyaparWebhookSignature,
  checkVyaparOrderStatus,
  type VyaparOrderData,
} from "../lib/vyapargateway";
import { creditWallet, commitWalletHold } from "../lib/wallet-engine";
import { sendWalletTopupSuccessEmail, sendOperatorTierSuccessEmail } from "../lib/mailer";
import { executeRechargeAfterPayment } from "./recharge";

const router = Router();

/**
 * Reconcile a Wallet Topup payment.
 */
export async function reconcileVyaparTopup(
  txnOrOrderId: string,
  orderData?: VyaparOrderData
): Promise<{ status: string; error?: string }> {
  // Find by client_txn_id or vyapar_order_id
  const [t] = await db
    .select()
    .from(walletTopupsTable)
    .where(
      eq(walletTopupsTable.transactionId, txnOrOrderId)
    );

  const topup = t || (
    await db
      .select()
      .from(walletTopupsTable)
      .where(eq(walletTopupsTable.vyaparOrderId, txnOrOrderId))
  )[0];

  if (!topup) return { status: "not_found" };
  if (topup.status === "success") return { status: "success" };

  let isSuccess = orderData?.status === "success";
  let utr = (orderData as any)?.upi_txn_id;

  if (!isSuccess) {
    const check = await checkVyaparOrderStatus(topup.vyaparOrderId || txnOrOrderId);
    if (check.success && check.status === "success") {
      isSuccess = true;
      utr = (check.data as any)?.upi_txn_id;
    } else if (check.status === "failed") {
      await db
        .update(walletTopupsTable)
        .set({
          status: "failed",
          errorReason: check.rawMsg || "Payment failed at gateway",
          updatedAt: new Date(),
        })
        .where(
          and(eq(walletTopupsTable.id, topup.id), eq(walletTopupsTable.status, "pending"))
        );
      return { status: "failed", error: check.rawMsg };
    } else {
      return { status: "pending" };
    }
  }

  if (isSuccess) {
    const [updated] = await db
      .update(walletTopupsTable)
      .set({
        status: "success",
        completedAt: new Date(),
        updatedAt: new Date(),
        utr: utr ?? topup.utr ?? null,
        method: "vyapargateway",
      })
      .where(
        and(eq(walletTopupsTable.id, topup.id), eq(walletTopupsTable.status, "pending"))
      )
      .returning();

    if (updated) {
      const credit = await creditWallet(topup.userId, {
        type: "topup",
        amountPaise: Number(topup.amountPaise),
        refType: "wallet_topup",
        refId: topup.id,
        refCode: topup.transactionId,
        note: `Wallet top-up via VyaparGateway UPI${utr ? ` (UTR: ${utr})` : ""}`,
      });

      await db
        .update(walletTopupsTable)
        .set({ ledgerEntryId: credit.ledgerEntryId, updatedAt: new Date() })
        .where(eq(walletTopupsTable.id, topup.id));

      try {
        const [u] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, topup.userId));
        if (u?.email) {
          sendWalletTopupSuccessEmail({
            toEmail: u.email,
            toName: u.name || "Member",
            amountPaise: Number(topup.amountPaise),
            transactionId: topup.transactionId,
            completedAt: updated.completedAt ?? new Date(),
            method: "VyaparGateway UPI",
            newBalancePaise: credit.balancePaise,
          }).catch((e) =>
            console.error("[wallet topup] email send failed:", e?.message ?? e)
          );
        }
      } catch (e: any) {
        console.error("[wallet topup] email prep failed:", e?.message ?? e);
      }
    }
    return { status: "success" };
  }

  return { status: "pending" };
}

/**
 * Reconcile an Operator Membership Upgrade payment.
 */
export async function reconcileVyaparOperatorMembership(
  txnOrOrderId: string,
  orderData?: VyaparOrderData
): Promise<{ status: string; tier?: string; error?: string }> {
  const [p] = await db
    .select()
    .from(operatorMembershipPaymentsTable)
    .where(eq(operatorMembershipPaymentsTable.transactionId, txnOrOrderId));

  const payment = p || (
    await db
      .select()
      .from(operatorMembershipPaymentsTable)
      .where(eq(operatorMembershipPaymentsTable.vyaparOrderId, txnOrOrderId))
  )[0];

  if (!payment) return { status: "not_found" };
  if (payment.status === "success") return { status: "success", tier: payment.plan };

  let isSuccess = orderData?.status === "success";

  if (!isSuccess) {
    const check = await checkVyaparOrderStatus(payment.vyaparOrderId || txnOrOrderId);
    if (check.success && check.status === "success") {
      isSuccess = true;
    } else if (check.status === "failed") {
      await db
        .update(operatorMembershipPaymentsTable)
        .set({
          status: "failed",
          errorReason: check.rawMsg || "Payment failed",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(operatorMembershipPaymentsTable.id, payment.id),
            eq(operatorMembershipPaymentsTable.status, "pending")
          )
        );
      return { status: "failed", error: check.rawMsg };
    } else {
      return { status: "pending" };
    }
  }

  if (isSuccess) {
    const [updated] = await db
      .update(operatorMembershipPaymentsTable)
      .set({
        status: "success",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(operatorMembershipPaymentsTable.id, payment.id),
          eq(operatorMembershipPaymentsTable.status, "pending")
        )
      )
      .returning();

    if (updated) {
      await db
        .update(usersTable)
        .set({ operatorTier: payment.plan })
        .where(eq(usersTable.id, payment.userId));

      try {
        const [u] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, payment.userId));
        if (u?.email) {
          sendOperatorTierSuccessEmail({
            toEmail: u.email,
            toName: u.name || "Member",
            tier: payment.plan as any,
            amountPaise: Number(payment.amountPaise),
            transactionId: payment.transactionId,
            completedAt: updated.completedAt ?? new Date(),
          }).catch((e) =>
            console.error("[operator-membership] email send failed:", e?.message ?? e)
          );
        }
      } catch (e: any) {
        console.error("[operator-membership] email prep failed:", e?.message ?? e);
      }
    }
    return { status: "success", tier: payment.plan };
  }

  return { status: "pending" };
}

/**
 * Reconcile a Recharge Shortfall UPI payment.
 */
export async function reconcileVyaparRecharge(
  reqIdOrOrderId: string,
  orderData?: VyaparOrderData
): Promise<{ status: string; recharge?: any; error?: string }> {
  const [r] = await db
    .select()
    .from(rechargesTable)
    .where(eq(rechargesTable.a1RequestId, reqIdOrOrderId));

  const recharge = r || (
    await db
      .select()
      .from(rechargesTable)
      .where(eq(rechargesTable.vyaparOrderId, reqIdOrOrderId))
  )[0];

  if (!recharge) return { status: "not_found" };
  if (recharge.vyaparStatus === "success" && recharge.status !== "pending") {
    return { status: recharge.status, recharge };
  }

  let isSuccess = orderData?.status === "success";

  if (!isSuccess) {
    const check = await checkVyaparOrderStatus(recharge.vyaparOrderId || reqIdOrOrderId);
    if (check.success && check.status === "success") {
      isSuccess = true;
    } else if (check.status === "failed") {
      // UPI payment failed -> release wallet hold
      if (recharge.walletDebitPaise && recharge.walletDebitPaise > 0) {
        const { releaseWalletHold } = await import("../lib/wallet-engine");
        await releaseWalletHold(recharge.userId, recharge.walletDebitPaise).catch((e) =>
          console.error("[recharge/shortfall] hold release failed:", e)
        );
      }
      await db
        .update(rechargesTable)
        .set({
          vyaparStatus: "failed",
          status: "failed",
          errorReason: check.rawMsg || "UPI shortfall payment failed",
          updatedAt: new Date(),
          completedAt: new Date(),
        })
        .where(
          and(eq(rechargesTable.id, recharge.id), eq(rechargesTable.vyaparStatus, "pending"))
        );
      return { status: "failed", error: check.rawMsg };
    } else {
      return { status: "pending" };
    }
  }

  if (isSuccess) {
    // Update vyaparStatus = "success"
    await db
      .update(rechargesTable)
      .set({
        vyaparStatus: "success",
        updatedAt: new Date(),
      })
      .where(eq(rechargesTable.id, recharge.id));

    // Execute provider recharge with hold commit & auto-refund safety
    const finalRecharge = await executeRechargeAfterPayment(recharge.id);
    return { status: finalRecharge.status, recharge: finalRecharge };
  }

  return { status: "pending" };
}

/**
 * Main Webhook Handler: POST /api/webhook/vyapargateway
 */
router.post("/webhook/vyapargateway", async (req: Request, res: Response): Promise<void> => {
  try {
    const timestamp = (req.headers["x-vyapargateway-timestamp"] as string) || "";
    const signature = (req.headers["x-vyapargateway-signature"] as string) || "";
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    const isValid = verifyVyaparWebhookSignature({
      timestamp,
      signature,
      rawBody,
    });

    if (!isValid) {
      console.warn("[vyapargateway-webhook] Invalid signature received from IP:", req.ip);
      res.status(401).json({ status: false, msg: "Invalid signature" });
      return;
    }

    const payload = req.body || {};
    console.log("[vyapargateway-webhook] Valid webhook payload:", {
      event: payload.event,
      order_id: payload.order_id,
      client_txn_id: payload.client_txn_id,
      status: payload.status,
      amount: payload.amount,
    });

    const clientTxnId = String(payload.client_txn_id || "");
    const orderId = String(payload.order_id || "");
    const status = String(payload.status || "").toLowerCase();

    if (status === "success" || payload.event === "payment.success") {
      if (clientTxnId.startsWith("WLT")) {
        await reconcileVyaparTopup(clientTxnId || orderId, payload);
      } else if (clientTxnId.startsWith("OPM")) {
        await reconcileVyaparOperatorMembership(clientTxnId || orderId, payload);
      } else if (clientTxnId.startsWith("R") || clientTxnId.startsWith("SF")) {
        await reconcileVyaparRecharge(clientTxnId || orderId, payload);
      } else {
        // Fallback: search in topup, recharge, membership
        const r1 = await reconcileVyaparTopup(orderId, payload);
        if (r1.status === "not_found") {
          const r2 = await reconcileVyaparRecharge(orderId, payload);
          if (r2.status === "not_found") {
            await reconcileVyaparOperatorMembership(orderId, payload);
          }
        }
      }
    }

    res.status(200).json({ status: true, msg: "Webhook processed" });
  } catch (err: any) {
    console.error("[vyapargateway-webhook] Error processing webhook:", err);
    res.status(200).json({ status: true, msg: "Error logged" }); // Always ACK with 200
  }
});

/**
 * Universal Polling / Status Check endpoint: POST /api/vyapargateway/check-status
 * Used by frontend dialog to poll status every 2 seconds.
 */
router.post("/vyapargateway/check-status", async (req: Request, res: Response): Promise<void> => {
  const { orderId, clientTxnId } = req.body || {};
  const ref = clientTxnId || orderId;

  if (!ref) {
    res.status(400).json({ status: false, msg: "orderId or clientTxnId required" });
    return;
  }

  try {
    if (typeof ref === "string" && ref.startsWith("WLT")) {
      const result = await reconcileVyaparTopup(ref);
      res.json({ status: result.status === "success", state: result.status, error: result.error });
      return;
    }

    if (typeof ref === "string" && ref.startsWith("OPM")) {
      const result = await reconcileVyaparOperatorMembership(ref);
      res.json({ status: result.status === "success", state: result.status, tier: result.tier, error: result.error });
      return;
    }

    if (typeof ref === "string" && (ref.startsWith("R") || ref.startsWith("SF"))) {
      const result = await reconcileVyaparRecharge(ref);
      res.json({ status: result.status === "success", state: result.status, recharge: result.recharge, error: result.error });
      return;
    }

    // Try generic check
    const r1 = await reconcileVyaparTopup(ref);
    if (r1.status !== "not_found") {
      res.json({ status: r1.status === "success", state: r1.status });
      return;
    }

    const r2 = await reconcileVyaparRecharge(ref);
    if (r2.status !== "not_found") {
      res.json({ status: r2.status === "success", state: r2.status, recharge: r2.recharge });
      return;
    }

    const r3 = await reconcileVyaparOperatorMembership(ref);
    res.json({ status: r3.status === "success", state: r3.status, tier: r3.tier });
  } catch (err: any) {
    res.status(500).json({ status: false, state: "error", error: err?.message });
  }
});

export default router;
