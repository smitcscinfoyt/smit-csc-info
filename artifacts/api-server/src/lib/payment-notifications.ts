/**
 * Central payment-success email notifications (SMTP via mailer).
 * All successful payment flows should use these helpers for consistent, reliable delivery.
 */

import { and, eq, ne } from "drizzle-orm";
import { db, paymentsTable } from "@workspace/db";
import {
  sendMembershipSuccessEmail,
  sendOperatorTierSuccessEmail,
  sendRechargeSuccessEmail,
  sendWalletTopupSuccessEmail,
} from "./mailer";

export const PRIME_PLAN_CATALOG: Record<
  string,
  { displayName: string; displayNameGu: string; durationLabel: string; benefits: string[] }
> = {
  monthly: {
    displayName: "Prime Monthly Plan",
    displayNameGu: "પ્રાઇમ માસિક પ્લાન",
    durationLabel: "1 month",
    benefits: [
      "All government scheme tutorials",
      "Premium PDF forms download",
      "Exclusive video content",
      "WhatsApp priority support",
      "Scheme update notifications",
    ],
  },
  quarterly: {
    displayName: "Prime Quarterly Plan",
    displayNameGu: "પ્રાઇમ ત્રિ-માસિક પ્લાન",
    durationLabel: "3 months",
    benefits: [
      "All Monthly Plan benefits",
      "Priority support",
      "Offline PDF access",
      "Save ₹98 vs monthly billing",
    ],
  },
  yearly: {
    displayName: "Prime Annual Plan",
    displayNameGu: "પ્રાઇમ વાર્ષિક પ્લાન",
    durationLabel: "12 months",
    benefits: [
      "All Quarterly Plan benefits",
      "Dedicated CSC operator support",
      "Admin toolkit access",
      "Best value — save ₹1089",
    ],
  },
};

function logResult(kind: string, toEmail: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`[PAYMENT-EMAIL] ✅ ${kind} receipt sent → ${toEmail}`);
  } else {
    console.error(`[PAYMENT-EMAIL] ❌ ${kind} receipt failed → ${toEmail}${detail ? `: ${detail}` : ""}`);
  }
}

/** Prime membership payment (PhonePe) — call after DB status is "success". */
export async function notifyPrimeMembershipPayment(opts: {
  userId: number;
  toEmail: string;
  toName: string;
  planId: string;
  amountRupees: number;
  transactionId: string;
  completedAt: Date;
  expiryDate: Date;
  paymentRowId: number;
  couponCode?: string | null;
  discountPaise?: number | null;
}): Promise<boolean> {
  const email = opts.toEmail?.trim();
  if (!email) {
    console.warn("[PAYMENT-EMAIL] Skipped prime membership email — no recipient address");
    return false;
  }

  const [prior] = await db
    .select({ id: paymentsTable.id })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.userId, opts.userId),
        eq(paymentsTable.status, "success"),
        ne(paymentsTable.id, opts.paymentRowId),
      ),
    )
    .limit(1);

  const isRenewal = !!prior;
  const catalog = PRIME_PLAN_CATALOG[opts.planId];

  try {
    await sendMembershipSuccessEmail({
      toEmail: email,
      toName: opts.toName,
      plan: opts.planId,
      planDisplayName: catalog?.displayName,
      planDisplayNameGu: catalog?.displayNameGu,
      durationLabel: catalog?.durationLabel,
      benefits: catalog?.benefits,
      amountPaise: Math.round(opts.amountRupees * 100),
      transactionId: opts.transactionId,
      completedAt: opts.completedAt,
      expiryDate: opts.expiryDate,
      isRenewal,
      couponCode: opts.couponCode ?? undefined,
      discountPaise: opts.discountPaise ?? undefined,
    });
    logResult("prime_membership", email, true);
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logResult("prime_membership", email, false, msg);
    return false;
  }
}

export { sendRechargeSuccessEmail, sendWalletTopupSuccessEmail, sendOperatorTierSuccessEmail };
