import { Router } from "express";
import { sendTestEmail, getSmtpStatus } from "../lib/mailer";

const router = Router();

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
      helpGmail: [
        "1. Go to myaccount.google.com > Security",
        "2. Enable 2-Step Verification",
        "3. Go to App Passwords and generate one for 'Mail'",
        "4. Set SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=you@gmail.com, SMTP_PASS=<app-password>",
      ],
      helpHostinger: [
        "Set SMTP_HOST=smtp.hostinger.com, SMTP_PORT=587",
        "SMTP_USER=your-email@yourdomain.com, SMTP_PASS=your-email-password",
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
    res.status(500).json({
      success: false,
      smtpConfigured: true,
      error: err?.message ?? "Unknown error",
      code:  err?.code   ?? "UNKNOWN",
      hint: err?.code === "EAUTH"
        ? "Authentication failed. If using Gmail, use an App Password instead of your regular password."
        : err?.code === "ECONNREFUSED" || err?.code === "ETIMEDOUT"
        ? "Cannot connect. Verify SMTP_HOST and SMTP_PORT are correct."
        : "Check server logs for details.",
    });
  }
});

export default router;
