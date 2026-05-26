import { Router } from "express";
import { sendTestEmail, sendMembershipSuccessEmail, getSmtpStatus } from "../lib/mailer";

const router = Router();

/**
 * GET /api/test-email/config
 * Returns the currently active SMTP configuration (no email sent).
 * Use this to confirm what HOST/PORT/USER is actually running on the server.
 */
router.get("/test-email/config", (req, res): void => {
  const status = getSmtpStatus();
  res.json({
    smtpConfigured: status.configured,
    host: status.host  || "(not set)",
    port: status.port  || "(not set)",
    user: status.user  || "(not set)",
    pass: status.configured ? "✓ set (hidden)" : "(not set)",
    hint: !status.configured
      ? "Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in GitHub Secrets and redeploy."
      : status.host.includes("zoho")
      ? "Zoho SMTP detected. Make sure SMTP_PASS is a Zoho App Password (not your regular login password). Generate at: mail.zoho.in → Settings → Security → App Passwords."
      : status.host.includes("gmail")
      ? "Gmail SMTP detected. Make sure SMTP_PASS is a Gmail App Password. Generate at: myaccount.google.com → Security → App Passwords."
      : "SMTP is configured. Test with /api/test-email?to=you@email.com",
  });
});

/**
 * GET /api/test-email?to=someone@gmail.com
 * Sends a test email and returns a detailed SMTP status report.
 * Remove or protect this route before going to production.
 */
router.get("/test-email", async (req, res): Promise<void> => {
  const to = typeof req.query.to === "string" ? req.query.to.trim() : null;

  const status = getSmtpStatus();

  if (!status.configured) {
    res.status(503).json({
      success: false,
      smtpConfigured: false,
      message: "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS as secrets.",
      currentConfig: {
        SMTP_HOST: status.host  || "(not set)",
        SMTP_PORT: status.port  || "(not set)",
        SMTP_USER: status.user  || "(not set)",
        SMTP_PASS: "(hidden)",
      },
      helpZoho: [
        "1. Login to mail.zoho.in → Settings (gear) → Security → App Passwords",
        "2. Click 'Generate New Password', name it 'smit-csc-info'",
        "3. Copy the 12-char App Password (shown only once)",
        "4. In GitHub → Settings → Secrets → update ENV_SMTP_PASS with the App Password",
        "5. Also verify ENV_SMTP_USER = admin@smitcscinfo.com",
        "6. Re-run the GitHub Actions deploy workflow",
      ],
    });
    return;
  }

  if (!to) {
    res.status(400).json({ success: false, message: "Provide ?to=recipient@email.com in the URL" });
    return;
  }

  try {
    await sendTestEmail(to);
    res.json({
      success: true,
      message: `Test email sent to ${to}. Check the inbox (and spam folder).`,
      smtpConfig: {
        host: status.host,
        port: status.port,
        user: status.user,
      },
    });
  } catch (err: any) {
    const isZoho  = status.host.includes("zoho");
    const isGmail = status.host.includes("gmail");

    let hint = "Check server logs for details.";
    if (err?.code === "EAUTH") {
      if (isZoho) {
        hint =
          "Zoho 535 Authentication Failed: SMTP_PASS must be a Zoho App Password — NOT your regular login password. " +
          "Go to mail.zoho.in → Settings → Security → App Passwords → Generate. " +
          "Then update ENV_SMTP_PASS in GitHub Secrets and redeploy.";
      } else if (isGmail) {
        hint =
          "Gmail 535 Authentication Failed: Enable 2-Step Verification at myaccount.google.com, " +
          "then generate an App Password (Security → App Passwords). Use that as SMTP_PASS.";
      } else {
        hint = "Authentication failed. Verify SMTP_USER and SMTP_PASS are correct for your mail provider.";
      }
    } else if (err?.code === "ECONNREFUSED" || err?.code === "ETIMEDOUT") {
      hint = `Cannot connect to ${status.host}:${status.port}. Verify SMTP_HOST and SMTP_PORT are correct.`;
    } else if (err?.code === "ESOCKET") {
      hint = "TLS/socket error. Try SMTP_PORT=587 with secure=false (STARTTLS).";
    }

    res.status(500).json({
      success: false,
      smtpConfigured: true,
      smtpConfig: {
        host: status.host,
        port: status.port,
        user: status.user,
      },
      error: err?.message ?? "Unknown error",
      code:  err?.code   ?? "UNKNOWN",
      hint,
      zohoAppPasswordSteps: isZoho && err?.code === "EAUTH" ? [
        "1. Open mail.zoho.in and login as admin@smitcscinfo.com",
        "2. Click the gear icon (Settings) → go to 'Security'",
        "3. Find 'App Passwords' section → click 'Generate New Password'",
        "4. Name: smit-csc-info → click Generate → COPY the password immediately",
        "5. Go to github.com/smitcscinfoyt/smit-csc-info/settings/secrets/actions",
        "6. Update 'ENV_SMTP_PASS' with the copied App Password",
        "7. Go to Actions tab → latest run → click 'Re-run all jobs'",
        "8. Wait 2 mins → test again: smitcscinfo.com/api/test-email?to=admin@smitcscinfo.com",
      ] : undefined,
    });
  }
});

/**
 * GET /api/test-email/payment?to=member@example.com
 * Sends a sample Prime payment success receipt (for design/SMTP verification).
 */
router.get("/test-email/payment", async (req, res): Promise<void> => {
  const to = typeof req.query.to === "string" ? req.query.to.trim() : null;
  const status = getSmtpStatus();

  if (!status.configured) {
    res.status(503).json({ success: false, message: "SMTP not configured" });
    return;
  }
  if (!to) {
    res.status(400).json({ success: false, message: "Provide ?to=recipient@email.com" });
    return;
  }

  try {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 90);
    await sendMembershipSuccessEmail({
      toEmail: to,
      toName: "Test Member",
      plan: "quarterly",
      planDisplayName: "Prime Quarterly Plan",
      planDisplayNameGu: "પ્રાઇમ ત્રિ-માસિક પ્લાન",
      durationLabel: "3 months",
      benefits: [
        "All Monthly Plan benefits",
        "Priority support",
        "Offline PDF access",
      ],
      amountPaise: 79900,
      transactionId: `TEST-${Date.now()}`,
      completedAt: new Date(),
      expiryDate: expiry,
      isRenewal: false,
    });
    res.json({
      success: true,
      message: `Sample payment receipt sent to ${to} from ${process.env.SMTP_FROM ?? "admin@smitcscinfo.com"}`,
    });
  } catch (err: unknown) {
    const e = err as { message?: string; code?: string };
    res.status(500).json({
      success: false,
      error: e?.message ?? "Send failed",
      code: e?.code,
    });
  }
});

export default router;
