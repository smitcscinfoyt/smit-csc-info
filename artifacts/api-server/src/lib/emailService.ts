/**
 * Legacy email entry points — delegates to SMTP mailer (SMTP_* env / GitHub Secrets).
 * Prefer importing from ./mailer or ./payment-notifications in new code.
 */

import {
  sendMembershipSuccessEmail,
  sendWalletTopupSuccessEmail,
} from "./mailer";

/** @deprecated Use notifyPrimeMembershipPayment or sendMembershipSuccessEmail */
export async function sendWelcomeEmail(opts: {
  to: string;
  name?: string | null;
  plan: string;
  amountRupees: number;
  transactionId: string;
  expiryDate?: Date | null;
}): Promise<void> {
  await sendMembershipSuccessEmail({
    toEmail: opts.to,
    toName: opts.name || "Member",
    plan: opts.plan,
    amountPaise: Math.round(opts.amountRupees * 100),
    transactionId: opts.transactionId,
    completedAt: new Date(),
    expiryDate: opts.expiryDate ?? undefined,
    isRenewal: false,
  });
}

/** @deprecated Use sendRechargeSuccessEmail from ./mailer */
export async function sendTransactionEmail(opts: {
  to: string;
  name?: string | null;
  service: string;
  amountRupees: number;
  transactionId: string;
  status?: "success" | "pending" | "failed";
  extra?: Record<string, string>;
}): Promise<void> {
  if (opts.status && opts.status !== "success") return;
  const { sendRechargeSuccessEmail } = await import("./mailer");
  await sendRechargeSuccessEmail({
    toEmail: opts.to,
    toName: opts.name || "Member",
    operatorName: opts.service,
    type: opts.service,
    accountNumber: opts.extra?.["Account"] ?? opts.extra?.["Number"] ?? "—",
    amountPaise: Math.round(opts.amountRupees * 100),
    transactionId: opts.transactionId,
    completedAt: new Date(),
  });
}

/** @deprecated Use sendWalletTopupSuccessEmail from ./mailer */
export async function sendWalletCreditEmail(opts: {
  to: string;
  name?: string | null;
  amountRupees: number;
  transactionId: string;
  newBalanceRupees?: number;
}): Promise<void> {
  await sendWalletTopupSuccessEmail({
    toEmail: opts.to,
    toName: opts.name || "Member",
    amountPaise: Math.round(opts.amountRupees * 100),
    transactionId: opts.transactionId,
    completedAt: new Date(),
    newBalancePaise:
      opts.newBalanceRupees !== undefined
        ? Math.round(opts.newBalanceRupees * 100)
        : undefined,
  });
}
