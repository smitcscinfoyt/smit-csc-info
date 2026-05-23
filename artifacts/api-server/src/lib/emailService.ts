/**
 * Email Service — Zoho SMTP via Nodemailer.
 * Sends welcome, transaction & wallet emails. All failures are non-blocking.
 */

import nodemailer from "nodemailer";

const FROM = process.env.ZOHO_EMAIL ?? "admin@smitcscinfo.com";
const SUPPORT_URL = "https://smitcscinfo.com/support";
const BRAND = "Smit CSC Info";
const LOGO = "https://smitcscinfo.com/logo.png";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_PASSWORD) {
    console.warn("[email] ZOHO_EMAIL / ZOHO_PASSWORD not set — emails disabled.");
    return null;
  }
  transporter = nodemailer.createTransport({
    host: "smtp.zoho.in",
    port: 465,
    secure: true,
    auth: { user: process.env.ZOHO_EMAIL, pass: process.env.ZOHO_PASSWORD },
  });
  return transporter;
}

async function send(to: string, subject: string, html: string) {
  try {
    const tx = getTransporter();
    if (!tx || !to) return;
    await tx.sendMail({
      from: `"${BRAND}" <${FROM}>`,
      to, subject, html,
    });
    console.log(`[email] ✅ Sent "${subject}" → ${to}`);
  } catch (err: any) {
    console.error(`[email] ❌ Failed "${subject}" → ${to}:`, err?.message);
  }
}

// ── Shared HTML wrapper (mobile-responsive) ──────────────────────────────────
function wrap(title: string, body: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font-family:Arial,sans-serif;background:#f5f5f5;color:#333">
  <div style="max-width:600px;margin:0 auto;background:#fff">
    <div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:30px 20px;text-align:center;color:#fff">
      <img src="${LOGO}" alt="${BRAND}" style="height:60px;border-radius:50%;background:#fff;padding:6px"/>
      <h1 style="margin:12px 0 0;font-size:22px">${title}</h1>
    </div>
    <div style="padding:30px 24px;line-height:1.6">${body}</div>
    <div style="background:#f9fafb;padding:20px;text-align:center;color:#888;font-size:12px;border-top:1px solid #eee">
      <p>Need help? <a href="${SUPPORT_URL}" style="color:#667eea">Contact Support</a></p>
      <p>© ${new Date().getFullYear()} ${BRAND} · Rural Gujarat's Trusted Digital Partner</p>
    </div>
  </div>
</body></html>`;
}

// ── Plan info ────────────────────────────────────────────────────────────────
const PLAN_INFO: Record<string, { name: string; benefits: string[] }> = {
  prime:        { name: "Prime Membership",          benefits: ["Premium content access","Document downloads","Priority support"] },
  monthly:      { name: "Prime Monthly",             benefits: ["30 days Prime access","All premium features","Document library"] },
  quarterly:    { name: "Prime Quarterly",           benefits: ["90 days Prime access","All premium features","Document library","Save 15%"] },
  yearly:       { name: "Prime Yearly",              benefits: ["365 days Prime access","All premium features","Best value","Save 40%"] },
  gold:         { name: "Gold Operator",             benefits: ["Operator dashboard","Higher commissions","Bulk recharge","Priority support"] },
  premium:      { name: "Premium Operator",          benefits: ["All Gold features","Highest commissions","Dedicated manager","API access"] },
};

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/** Welcome email when user joins/upgrades to a plan. */
export async function sendWelcomeEmail(opts: {
  to: string;
  name?: string | null;
  plan: string;
  amountRupees: number;
  transactionId: string;
  expiryDate?: Date | null;
}) {
  const info = PLAN_INFO[opts.plan] ?? { name: opts.plan.toUpperCase(), benefits: [] };
  const benefitList = info.benefits.map(b => `<li>${b}</li>`).join("");
  const expiry = opts.expiryDate
    ? `<p><strong>Valid until:</strong> ${opts.expiryDate.toDateString()}</p>` : "";
  const body = `
    <h2 style="color:#667eea;margin-top:0">Welcome${opts.name ? `, ${opts.name}` : ""}! 🎉</h2>
    <p>Thank you for joining <strong>${info.name}</strong>. Your subscription is now active.</p>
    <div style="background:#f9fafb;border-left:4px solid #667eea;padding:16px;margin:20px 0;border-radius:4px">
      <p style="margin:4px 0"><strong>Plan:</strong> ${info.name}</p>
      <p style="margin:4px 0"><strong>Amount Paid:</strong> ₹${opts.amountRupees.toFixed(2)}</p>
      <p style="margin:4px 0"><strong>Transaction ID:</strong> ${opts.transactionId}</p>
      ${expiry}
    </div>
    ${benefitList ? `<h3 style="color:#333">Your benefits:</h3><ul>${benefitList}</ul>` : ""}
    <div style="text-align:center;margin:24px 0">
      <a href="https://smitcscinfo.com" style="background:#667eea;color:#fff;padding:12px 30px;border-radius:6px;text-decoration:none;display:inline-block">Go to Dashboard</a>
    </div>
    <p style="color:#666;font-size:13px">Want more? Upgrade to higher plans anytime from your dashboard for additional benefits.</p>`;
  await send(opts.to, `Welcome to ${info.name} — Smit CSC Info`, wrap("Welcome to Smit CSC Info", body));
}

/** Transaction email for recharge, bills, services. */
export async function sendTransactionEmail(opts: {
  to: string;
  name?: string | null;
  service: string;       // "Mobile Recharge", "DTH", "Electricity Bill"...
  amountRupees: number;
  transactionId: string;
  status?: "success" | "pending" | "failed";
  extra?: Record<string, string>;
}) {
  const status = opts.status ?? "success";
  const colorMap = { success: "#10b981", pending: "#f59e0b", failed: "#ef4444" };
  const label = { success: "✅ Successful", pending: "⏳ Pending", failed: "❌ Failed" };
  const extraRows = opts.extra
    ? Object.entries(opts.extra).map(([k,v]) => `<tr><td style="padding:6px 0;color:#666">${k}</td><td style="padding:6px 0;text-align:right"><strong>${v}</strong></td></tr>`).join("")
    : "";
  const body = `
    <h2 style="color:${colorMap[status]};margin-top:0">${label[status]}</h2>
    <p>Hello${opts.name ? ` ${opts.name}` : ""}, your <strong>${opts.service}</strong> transaction is ${status}.</p>
    <div style="background:#f9fafb;padding:20px;border-radius:6px;margin:20px 0">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#666">Service</td><td style="padding:6px 0;text-align:right"><strong>${opts.service}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#666">Amount</td><td style="padding:6px 0;text-align:right"><strong>₹${opts.amountRupees.toFixed(2)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#666">Transaction ID</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-size:12px">${opts.transactionId}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Date</td><td style="padding:6px 0;text-align:right">${new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})}</td></tr>
        ${extraRows}
      </table>
    </div>
    <p style="color:#666;font-size:13px">Save this email for your records. If anything looks wrong, contact support immediately.</p>`;
  await send(opts.to, `${opts.service} — ₹${opts.amountRupees.toFixed(2)} — ${status.toUpperCase()}`, wrap(`${opts.service} Receipt`, body));
}

/** Wallet add-money email. */
export async function sendWalletCreditEmail(opts: {
  to: string;
  name?: string | null;
  amountRupees: number;
  transactionId: string;
  newBalanceRupees?: number;
}) {
  const balance = opts.newBalanceRupees !== undefined
    ? `<p><strong>New Balance:</strong> ₹${opts.newBalanceRupees.toFixed(2)}</p>` : "";
  const body = `
    <h2 style="color:#10b981;margin-top:0">💰 Wallet Credited</h2>
    <p>Hello${opts.name ? ` ${opts.name}` : ""}, ₹${opts.amountRupees.toFixed(2)} has been added to your wallet.</p>
    <div style="background:#f9fafb;padding:16px;border-radius:6px;margin:20px 0">
      <p style="margin:4px 0"><strong>Amount Added:</strong> ₹${opts.amountRupees.toFixed(2)}</p>
      <p style="margin:4px 0"><strong>Transaction ID:</strong> ${opts.transactionId}</p>
      ${balance}
      <p style="margin:4px 0"><strong>Date:</strong> ${new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})}</p>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="https://smitcscinfo.com/wallet" style="background:#10b981;color:#fff;padding:12px 30px;border-radius:6px;text-decoration:none">View Wallet</a>
    </div>`;
  await send(opts.to, `₹${opts.amountRupees.toFixed(2)} added to your wallet`, wrap("Wallet Credit Confirmation", body));
}
