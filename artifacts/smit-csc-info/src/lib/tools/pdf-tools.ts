import { PDFDocument, degrees, rgb, StandardFonts } from "pdf-lib";

let pdfjsCache: any | null = null;
async function getPdfjs() {
  if (pdfjsCache) return pdfjsCache;
  const pdfjs: any = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  pdfjsCache = pdfjs;
  return pdfjs;
}

export interface PageThumb {
  index: number;
  dataUrl: string;
  width: number;
  height: number;
}

/** Render every page of a PDF to small JPG thumbnails for previews. */
export async function renderThumbnails(
  file: File,
  thumbWidth = 220,
): Promise<PageThumb[]> {
  const pdfjs = await getPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
  const out: PageThumb[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const v0 = page.getViewport({ scale: 1 });
    const scale = thumbWidth / v0.width;
    const v = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.width);
    canvas.height = Math.round(v.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport: v }).promise;
    out.push({
      index: i - 1,
      dataUrl: canvas.toDataURL("image/jpeg", 0.7),
      width: canvas.width,
      height: canvas.height,
    });
  }
  await doc.destroy();
  return out;
}

/** Render full PDF pages to high-quality JPG blobs. */
export async function renderPagesAsJpg(
  file: File,
  dpi = 200,
  quality = 0.92,
  onProgress?: (cur: number, total: number) => void,
): Promise<{ index: number; blob: Blob; width: number; height: number }[]> {
  const pdfjs = await getPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
  const scale = dpi / 72;
  const out: { index: number; blob: Blob; width: number; height: number }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const v = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.width);
    canvas.height = Math.round(v.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: v }).promise;
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob(
        (b) => (b ? res(b) : rej(new Error("Canvas error"))),
        "image/jpeg",
        quality,
      ),
    );
    out.push({ index: i - 1, blob, width: canvas.width, height: canvas.height });
    onProgress?.(i, doc.numPages);
  }
  await doc.destroy();
  return out;
}

/** Build a new PDF with only the selected page indices, in the order given. */
export async function extractPages(file: File, indices: number[]): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  copied.forEach((p) => out.addPage(p));
  const saved = await out.save();
  return new Blob([saved as unknown as ArrayBuffer], { type: "application/pdf" });
}

/**
 * Apply per-page rotation DELTAS on top of each page's existing rotation.
 * Only pages present in `deltas` are touched; everything else is preserved.
 */
export async function applyRotations(
  file: File,
  deltas: Record<number, 0 | 90 | 180 | 270>,
): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  doc.getPages().forEach((p, i) => {
    const delta = deltas[i];
    if (delta === undefined) return; // preserve original rotation
    const existing = p.getRotation().angle ?? 0;
    const next = (((existing + delta) % 360) + 360) % 360;
    p.setRotation(degrees(next));
  });
  const saved = await doc.save();
  return new Blob([saved as unknown as ArrayBuffer], { type: "application/pdf" });
}

/** Read the existing rotation (0/90/180/270) of every page. */
export async function readPageRotations(file: File): Promise<number[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPages().map((p) => {
    const r = p.getRotation().angle ?? 0;
    return ((r % 360) + 360) % 360;
  });
}

export interface SignaturePlacement {
  pageIndex: number;
  /** PNG data URL of the signature with transparent background. */
  pngDataUrl: string;
  /** Position & size in PDF user units (points). Origin = top-left of page. */
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
}

/**
 * Stamp one or more signatures (transparent PNG) onto specific pages.
 *
 * The UI feeds coordinates relative to the rendered (already-rotated) thumbnail
 * with origin at the top-left. We map them to pdf-lib's bottom-left coordinate
 * space *and* compensate for any pre-existing page rotation so that signatures
 * always land where the user dropped them on screen.
 */
export async function placeSignatures(
  file: File,
  placements: SignaturePlacement[],
): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const pngCache = new Map<string, any>();
  for (const pl of placements) {
    if (pl.pageIndex < 0 || pl.pageIndex >= pages.length) continue;
    let png = pngCache.get(pl.pngDataUrl);
    if (!png) {
      const b64 = pl.pngDataUrl.replace(/^data:image\/png;base64,/, "");
      const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      png = await doc.embedPng(u8);
      pngCache.set(pl.pngDataUrl, png);
    }
    const page = pages[pl.pageIndex];
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    const { width: pw, height: ph } = page.getSize();
    // pl.x/y are in *visual* (post-rotation) coordinates with top-left origin.
    // visW × visH = the dimensions the user actually sees on screen.
    const visW = rot === 90 || rot === 270 ? ph : pw;
    const visH = rot === 90 || rot === 270 ? pw : ph;
    const x = pl.xPt;
    const y = pl.yPt;
    const w = pl.widthPt;
    const h = pl.heightPt;

    // Map (x,y,w,h) on the visible page back into the unrotated PDF coord
    // space (bottom-left origin), so that pdf-lib's drawImage — combined with
    // the page's /Rotate metadata — renders the stamp in the same spot.
    let drawX: number, drawY: number, drawW: number, drawH: number, drawRot: number;
    switch (rot) {
      case 90:
        // Rotated 90° clockwise in viewer.
        drawX = y;
        drawY = x;
        drawW = h;
        drawH = w;
        drawRot = -90;
        break;
      case 180:
        drawX = visW - x - w;
        drawY = y;
        drawW = w;
        drawH = h;
        drawRot = 180;
        break;
      case 270:
        drawX = visH - y - h;
        drawY = visW - x - w;
        drawW = h;
        drawH = w;
        drawRot = 90;
        break;
      default:
        drawX = x;
        drawY = ph - y - h;
        drawW = w;
        drawH = h;
        drawRot = 0;
    }

    page.drawImage(png, {
      x: drawX,
      y: drawY,
      width: drawW,
      height: drawH,
      rotate: degrees(drawRot),
    });
  }
  const saved = await doc.save();
  return new Blob([saved as unknown as ArrayBuffer], { type: "application/pdf" });
}

export interface WatermarkOptions {
  text: string;
  fontSize: number;
  opacity: number;
  rotationDeg: number;
  color: { r: number; g: number; b: number };
  pages: "all" | "odd" | "even" | "first" | "last";
}

/** Apply a text watermark across the chosen pages. */
export async function applyWatermark(
  file: File,
  opts: WatermarkOptions,
): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const include =
      opts.pages === "all" ||
      (opts.pages === "odd" && i % 2 === 0) ||
      (opts.pages === "even" && i % 2 === 1) ||
      (opts.pages === "first" && i === 0) ||
      (opts.pages === "last" && i === pages.length - 1);
    if (!include) return;
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(opts.text, opts.fontSize);
    const textHeight = font.heightAtSize(opts.fontSize);
    const cx = width / 2;
    const cy = height / 2;
    const rad = (opts.rotationDeg * Math.PI) / 180;
    // Anchor draw position so text rotates around its own center.
    const dx = cx - (Math.cos(rad) * textWidth) / 2 + (Math.sin(rad) * textHeight) / 2;
    const dy = cy - (Math.sin(rad) * textWidth) / 2 - (Math.cos(rad) * textHeight) / 2;
    page.drawText(opts.text, {
      x: dx,
      y: dy,
      size: opts.fontSize,
      font,
      color: rgb(opts.color.r / 255, opts.color.g / 255, opts.color.b / 255),
      opacity: Math.max(0, Math.min(1, opts.opacity)),
      rotate: degrees(opts.rotationDeg),
    });
  });
  const saved = await doc.save();
  return new Blob([saved as unknown as ArrayBuffer], { type: "application/pdf" });
}
