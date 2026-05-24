import nodemailer from "nodemailer";

// ─── App base URL ─────────────────────────────────────────────────────────────

function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "http://localhost:8080";
}

// ─── SMTP config ──────────────────────────────────────────────────────────────

function getSmtpConfig() {
  return {
    host: process.env.SMTP_HOST ?? "",
    port: parseInt(process.env.SMTP_PORT ?? "587", 10),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@smitcscinfo.com",
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

// ─── Core send function ───────────────────────────────────────────────────────

async function sendMail(opts: { to: string; subject: string; html: string }): Promise<void> {
  const { from } = getSmtpConfig();
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

  try {
    const info = await transport.sendMail({
      from: `"Smit CSC Info" <${from}>`,
      to:      opts.to,
      subject: opts.subject,
      html:    opts.html,
    });
    console.log(`[MAILER] ✅ Email sent to ${opts.to} — messageId: ${info.messageId}`);
  } catch (err: any) {
    const code    = err?.code    ?? "UNKNOWN";
    const message = err?.message ?? "Unknown error";
    console.error("════════════════════════════════════════════════════");
    console.error("[MAILER] ❌ SEND FAILED");
    console.error(`[MAILER]    Error code : ${code}`);
    console.error(`[MAILER]    Message    : ${message}`);

    if (code === "EAUTH" || message.toLowerCase().includes("auth")) {
      console.error("[MAILER] 🔑 Authentication error — check SMTP_USER / SMTP_PASS");
      console.error("[MAILER]    Gmail users: use an App Password, not your regular password");
      console.error("[MAILER]    Gmail > Manage Google Account > Security > 2-Step Verification > App Passwords");
    } else if (code === "ECONNREFUSED" || code === "ETIMEDOUT") {
      console.error("[MAILER] 🌐 Connection error — check SMTP_HOST / SMTP_PORT");
      console.error("[MAILER]    Gmail: smtp.gmail.com, Port 587 (TLS) or 465 (SSL)");
      console.error("[MAILER]    Hostinger: smtp.hostinger.com, Port 587");
    } else if (code === "ESOCKET") {
      console.error("[MAILER] 🔒 TLS/socket error — try switching port (587 ↔ 465)");
    }

    console.error("════════════════════════════════════════════════════");
    throw err;
  }
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

type PaymentEmailKind = "recharge" | "wallet_topup" | "operator_tier" | "membership" | "membership_renewal";

function rupees(paise: number): string {
  return (Number(paise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}

function buildPaymentSuccessHtml(opts: {
  kind: PaymentEmailKind;
  toName: string;
  heading: string;
  subheading: string;
  rows: Array<[string, string]>;
  gradient?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const gradient = opts.gradient || "linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%)";
  const rowsHtml = opts.rows.map(([k, v]) => `
    <tr>
      <td style="padding:10px 14px;background:#f8fafc;font-weight:600;color:#475569;font-size:13px;border-bottom:1px solid #eef2f7;width:42%">${k}</td>
      <td style="padding:10px 14px;color:#0f172a;font-size:14px;border-bottom:1px solid #eef2f7;font-weight:500">${v}</td>
    </tr>`).join("");
  const cta = opts.ctaUrl && opts.ctaLabel ? `
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${opts.ctaUrl}" style="display:inline-block;padding:13px 32px;background:${gradient};color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;">
        ${opts.ctaLabel}
      </a>
    </div>` : "";
  const footer = opts.footerNote ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;margin:0 0 8px;">
      <p style="margin:0;font-size:13px;color:#166534;line-height:1.5;">${opts.footerNote}</p>
    </div>` : "";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f9;padding:32px 12px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.08);">
        <tr>
          <td style="background:${gradient};padding:32px 36px;text-align:center;">
            <p style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:.3px;">Smit CSC Info</p>
            <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.85);">Gujarat's #1 CSC Resource Platform</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px 8px;text-align:center;">
            <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0f172a;">${opts.heading}</h2>
            <p style="margin:0 0 4px;font-size:15px;color:#334155;">Hello <b>${opts.toName}</b> 👋</p>
            <p style="margin:0 0 20px;font-size:14px;color:#64748b;line-height:1.6;">${opts.subheading}</p>
          </td>
        </tr>
        <tr><td style="padding:0 36px 24px;">
          <table style="width:100%;border-collapse:collapse;border:1px solid #eef2f7;border-radius:10px;overflow:hidden;">
            ${rowsHtml}
          </table>
        </td></tr>
        ${cta ? `<tr><td style="padding:0 36px;">${cta}</td></tr>` : ""}
        ${footer ? `<tr><td style="padding:0 36px 24px;">${footer}</td></tr>` : ""}
        <tr>
          <td style="background:#f8f8ff;padding:18px 36px;text-align:center;border-top:1px solid #ececf5;">
            <p style="margin:0 0 4px;font-size:12px;color:#64748b;">Need help? Email <a href="mailto:admin@smitcscinfo.com" style="color:#4F46E5;text-decoration:none">admin@smitcscinfo.com</a></p>
            <p style="margin:0;font-size:11px;color:#aaa;">© ${new Date().getFullYear()} Smit CSC Info · Gujarat, India</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
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
    ["Status", `<span style="color:#16a34a;font-weight:700">✓ SUCCESS</span>`],
  ];
  if (opts.commissionPaise && opts.commissionPaise > 0) {
    rows.splice(5, 0, ["Commission Earned", `<span style="color:#16a34a;font-weight:700">+ ₹ ${rupees(opts.commissionPaise)}</span>`]);
  }
  const html = buildPaymentSuccessHtml({
    kind: "recharge",
    toName: opts.toName,
    heading: "🎉 Recharge Successful!",
    subheading: `તમારું <b>${opts.operatorName}</b> recharge સફળતાપૂર્વક પૂર્ણ થયું છે. વિગતો નીચે જુઓ.`,
    rows,
    gradient: "linear-gradient(135deg,#059669 0%,#10b981 100%)",
    ctaLabel: "View My Recharges",
    ctaUrl: `${getAppUrl()}/recharge`,
  });
  await sendMail({ to: opts.toEmail, subject: `✅ Recharge Successful — ₹${rupees(opts.amountPaise)} ${opts.operatorName}`, html });
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
    ["Amount Added", `<span style="color:#16a34a;font-weight:700">+ ₹ ${rupees(opts.amountPaise)}</span>`],
    ["Payment Method", (opts.method ?? "PhonePe").toUpperCase()],
    ["Transaction ID", opts.transactionId],
    ["Date & Time", fmtDate(opts.completedAt)],
    ["Status", `<span style="color:#16a34a;font-weight:700">✓ CREDITED</span>`],
  ];
  if (typeof opts.newBalancePaise === "number") {
    rows.push(["New Wallet Balance", `<b>₹ ${rupees(opts.newBalancePaise)}</b>`]);
  }
  const html = buildPaymentSuccessHtml({
    kind: "wallet_topup",
    toName: opts.toName,
    heading: "💰 Wallet Top-up Successful!",
    subheading: `તમારા wallet માં <b>₹ ${rupees(opts.amountPaise)}</b> સફળતાપૂર્વક add થયા છે. હવે recharge અને other services use કરી શકો છો.`,
    rows,
    gradient: "linear-gradient(135deg,#7c3aed 0%,#a855f7 100%)",
    ctaLabel: "Open Wallet",
    ctaUrl: `${getAppUrl()}/recharge`,
  });
  await sendMail({ to: opts.toEmail, subject: `✅ ₹${rupees(opts.amountPaise)} added to your wallet`, html });
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
    ["Plan Activated", `<span style="font-weight:800;color:${isPremium ? "#6d28d9" : "#d97706"}">${label} (Lifetime)</span>`],
    ["Commission Rate", commissionLine],
    ["Amount Paid", `₹ ${rupees(opts.amountPaise)}`],
    ["Transaction ID", opts.transactionId],
    ["Date & Time", fmtDate(opts.completedAt)],
    ["Status", `<span style="color:#16a34a;font-weight:700">✓ ACTIVATED</span>`],
  ];
  const html = buildPaymentSuccessHtml({
    kind: "operator_tier",
    toName: opts.toName,
    heading: `🎉 ${label} Plan Activated!`,
    subheading: `અભિનંદન! તમારું <b>${label}</b> plan lifetime માટે activate થઈ ગયું છે. હવે દરેક recharge પર <b>${commissionLine}</b> મળશે.`,
    rows,
    gradient,
    ctaLabel: "Start Earning",
    ctaUrl: `${getAppUrl()}/recharge`,
    footerNote: `💎 <b>Lifetime Access:</b> Plan કદી expire થશે નહીં. દરેક successful recharge પર automatic commission તમારા wallet માં credit થશે.`,
  });
  await sendMail({ to: opts.toEmail, subject: `🎉 ${label} Plan Activated — Welcome to Smit CSC Info`, html });
}

export async function sendMembershipSuccessEmail(opts: {
  toEmail: string;
  toName: string;
  plan: string;
  amountPaise: number;
  transactionId: string;
  completedAt: Date | string;
  expiryDate?: Date | string | null;
  isRenewal?: boolean;
}): Promise<void> {
  const heading = opts.isRenewal ? "🔄 Membership Renewed!" : "🎉 Welcome to Prime!";
  const subheading = opts.isRenewal
    ? `તમારી <b>${opts.plan.toUpperCase()}</b> membership સફળતાપૂર્વક renew થઈ ગઈ. Thank you for staying with us! 🙏`
    : `અભિનંદન! તમારી <b>${opts.plan.toUpperCase()}</b> membership activate થઈ ગઈ છે. હવે બધી premium features unlock થઈ ગઈ છે.`;
  const rows: Array<[string, string]> = [
    ["Plan", `<b>${opts.plan.toUpperCase()}</b>`],
    ["Amount Paid", `₹ ${rupees(opts.amountPaise)}`],
    ["Transaction ID", opts.transactionId],
    ["Date & Time", fmtDate(opts.completedAt)],
  ];
  if (opts.expiryDate) {
    rows.push(["Valid Until", `<b>${fmtDate(opts.expiryDate)}</b>`]);
  }
  rows.push(["Status", `<span style="color:#16a34a;font-weight:700">✓ ${opts.isRenewal ? "RENEWED" : "ACTIVATED"}</span>`]);

  const html = buildPaymentSuccessHtml({
    kind: opts.isRenewal ? "membership_renewal" : "membership",
    toName: opts.toName,
    heading,
    subheading,
    rows,
    gradient: "linear-gradient(135deg,#dc2626 0%,#ea580c 50%,#f59e0b 100%)",
    ctaLabel: "Explore Prime Features",
    ctaUrl: `${getAppUrl()}/membership`,
    footerNote: `⭐ <b>Premium Access:</b> તમે હવે બધા exclusive content, tools અને documents access કરી શકો છો.`,
  });
  await sendMail({ to: opts.toEmail, subject: `✅ ${heading.replace(/[🎉🔄]/g, "").trim()} — ${opts.plan.toUpperCase()}`, html });
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
