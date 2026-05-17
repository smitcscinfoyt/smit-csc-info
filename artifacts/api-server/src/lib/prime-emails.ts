function shell(title: string, body: string, ctaUrl: string, ctaLabel: string, accent: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f9;padding:40px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
<tr><td style="background:linear-gradient(135deg,${accent} 0%,#7C3AED 100%);padding:32px 40px;text-align:center;">
<p style="margin:0;font-size:22px;font-weight:800;color:#fff;">Smit CSC Info</p>
<p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,.85);">Prime Membership</p>
</td></tr>
<tr><td style="padding:36px 40px 28px;">${body}
<div style="text-align:center;margin:28px 0 8px;">
<a href="${ctaUrl}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,${accent},#7C3AED);color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;">${ctaLabel}</a>
</div>
<p style="margin:16px 0 0;font-size:12px;color:#888;text-align:center;">Or paste this link in your browser:<br/><span style="color:${accent};word-break:break-all;">${ctaUrl}</span></p>
</td></tr>
<tr><td style="background:#f8f8ff;padding:18px 40px;text-align:center;border-top:1px solid #ececf5;">
<p style="margin:0;font-size:12px;color:#aaa;">© ${new Date().getFullYear()} Smit CSC Info · Gujarat, India</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

function fmt(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) +
    " at " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export type PrimeEmailKind =
  | "before_7d"
  | "before_3d"
  | "before_1d"
  | "expired_today"
  | "expired_3d"
  | "expired_7d";

export function buildPrimeEmail(
  kind: PrimeEmailKind,
  toName: string,
  plan: string,
  expiryDate: Date,
  renewUrl: string,
): { subject: string; html: string } {
  const safeName = toName || "there";
  const expiryText = fmt(expiryDate);

  switch (kind) {
    case "before_7d":
      return {
        subject: "⏰ Your Prime expires in 7 days — Smit CSC Info",
        html: shell(
          "Prime expires soon",
          `<p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a2e;">Hello, ${safeName} 👋</p>
<p style="margin:0 0 16px;font-size:16px;color:#444;line-height:1.6;">Your <strong>${plan}</strong> Prime membership expires in <strong>7 days</strong> on <strong>${expiryText}</strong>.</p>
<p style="margin:0;font-size:15px;color:#555;line-height:1.6;">Renew now to keep enjoying uninterrupted access to all premium documents, videos, schemes, and HD credits.</p>`,
          renewUrl, "🔄 Renew My Plan", "#7C3AED",
        ),
      };

    case "before_3d":
      return {
        subject: "⚠️ Only 3 days left on your Prime — Smit CSC Info",
        html: shell(
          "Prime expires in 3 days",
          `<p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a2e;">Hello, ${safeName} 👋</p>
<p style="margin:0 0 16px;font-size:16px;color:#b45309;line-height:1.6;">⚠️ Your <strong>${plan}</strong> Prime membership expires in just <strong>3 days</strong> on <strong>${expiryText}</strong>.</p>
<p style="margin:0;font-size:15px;color:#555;line-height:1.6;">Renew today to avoid losing access to your premium dashboard, exclusive documents, and HD credits.</p>`,
          renewUrl, "⚡ Renew Now", "#D97706",
        ),
      };

    case "before_1d":
      return {
        subject: "🚨 Your Prime expires tomorrow! — Smit CSC Info",
        html: shell(
          "Last day to renew!",
          `<p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a2e;">Hello, ${safeName} 👋</p>
<p style="margin:0 0 16px;font-size:18px;color:#dc2626;font-weight:700;line-height:1.6;">🚨 Your Prime membership expires <u>tomorrow</u> on <strong>${expiryText}</strong>.</p>
<p style="margin:0;font-size:15px;color:#555;line-height:1.6;">This is your last reminder before your benefits pause. Renew now in under a minute to stay Prime.</p>`,
          renewUrl, "🚀 Renew Before Tomorrow", "#DC2626",
        ),
      };

    case "expired_today":
      return {
        subject: "❗ Your Prime expired today — 3-day grace period active",
        html: shell(
          "Prime expired",
          `<p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a2e;">Hello, ${safeName} 👋</p>
<p style="margin:0 0 16px;font-size:16px;color:#dc2626;line-height:1.6;">Your <strong>${plan}</strong> Prime membership <strong>expired today</strong>.</p>
<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0;font-size:14px;color:#92400e;">🛟 Good news: We've activated a <strong>3-day grace period</strong>. Your premium access continues until then so you can renew at your convenience.</p>
</div>
<p style="margin:0;font-size:15px;color:#555;line-height:1.6;">Renew now to extend your benefits without any interruption.</p>`,
          renewUrl, "🔁 Reactivate My Plan", "#DC2626",
        ),
      };

    case "expired_3d":
      return {
        subject: "🔒 Your Prime access ended — Reactivate now",
        html: shell(
          "Reactivate Prime",
          `<p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a2e;">Hello, ${safeName} 👋</p>
<p style="margin:0 0 16px;font-size:16px;color:#444;line-height:1.6;">Your grace period has ended and Prime benefits are now <strong>paused</strong>. Your <strong>${plan}</strong> plan expired on <strong>${expiryText}</strong>.</p>
<p style="margin:0;font-size:15px;color:#555;line-height:1.6;">Reactivate any time to restore full access to premium documents, videos, HD credits, and your operator dashboard.</p>`,
          renewUrl, "🔓 Reactivate Now", "#7C3AED",
        ),
      };

    case "expired_7d":
      return {
        subject: "💜 We miss you on Prime — Reactivate today",
        html: shell(
          "Come back to Prime",
          `<p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a2e;">Hello, ${safeName} 💜</p>
<p style="margin:0 0 16px;font-size:16px;color:#444;line-height:1.6;">It's been a week since your Prime expired. Your fellow CSC operators are using exclusive Prime tools to grow their business — we'd love to have you back.</p>
<p style="margin:0;font-size:15px;color:#555;line-height:1.6;">Reactivate in just a minute and pick up right where you left off.</p>`,
          renewUrl, "💎 Become Prime Again", "#7C3AED",
        ),
      };
  }
}
