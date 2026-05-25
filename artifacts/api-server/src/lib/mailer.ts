import nodemailer from "nodemailer";
import {
  buildPaymentReceiptHtml,
  type PaymentReceiptRow,
} from "./email-templates/payment-receipt-html";

const ADMIN_EMAIL = "admin@smitcscinfo.com";
const SMTP_RETRY_ATTEMPTS = 3;
const SMTP_RETRY_BASE_MS = 1_200;

// ─── App base URL ─────────────────────────────────────────────────────────────

function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "http://localhost:3000";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── SMTP config ──────────────────────────────────────────────────────────────

function getSmtpConfig() {
  const user = process.env.SMTP_USER ?? "";
  const configuredFrom = process.env.SMTP_FROM?.trim();
  let from = `"Smit CSC Info" <${ADMIN_EMAIL}>`;
  if (configuredFrom) {
    from = configuredFrom.includes("<")
      ? configuredFrom
      : `"Smit CSC Info" <${configuredFrom}>`;
  } else if (user.includes("@")) {
    from = `"Smit CSC Info" <${user}>`;
  }
  return {
    host: process.env.SMTP_HOST ?? "",
    port: parseInt(process.env.SMTP_PORT ?? "587", 10),
    user,
    pass: process.env.SMTP_PASS ?? "",
    from,
    replyTo: process.env.ADMIN_EMAIL?.trim() || ADMIN_EMAIL,
  };
}

function isSmtpConfigured(): boolean {
  const { host, user, pass } = getSmtpConfig();
  return !!host && !!user && !!pass;
}

function createTransport() {
  if (!isSmtpConfigured()) return null;

  const { host, port, user, pass } = getSmtpConfig();

  console.log(`[MAILER] Creating SMTP transport → ${host}:${port} (secure=${port === 465}) user=${user}`);

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

// ─── Diagnosis helper (used by /api/test-email) ───────────────────────────────

export function getSmtpStatus(): { configured: boolean; host: string; port: number; user: string } {
  const { host, port, user } = getSmtpConfig();
  return { configured: isSmtpConfigured(), host, port, user };
}

// ─── Core send function (with retries for payment reliability) ────────────────

async function sendMailOnce(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const { from, replyTo } = getSmtpConfig();
  const transport = createTransport();

  if (!transport) {
    console.log("════════════════════════════════════════════════════");
    console.log("[MAILER] ⚠  SMTP NOT CONFIGURED — email not sent");
    console.log(`[MAILER]    To      : ${opts.to}`);
    console.log(`[MAILER]    Subject : ${opts.subject}`);
    console.log("════════════════════════════════════════════════════");
    console.log("[MAILER] Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS to enable delivery.");
    console.log("════════════════════════════════════════════════════");
    return;
  }

  const info = await transport.sendMail({
    from,
    replyTo,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  console.log(`[MAILER] ✅ Email sent to ${opts.to} — messageId: ${info.messageId}`);
}

function logSmtpFailure(err: unknown): void {
  const e = err as { code?: string; message?: string };
  const code = e?.code ?? "UNKNOWN";
  const message = e?.message ?? "Unknown error";
  console.error("════════════════════════════════════════════════════");
  console.error("[MAILER] ❌ SEND FAILED");
  console.error(`[MAILER]    Error code : ${code}`);
  console.error(`[MAILER]    Message    : ${message}`);

  if (code === "EAUTH" || message.toLowerCase().includes("auth")) {
    console.error("[MAILER] 🔑 Authentication error — check SMTP_USER / SMTP_PASS (GitHub Secrets)");
    console.error("[MAILER]    Gmail: use an App Password with 2-Step Verification enabled");
  } else if (code === "ECONNREFUSED" || code === "ETIMEDOUT") {
    console.error("[MAILER] 🌐 Connection error — check SMTP_HOST / SMTP_PORT");
  } else if (code === "ESOCKET") {
    console.error("[MAILER] 🔒 TLS/socket error — try port 587 (TLS) or 465 (SSL)");
  }
  console.error("════════════════════════════════════════════════════");
}

async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  retries?: number;
}): Promise<void> {
  const attempts = opts.retries ?? SMTP_RETRY_ATTEMPTS;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await sendMailOnce(opts);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) {
        const delay = SMTP_RETRY_BASE_MS * attempt;
        console.warn(`[MAILER] Retry ${attempt}/${attempts - 1} for ${opts.to} in ${delay}ms…`);
        await sleep(delay);
      }
    }
  }

  logSmtpFailure(lastErr);
  throw lastErr;
}

// ─── Service request email (Insurance / Money Transfer / NSDL PAN, etc.) ─────

export async function sendServiceRequestEmail(opts: {
  service: string;
  user: { id: number; name: string; email: string; phone?: string | null };
  fields: Record<string, string>;
}): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || "";
  if (!adminEmail) {
    console.warn("[MAILER] ADMIN_EMAIL not set; service request not emailed");
    return;
  }
  const rows = Object.entries(opts.fields)
    .map(([k, v]) =>
      `<tr><td style="padding:6px 12px;background:#f9fafb;font-weight:600;border-bottom:1px solid #eee">${k}</td><td style="padding:6px 12px;border-bottom:1px solid #eee">${String(v ?? "—")}</td></tr>`)
    .join("");
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto">
      <div style="background:linear-gradient(90deg,#6366f1,#a855f7);color:#fff;padding:18px 20px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;font-size:18px">New Service Request — ${opts.service}</h2>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:0;padding:16px 20px;border-radius:0 0 8px 8px">
        <p style="margin:0 0 12px;color:#374151">A user has submitted a request for <b>${opts.service}</b>.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827">
          <tr><td style="padding:6px 12px;background:#f9fafb;font-weight:600;border-bottom:1px solid #eee">User</td><td style="padding:6px 12px;border-bottom:1px solid #eee">${opts.user.name} (#${opts.user.id})</td></tr>
          <tr><td style="padding:6px 12px;background:#f9fafb;font-weight:600;border-bottom:1px solid #eee">Email</td><td style="padding:6px 12px;border-bottom:1px solid #eee">${opts.user.email}</td></tr>
          ${opts.user.phone ? `<tr><td style="padding:6px 12px;background:#f9fafb;font-weight:600;border-bottom:1px solid #eee">Phone</td><td style="padding:6px 12px;border-bottom:1px solid #eee">${opts.user.phone}</td></tr>` : ""}
          ${rows}
        </table>
      </div>
    </div>`;
  await sendMail({ to: adminEmail, subject: `📩 ${opts.service} request from ${opts.user.name}`, html });
}

// ─── Password reset email ─────────────────────────────────────────────────────

export async function sendPasswordResetEmail(
  toEmail: string,
  toName:  string,
  token:   string,
): Promise<void> {
  const appUrl    = getAppUrl();
  const resetUrl  = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;

  console.log("════════════════════════════════════════════════════");
  console.log(`[MAILER] Password reset link for ${toEmail}:`);
  console.log(`[MAILER] ${resetUrl}`);
  console.log("════════════════════════════════════════════════════");

  const html = buildPasswordResetHtml(toName, resetUrl);
  await sendMail({ to: toEmail, subject: "🔐 Reset your password — Smit CSC Info", html });
}

// ─── Verification email ───────────────────────────────────────────────────────

export async function sendVerificationEmail(
  toEmail: string,
  toName:  string,
  token:   string,
): Promise<void> {
  const appUrl    = getAppUrl();
  const verifyUrl = `${appUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;

  console.log("════════════════════════════════════════════════════");
  console.log(`[MAILER] Verification link for ${toEmail}:`);
  console.log(`[MAILER] ${verifyUrl}`);
  console.log("════════════════════════════════════════════════════");

  const html = buildVerificationHtml(toName, verifyUrl);
  await sendMail({ to: toEmail, subject: "✅ Verify your email — Smit CSC Info", html });
}

// ─── Test email ───────────────────────────────────────────────────────────────

export async function sendTestEmail(toEmail: string): Promise<void> {
  const { host, port, user } = getSmtpConfig();
  const html = `
    <div style="font-family:Arial,sans-serif;padding:32px;max-width:500px;margin:auto;background:#f9f9f9;border-radius:12px;">
      <h2 style="color:#4F46E5;">✅ SMTP Test Successful!</h2>
      <p style="color:#333;">This is a test email from <strong>Smit CSC Info</strong> to verify your SMTP configuration is working correctly.</p>
      <table style="margin-top:16px;font-size:13px;color:#555;width:100%;">
        <tr><td style="padding:4px 0;"><strong>SMTP Host:</strong></td><td>${host}</td></tr>
        <tr><td style="padding:4px 0;"><strong>SMTP Port:</strong></td><td>${port}</td></tr>
        <tr><td style="padding:4px 0;"><strong>SMTP User:</strong></td><td>${user}</td></tr>
        <tr><td style="padding:4px 0;"><strong>Sent At:</strong></td><td>${new Date().toLocaleString()}</td></tr>
      </table>
      <p style="margin-top:24px;font-size:12px;color:#aaa;">Smit CSC Info · Gujarat, India</p>
    </div>`;
  await sendMail({ to: toEmail, subject: "🧪 SMTP Test — Smit CSC Info", html });
}
// ─── Payment success emails ───────────────────────────────────────────────────

function rupees(paise: number): string {
  return (Number(paise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}

function buildPaymentSuccessHtml(opts: {
  toName: string;
  heading: string;
  subheading: string;
  subheadingGu?: string;
  rows: Array<[string, string]>;
  rowHtml?: Array<[string, string]>;
  gradient?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  benefits?: string[];
  preheader?: string;
}): string {
  const receiptRows: PaymentReceiptRow[] = opts.rows.map(([label, value]) => ({
    label,
    value,
  }));
  if (opts.rowHtml) {
    for (const [label, value] of opts.rowHtml) {
      receiptRows.push({ label, value, valueIsHtml: true });
    }
  }
  return buildPaymentReceiptHtml({
    memberName: opts.toName,
    headline: opts.heading,
    congratulation: opts.subheading,
    congratulationGu: opts.subheadingGu,
    rows: receiptRows,
    benefits: opts.benefits,
    ctaLabel: opts.ctaLabel,
    ctaUrl: opts.ctaUrl,
    footerNote: opts.footerNote,
    gradient: opts.gradient,
    preheader: opts.preheader,
  });
}

export async function sendRechargeSuccessEmail(opts: {
  toEmail: string;
  toName: string;
  operatorName: string;
  type: string;
  accountNumber: string;
  amountPaise: number;
  transactionId: string;
  completedAt: Date | string;
  commissionPaise?: number;
}): Promise<void> {
  const rows: Array<[string, string]> = [
    ["Service", opts.type.toUpperCase()],
    ["Operator", opts.operatorName],
    ["Number / Account", opts.accountNumber],
    ["Amount", `₹ ${rupees(opts.amountPaise)}`],
    ["Transaction ID", opts.transactionId],
    ["Date & Time", fmtDate(opts.completedAt)],
  ];
  const rowHtml: Array<[string, string]> = [
    ["Status", `<span style="color:#16a34a;font-weight:800;">✓ PAYMENT SUCCESS</span>`],
  ];
  if (opts.commissionPaise && opts.commissionPaise > 0) {
    rowHtml.unshift([
      "Commission Earned",
      `<span style="color:#16a34a;font-weight:700;">+ ₹ ${rupees(opts.commissionPaise)}</span>`,
    ]);
  }
  const html = buildPaymentSuccessHtml({
    toName: opts.toName,
    heading: "Recharge Successful!",
    subheading: `Congratulations! Your ${opts.operatorName} recharge was completed successfully. Transaction details are below.`,
    subheadingGu: `અભિનંદન! તમારું ${opts.operatorName} recharge સફળતાપૂર્વક પૂર્ણ થયું છે.`,
    rows,
    rowHtml,
    gradient: "linear-gradient(135deg,#059669 0%,#10b981 100%)",
    ctaLabel: "View My Recharges",
    ctaUrl: `${getAppUrl()}/recharge`,
    preheader: `Recharge confirmed — ₹${rupees(opts.amountPaise)} — ${opts.transactionId}`,
  });
  await sendMail({
    to: opts.toEmail,
    subject: `✅ Recharge Successful — ₹${rupees(opts.amountPaise)} ${opts.operatorName}`,
    html,
    retries: SMTP_RETRY_ATTEMPTS,
  });
}

export async function sendWalletTopupSuccessEmail(opts: {
  toEmail: string;
  toName: string;
  amountPaise: number;
  transactionId: string;
  completedAt: Date | string;
  method?: string;
  newBalancePaise?: number;
}): Promise<void> {
  const rows: Array<[string, string]> = [
    ["Amount Added", `₹ ${rupees(opts.amountPaise)}`],
    ["Payment Method", (opts.method ?? "PhonePe").toUpperCase()],
    ["Transaction ID", opts.transactionId],
    ["Date & Time", fmtDate(opts.completedAt)],
  ];
  const rowHtml: Array<[string, string]> = [
    ["Status", `<span style="color:#16a34a;font-weight:800;">✓ WALLET CREDITED</span>`],
  ];
  if (typeof opts.newBalancePaise === "number") {
    rows.push(["New Wallet Balance", `₹ ${rupees(opts.newBalancePaise)}`]);
  }
  const html = buildPaymentSuccessHtml({
    toName: opts.toName,
    heading: "Wallet Top-up Successful!",
    subheading: `Congratulations! ₹ ${rupees(opts.amountPaise)} has been added to your wallet. You can now use recharge and other paid services.`,
    subheadingGu: `અભિનંદન! તમારા wallet માં ₹ ${rupees(opts.amountPaise)} સફળતાપૂર્વક add થયા છે.`,
    rows,
    rowHtml,
    gradient: "linear-gradient(135deg,#7c3aed 0%,#a855f7 100%)",
    ctaLabel: "Open Wallet",
    ctaUrl: `${getAppUrl()}/wallet`,
    preheader: `Wallet credited — ₹${rupees(opts.amountPaise)} — ${opts.transactionId}`,
  });
  await sendMail({
    to: opts.toEmail,
    subject: `✅ ₹${rupees(opts.amountPaise)} added to your wallet | ${opts.transactionId}`,
    html,
    retries: SMTP_RETRY_ATTEMPTS,
  });
}

export async function sendOperatorTierSuccessEmail(opts: {
  toEmail: string;
  toName: string;
  tier: "gold" | "premium";
  amountPaise: number;
  transactionId: string;
  completedAt: Date | string;
}): Promise<void> {
  const isPremium = opts.tier === "premium";
  const label = isPremium ? "PREMIUM" : "GOLD";
  const commissionLine = isPremium ? "90% commission" : "80% commission";
  const gradient = isPremium
    ? "linear-gradient(135deg,#7c2d92 0%,#6d28d9 50%,#4338ca 100%)"
    : "linear-gradient(135deg,#d97706 0%,#f59e0b 50%,#eab308 100%)";
  const rows: Array<[string, string]> = [
    ["Plan Activated", `${label} (Lifetime)`],
    ["Commission Rate", commissionLine],
    ["Amount Paid", `₹ ${rupees(opts.amountPaise)}`],
    ["Transaction ID", opts.transactionId],
    ["Date & Time", fmtDate(opts.completedAt)],
  ];
  const rowHtml: Array<[string, string]> = [
    ["Status", `<span style="color:#16a34a;font-weight:800;">✓ PAYMENT CONFIRMED</span>`],
  ];
  const html = buildPaymentSuccessHtml({
    toName: opts.toName,
    heading: `${label} Plan Activated!`,
    subheading: `Congratulations! Your ${label} operator plan is now active for lifetime. You will earn ${commissionLine} on every successful recharge.`,
    subheadingGu: `અભિનંદન! તમારું ${label} plan lifetime માટે activate થઈ ગયું છે.`,
    rows,
    rowHtml,
    gradient,
    ctaLabel: "Start Earning",
    ctaUrl: `${getAppUrl()}/recharge`,
    footerNote:
      "💎 <strong>Lifetime access:</strong> Your plan never expires. Commission is credited automatically to your wallet after each successful recharge.",
    preheader: `${label} plan activated — ${opts.transactionId}`,
  });
  await sendMail({
    to: opts.toEmail,
    subject: `🎉 ${label} Plan Activated — Payment Confirmed | ${opts.transactionId}`,
    html,
    retries: SMTP_RETRY_ATTEMPTS,
  });
}

export async function sendMembershipSuccessEmail(opts: {
  toEmail: string;
  toName: string;
  plan: string;
  planDisplayName?: string;
  planDisplayNameGu?: string;
  durationLabel?: string;
  benefits?: string[];
  amountPaise: number;
  transactionId: string;
  completedAt: Date | string;
  expiryDate?: Date | string | null;
  isRenewal?: boolean;
  couponCode?: string;
  discountPaise?: number;
}): Promise<void> {
  const planLabel = opts.planDisplayName ?? opts.plan.replace(/^\w/, (c) => c.toUpperCase());
  const heading = opts.isRenewal ? "Membership Renewed Successfully!" : "Payment Successful — Welcome to Prime!";
  const subheading = opts.isRenewal
    ? `Congratulations! Your ${planLabel} has been renewed. Thank you for continuing with Smit CSC Info — your premium access remains active.`
    : `Congratulations! Your payment was successful and your ${planLabel} is now active. You now have full access to premium tutorials, tools, and documents.`;
  const subheadingGu = opts.isRenewal
    ? `અભિનંદન! તમારી ${opts.planDisplayNameGu ?? planLabel} membership સફળતાપૂર્વક renew થઈ ગઈ. Smit CSC Info સાથે જોડાયેલા રહેવા બદલ આભાર.`
    : `અભિનંદન! તમારી ચૂકવણી સફળ થઈ અને ${opts.planDisplayNameGu ?? planLabel} activate થઈ ગયું છે. હવે તમે બધી premium સુવિધાઓ વાપરી શકો છો.`;

  const rows: Array<[string, string]> = [
    ["Plan", planLabel],
    ["Duration", opts.durationLabel ?? "—"],
    ["Amount Paid", `₹ ${rupees(opts.amountPaise)}`],
    ["Transaction ID", opts.transactionId],
    ["Payment Date", fmtDate(opts.completedAt)],
  ];
  if (opts.couponCode) {
    rows.push(["Coupon Applied", opts.couponCode.toUpperCase()]);
  }
  if (opts.discountPaise && opts.discountPaise > 0) {
    rows.push(["Discount", `− ₹ ${rupees(opts.discountPaise)}`]);
  }
  if (opts.expiryDate) {
    rows.push(["Valid Until", fmtDate(opts.expiryDate)]);
  }

  const rowHtml: Array<[string, string]> = [
    [
      "Status",
      `<span style="color:#16a34a;font-weight:800;">✓ PAYMENT ${opts.isRenewal ? "RENEWED" : "CONFIRMED"}</span>`,
    ],
  ];

  const html = buildPaymentSuccessHtml({
    toName: opts.toName,
    heading,
    subheading,
    subheadingGu,
    rows,
    rowHtml,
    benefits: opts.benefits,
    gradient: "linear-gradient(135deg,#7c2d12 0%,#ea580c 45%,#f59e0b 100%)",
    ctaLabel: "Open Prime Dashboard",
    ctaUrl: `${getAppUrl()}/dashboard`,
    footerNote:
      "⭐ <strong>Premium unlocked:</strong> Access exclusive Gujarati tutorials, PDF tools, document library, and priority support from your dashboard.",
    preheader: `Payment confirmed — ${planLabel} — Txn ${opts.transactionId}`,
  });

  const subject = opts.isRenewal
    ? `✅ Membership Renewed — ${planLabel} | ${opts.transactionId}`
    : `🎉 Payment Successful — Welcome to ${planLabel} | ${opts.transactionId}`;

  await sendMail({ to: opts.toEmail, subject, html, retries: SMTP_RETRY_ATTEMPTS });
}

// ─── Prime renewal/expiry reminder email ──────────────────────────────────────

export async function sendPrimeReminderEmail(
  toEmail: string,
  subject: string,
  html: string,
): Promise<void> {
  await sendMail({ to: toEmail, subject, html });
}

// ─── HTML builders ────────────────────────────────────────────────────────────

function buildPasswordResetHtml(toName: string, resetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:540px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(79,70,229,.10);">
        <tr>
          <td style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);padding:36px 40px;text-align:center;">
            <p style="margin:0;font-size:22px;font-weight:800;color:#fff;">Smit CSC Info</p>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,.80);">Gujarat's #1 CSC Resource Platform</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a2e;">Hello, ${toName} 👋</p>
            <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#333;">Password Reset Request</p>
            <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
              We received a request to reset your password. Click the button below to choose a new password. This link is valid for <strong>1 hour</strong>.
            </p>
            <div style="text-align:center;margin:0 0 28px;">
              <a href="${resetUrl}"
                 style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;">
                🔐 Reset My Password
              </a>
            </div>
            <p style="margin:0 0 8px;font-size:13px;color:#888;">Or paste this link in your browser:</p>
            <p style="margin:0 0 24px;font-size:12px;color:#4F46E5;word-break:break-all;">${resetUrl}</p>
            <div style="background:#fff8f0;border:1px solid #fde8cc;border-radius:8px;padding:14px 16px;margin:0 0 0;">
              <p style="margin:0;font-size:13px;color:#92400e;">
                ⚠️ If you did not request a password reset, please ignore this email. Your password will remain unchanged.
              </p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f8ff;padding:20px 40px;text-align:center;border-top:1px solid #ececf5;">
            <p style="margin:0;font-size:12px;color:#aaa;">© ${new Date().getFullYear()} Smit CSC Info · Gujarat, India</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildVerificationHtml(toName: string, verifyUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Verify your email</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:540px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(79,70,229,.10);">
        <tr>
          <td style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);padding:36px 40px;text-align:center;">
            <p style="margin:0;font-size:22px;font-weight:800;color:#fff;">Smit CSC Info</p>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,.80);">Gujarat's #1 CSC Resource Platform</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a2e;">Hello, ${toName} 👋</p>
            <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
              Thank you for registering. Please verify your email address to activate your account and access all features.
            </p>
            <div style="text-align:center;margin:0 0 28px;">
              <a href="${verifyUrl}"
                 style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;">
                ✅ Verify My Email
              </a>
            </div>
            <p style="margin:0 0 8px;font-size:13px;color:#888;">Or paste this link in your browser:</p>
            <p style="margin:0 0 24px;font-size:12px;color:#4F46E5;word-break:break-all;">${verifyUrl}</p>
            <p style="margin:0;font-size:13px;color:#aaa;">This link expires in <strong>24 hours</strong>. If you did not create this account, you can safely ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f8ff;padding:20px 40px;text-align:center;border-top:1px solid #ececf5;">
            <p style="margin:0;font-size:12px;color:#aaa;">© ${new Date().getFullYear()} Smit CSC Info · Gujarat, India</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
