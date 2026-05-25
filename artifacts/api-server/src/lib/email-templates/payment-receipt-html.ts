/** Responsive payment receipt HTML for SMTP (table layout + inline styles). */

export interface PaymentReceiptRow {
  label: string;
  /** Plain text (escaped) or safe HTML for status badges */
  value: string;
  valueIsHtml?: boolean;
}

export interface PaymentReceiptOptions {
  memberName: string;
  headline: string;
  congratulation: string;
  congratulationGu?: string;
  rows: PaymentReceiptRow[];
  benefits?: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  gradient?: string;
  preheader?: string;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPaymentReceiptHtml(opts: PaymentReceiptOptions): string {
  const gradient =
    opts.gradient ?? "linear-gradient(135deg,#4f46e5 0%,#7c3aed 55%,#a855f7 100%)";
  const preheader = esc(opts.preheader ?? opts.headline);
  const name = esc(opts.memberName);
  const headline = esc(opts.headline);
  const congrats = esc(opts.congratulation);
  const congratsGu = opts.congratulationGu ? esc(opts.congratulationGu) : "";

  const rowsHtml = opts.rows
    .map((row) => {
      const val = row.valueIsHtml ? row.value : esc(row.value);
      return `
        <tr>
          <td class="receipt-label" style="padding:12px 16px;background:#f8fafc;font-weight:600;color:#475569;font-size:13px;border-bottom:1px solid #e2e8f0;width:40%;vertical-align:top;">${esc(row.label)}</td>
          <td class="receipt-value" style="padding:12px 16px;color:#0f172a;font-size:14px;border-bottom:1px solid #e2e8f0;font-weight:600;word-break:break-word;vertical-align:top;">${val}</td>
        </tr>`;
    })
    .join("");

  const benefitsHtml =
    opts.benefits && opts.benefits.length > 0
      ? `
        <tr>
          <td colspan="2" style="padding:16px 16px 8px;">
            <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:.04em;">Your plan includes</p>
            <ul style="margin:0;padding:0 0 0 18px;color:#475569;font-size:14px;line-height:1.7;">
              ${opts.benefits.map((b) => `<li style="margin-bottom:4px;">${esc(b)}</li>`).join("")}
            </ul>
          </td>
        </tr>`
      : "";

  const cta =
    opts.ctaUrl && opts.ctaLabel
      ? `
        <tr>
          <td colspan="2" style="padding:8px 16px 24px;text-align:center;">
            <a href="${esc(opts.ctaUrl)}" class="cta-btn" style="display:inline-block;padding:14px 36px;background:#4f46e5;color:#ffffff !important;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;box-shadow:0 4px 14px rgba(79,70,229,.35);">
              ${esc(opts.ctaLabel)}
            </a>
          </td>
        </tr>`
      : "";

  const footerNote = opts.footerNote
    ? `
        <tr>
          <td colspan="2" style="padding:0 16px 20px;">
            <div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;">
              <p style="margin:0;font-size:13px;color:#166534;line-height:1.55;">${opts.footerNote}</p>
            </div>
          </td>
        </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${headline}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    @media only screen and (max-width: 620px) {
      .wrapper { width: 100% !important; max-width: 100% !important; }
      .mobile-pad { padding-left: 20px !important; padding-right: 20px !important; }
      .receipt-label, .receipt-value { display: block !important; width: 100% !important; }
      .receipt-label { border-bottom: 0 !important; padding-bottom: 4px !important; }
      .hero-title { font-size: 22px !important; }
      .cta-btn { display: block !important; width: 100% !important; box-sizing: border-box; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#eef2ff;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef2ff;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" class="wrapper" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(15,23,42,.1);">
          <!-- Header -->
          <tr>
            <td style="background:${gradient};padding:36px 28px;text-align:center;" class="mobile-pad">
              <p style="margin:0;font-size:11px;font-weight:600;color:rgba(255,255,255,.9);letter-spacing:.12em;text-transform:uppercase;">Payment Confirmed</p>
              <p style="margin:8px 0 0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:.2px;" class="hero-title">Smit CSC Info</p>
              <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,.88);">Gujarat&apos;s #1 CSC Resource Platform</p>
            </td>
          </tr>
          <!-- Success badge -->
          <tr>
            <td align="center" style="padding:28px 28px 0;" class="mobile-pad">
              <div style="display:inline-block;width:56px;height:56px;line-height:56px;border-radius:50%;background:#dcfce7;font-size:28px;text-align:center;">✓</div>
              <h1 style="margin:16px 0 8px;font-size:24px;font-weight:800;color:#0f172a;line-height:1.3;" class="hero-title">${headline}</h1>
              <p style="margin:0 0 6px;font-size:16px;color:#334155;">Dear <strong>${name}</strong>,</p>
              <p style="margin:0 0 8px;font-size:15px;color:#64748b;line-height:1.65;max-width:480px;margin-left:auto;margin-right:auto;">${congrats}</p>
              ${congratsGu ? `<p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;font-style:italic;max-width:480px;margin-left:auto;margin-right:auto;">${congratsGu}</p>` : ""}
            </td>
          </tr>
          <!-- Receipt table -->
          <tr>
            <td style="padding:24px 28px 8px;" class="mobile-pad">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                ${rowsHtml}
                ${benefitsHtml}
                ${cta}
                ${footerNote}
              </table>
            </td>
          </tr>
          <!-- Support -->
          <tr>
            <td style="padding:8px 28px 28px;text-align:center;" class="mobile-pad">
              <p style="margin:0 0 6px;font-size:13px;color:#64748b;">Questions about your payment?</p>
              <p style="margin:0;font-size:14px;">
                <a href="mailto:admin@smitcscinfo.com" style="color:#4f46e5;font-weight:600;text-decoration:none;">admin@smitcscinfo.com</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:18px 28px;text-align:center;border-top:1px solid #e2e8f0;" class="mobile-pad">
              <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5;">
                This is an automated receipt from Smit CSC Info. Please save it for your records.<br />
                © ${new Date().getFullYear()} Smit CSC Info · Gujarat, India
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
