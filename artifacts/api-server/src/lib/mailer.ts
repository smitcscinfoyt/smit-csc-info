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
