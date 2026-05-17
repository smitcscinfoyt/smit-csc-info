import { jsPDF } from "jspdf";

// ─── Canvas dimensions ────────────────────────────────────────────────────────
// A4 Landscape @ 300 DPI:  3508 × 2480 px
// 1 cm = 118 px    |    1 pt = 300/72 ≈ 4.167 px

const CANVAS_W = 3508;
const CANVAS_H = 2480;
const PT       = 300 / 72;          // px per point at 300 DPI  ≈ 4.167

// ─── Exact pixel positions from spec ─────────────────────────────────────────

// Member name bounding box (top-left origin, centre-aligned within box)
const NAME_BOX_X = 1451;   // px  (12.3 cm)
const NAME_BOX_Y = 1140;   // px  (9.66 cm) — top of text box
const NAME_BOX_W = 1509;   // px  (12.79 cm)
const NAME_BOX_H = 198;    // px  (1.68 cm)

// Underline
const UNDERLINE_Y_OFFSET = 80;  // px below name baseline

// Vertical timestamp (rotated −90°)
const SIDE_X = 47;          // px  (0.4 cm)
const SIDE_Y = 1225;        // px  (10.38 cm)

// ─── Font sizes (pt → px @ 300 DPI) ──────────────────────────────────────────
const NAME_FONT_PT   = 40;    // 40 pt  → ~167 px
const SIDE_FONT_PT   = 14;    // 14 pt  →  ~58 px

const nameFontPx = Math.round(NAME_FONT_PT * PT);   // 167
const sideFontPx = Math.round(SIDE_FONT_PT * PT);   // 58

// ─── Certificate font stack ───────────────────────────────────────────────────
// "Cinzel" (primary) → "Montserrat" Bold (fallback) → serif
const CERT_FONT = `"Cinzel", "Montserrat", "Playfair Display", Georgia, serif`;

// ─── Wait for a specific font to be ready in the browser ─────────────────────

async function ensureFont(spec: string): Promise<void> {
  try {
    await document.fonts.load(spec);
  } catch { /* fallback to system font */ }
}

// ─── Load image as HTMLImageElement ──────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src + "?cb=" + Date.now();   // cache-bust
  });
}

// ─── Measure + auto-scale name font to fit box width ─────────────────────────

function fitNameFont(ctx: CanvasRenderingContext2D, text: string): number {
  let size = nameFontPx;
  ctx.font = `bold ${size}px ${CERT_FONT}`;
  const w = ctx.measureText(text).width;

  if (w > NAME_BOX_W) {
    size = Math.max(80, Math.floor(size * (NAME_BOX_W / w)));
    ctx.font = `bold ${size}px ${CERT_FONT}`;
  }
  return size;
}

// ─── Real-time timestamp for the vertical strip ───────────────────────────────

function makeTimestamp(): string {
  const now = new Date();
  const dd   = String(now.getDate()).padStart(2, "0");
  const mm   = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  let   hh   = now.getHours();
  const min  = String(now.getMinutes()).padStart(2, "0");
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12 || 12;
  return `Generated: ${dd}/${mm}/${yyyy}   Time: ${String(hh).padStart(2, "0")}:${min} ${ampm}`;
}

// ─── Core drawing function ────────────────────────────────────────────────────

async function drawCertificateCanvas(userName: string): Promise<HTMLCanvasElement> {
  const templateUrl = `${import.meta.env.BASE_URL}certificate-template.png`;

  const [img] = await Promise.all([
    loadImage(templateUrl),
    ensureFont(`700 ${nameFontPx}px "Cinzel"`),
    ensureFont(`700 ${nameFontPx}px "Montserrat"`),
    ensureFont(`400 ${sideFontPx}px "Cinzel"`),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d")!;

  // ── 1. Background template ───────────────────────────────────────────────
  ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);

  // ── 2. Member name ───────────────────────────────────────────────────────
  const nameText = userName.trim().toUpperCase();

  // Fit font size to box width (auto-scales for long names)
  const actualFontPx = fitNameFont(ctx, nameText);

  // Center X of the text bounding box
  const nameCenterX = NAME_BOX_X + NAME_BOX_W / 2;

  // Vertically centre inside NAME_BOX_H  (textBaseline "alphabetic")
  // Cap-height ≈ 72% of font size; centre cap in box
  const capHeight  = actualFontPx * 0.72;
  const nameBaseline = NAME_BOX_Y + (NAME_BOX_H + capHeight) / 2;

  ctx.save();
  ctx.font         = `bold ${actualFontPx}px ${CERT_FONT}`;
  ctx.fillStyle    = "#000000";
  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";

  // Subtle letter spacing effect (manual kern for canvas)
  ctx.letterSpacing = "4px";
  ctx.fillText(nameText, nameCenterX, nameBaseline, NAME_BOX_W);
  ctx.restore();

  // ── 3. Underline ─────────────────────────────────────────────────────────
  const underlineY    = nameBaseline + UNDERLINE_Y_OFFSET;
  const measuredW     = (() => {
    ctx.font = `bold ${actualFontPx}px ${CERT_FONT}`;
    return ctx.measureText(nameText).width;
  })();
  const lineW         = Math.min(measuredW + 80, NAME_BOX_W);   // max = box width
  const lineX         = nameCenterX - lineW / 2;
  const lineThickness = Math.round(CANVAS_H * 0.001);           // ~2-3 px

  ctx.save();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth   = lineThickness;
  ctx.lineCap     = "round";
  ctx.beginPath();
  ctx.moveTo(lineX, underlineY);
  ctx.lineTo(lineX + lineW, underlineY);
  ctx.stroke();
  ctx.restore();

  // ── 4. Vertical timestamp (rotated −90°, white, left strip) ─────────────
  const timestamp = makeTimestamp();

  ctx.save();
  ctx.translate(SIDE_X, SIDE_Y);
  ctx.rotate(-Math.PI / 2);       // −90 degrees
  ctx.font         = `400 ${sideFontPx}px ${CERT_FONT}`;
  ctx.fillStyle    = "#FFFFFF";
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(timestamp, 0, 0);
  ctx.restore();

  return canvas;
}

// ─── Trigger browser file download ───────────────────────────────────────────

function triggerDownload(href: string, fileName: string): void {
  const a = document.createElement("a");
  a.href     = href;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function safeSlug(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_");
}

// ─── PNG export ───────────────────────────────────────────────────────────────

export async function downloadCertificatePNG(data: { userName: string; membershipDate?: string }): Promise<void> {
  const canvas   = await drawCertificateCanvas(data.userName);
  const dataUrl  = canvas.toDataURL("image/png");
  const fileName = `smitcscinfo_certificate_${safeSlug(data.userName)}.png`;
  triggerDownload(dataUrl, fileName);
}

// ─── PDF export ───────────────────────────────────────────────────────────────

export async function downloadCertificatePDF(data: { userName: string; membershipDate?: string }): Promise<void> {
  const canvas  = await drawCertificateCanvas(data.userName);
  const imgData = canvas.toDataURL("image/jpeg", 0.96);

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageW = doc.internal.pageSize.getWidth();   // 297 mm
  const pageH = doc.internal.pageSize.getHeight();  // 210 mm
  doc.addImage(imgData, "JPEG", 0, 0, pageW, pageH);

  const fileName = `smitcscinfo_certificate_${safeSlug(data.userName)}.pdf`;
  doc.save(fileName);
}

// ─── Backwards-compatible alias ───────────────────────────────────────────────

export async function generatePrimeCertificate(data: { userName: string; membershipDate: string }): Promise<void> {
  return downloadCertificatePDF(data);
}
