import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { apiFetch } from "@/lib/api";

export type EditorTool =
  | "select"
  | "image"
  | "icon"
  | "signature"
  | "text"
  | "rect"
  | "circle"
  | "line"
  | "arrow"
  | "erase"
  | "restore"
  | "crop";

export interface BaseEl {
  id: string;
  pageIndex: number;
  /** All coords are in *display pixels* of the rendered page (top-left origin). */
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  /** Visual rotation in degrees, clockwise, around the element's centre. */
  rotation?: number;
  /** Inset crop in display pixels — clips visible content from each edge. */
  crop?: { left: number; top: number; right: number; bottom: number };
  /** When true, the element ignores drag, resize, and contentEditable input.
   *  The user can still select it (to unlock or delete via the mini-toolbar). */
  locked?: boolean;
  /** Group identifier — elements that share a groupId move together when any
   *  one of them is dragged. Empty / undefined = ungrouped. New groups are
   *  created with `nextGroupId()` from the editor; ungroup just clears it. */
  groupId?: string;
}

export interface ImageEl extends BaseEl {
  type: "image" | "icon" | "signature";
  src: string; // data URL (PNG)
}
export interface TextEl extends BaseEl {
  type: "text";
  text: string;
  fontSize: number; // px in display space
  color: string; // #rrggbb
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontFamily: "Helvetica" | "Times" | "Courier";
  /** Optional opaque background painted behind the glyphs — used to white-out
   *  the original PDF text under elements created by Smart Word Extraction. */
  bgColor?: string | null;
  /** Horizontal text alignment within the element's bounding box. */
  align?: "left" | "center" | "right";
  /** True when this element was auto-created by Smart Word Extraction.
   *  We render a subtle dashed outline for these in the editor. */
  extracted?: boolean;
}
export interface ShapeEl extends BaseEl {
  type: "rect" | "circle";
  strokeColor: string;
  strokeWidth: number;
  fillColor: string | null;
}
export interface LineEl extends BaseEl {
  type: "line" | "arrow";
  strokeColor: string;
  strokeWidth: number;
  /** Endpoints in display space: from (x,y) to (x+w, y+h). */
}

export type EditorElement = ImageEl | TextEl | ShapeEl | LineEl;

/** Per-page mask & crop overlays handled outside the elements array. */
export interface PageOverlays {
  /** PNG data URL of the AI-Erase mask, sized to displayWidth × displayHeight. */
  maskDataUrl?: string;
  /** Crop rectangle in *visible display pixels* (top-left origin). */
  cropRect?: { x: number; y: number; w: number; h: number };
  /**
   * If true, the original page background is replaced with the cleaned
   * version supplied via {@link cleanBgImageDataUrl}. The cleaning is a
   * per-pixel threshold: bright pixels (paper, light moiré, scan halo,
   * yellow/cream camera-tint) are snapped to pure white, while dark
   * pixels (text strokes, table grid lines, QR-code modules, signatures,
   * stamps, logos) are preserved at their original tone. Result: a
   * "print-clean" page that keeps every structural / graphic element
   * the original PDF contained, but with the noise wiped.
   */
  cleanBackground?: boolean;
  /**
   * Pre-cleaned PNG/JPEG dataUrl for this page, generated client-side by
   * `cleanPageBackground()` when the user enables Clean BG. When this is
   * set AND `cleanBackground === true`, the export draws this image
   * full-page as the new background. Falls back to a plain white wipe
   * (the original behaviour) if the cleaned image is missing for any
   * reason — defensive so Clean BG always produces *something* clean.
   */
  cleanBgImageDataUrl?: string;
}

/**
 * Threshold-based "smart" page cleaner. Loads a rendered page dataUrl,
 * walks every pixel, and snaps anything above `whiteCutoff` (default 200
 * luminance) to pure white while leaving darker pixels at their original
 * RGB. The output is a PNG dataUrl.
 *
 * Why a hard threshold instead of fancy adaptive techniques: the user's
 * complaint was that the previous Clean BG wiped tables, QR codes, and
 * borders along with noise. A simple luminance threshold preserves those
 * by definition — table lines, QR squares, and stamp ink all sit well
 * below 200 luminance. Moiré tints from screen photos, faint scan-line
 * halos, and paper texture all sit above 200 and therefore vanish.
 *
 * Runs client-side via the 2D canvas API (no server roundtrip) so the
 * toolbar toggle is instant on a typical 1500-px-wide page (~25 ms).
 */
export async function cleanPageBackground(
  pageDataUrl: string,
  whiteCutoff: number = 200,
  textRects: { x: number; y: number; w: number; h: number }[] = [],
): Promise<string> {
  const img = new Image();
  img.decoding = "async";
  img.src = pageDataUrl;
  await new Promise<void>((resolve, reject) => {
    if (img.complete && img.naturalWidth > 0) {
      resolve();
      return;
    }
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("cleanPageBackground: image failed to load"));
  });
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w <= 0 || h <= 0) return pageDataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return pageDataUrl;
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, w, h);
  const data = id.data;

  // ITU-R BT.601 luma weights — match how human vision perceives
  // brightness across colour channels. Using straight average would
  // under-weight green and incorrectly classify lots of light text.
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    if (luma > whiteCutoff) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
    // else: leave dark pixel untouched — text, table line, QR cell, stamp
  }
  ctx.putImageData(id, 0, 0);

  // Second pass: cover the original glyphs sitting under each
  // extracted-text overlay. A solid pure-white fill leaves visible
  // "card" rectangles wherever the surrounding page is even slightly
  // off-white (tinted certificate paper, faint texture, gradient).
  // To make the patches blend invisibly we sample the page's local
  // background colour just outside each rect and fill with that
  // colour instead. Dark pixels (likely text from an adjacent rect)
  // are excluded from the sample so they don't pollute the average.
  //
  // This kills the "double print" effect — original glyphs vanish —
  // while preserving the visual feel of the underlying paper, which
  // is exactly what the user asked for: no visible white blocks
  // behind extracted text.
  if (textRects.length > 0) {
    const id2 = ctx.getImageData(0, 0, w, h);
    const data2 = id2.data;

    const sampleBgColor = (
      rx: number,
      ry: number,
      rw: number,
      rh: number,
    ): [number, number, number] => {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      const probe = (px: number, py: number) => {
        if (px < 0 || px >= w || py < 0 || py >= h) return;
        const i = (py * w + px) * 4;
        const luma =
          data2[i] * 0.299 + data2[i + 1] * 0.587 + data2[i + 2] * 0.114;
        if (luma < 180) return;
        sr += data2[i];
        sg += data2[i + 1];
        sb += data2[i + 2];
        n++;
      };
      // Probe at 5 evenly-spaced positions on each of 4 sides, at
      // three distances out from the rect, so we collect enough
      // samples to filter out the odd table line / artefact.
      for (const d of [3, 6, 10]) {
        for (let i = 0; i <= 4; i++) {
          const t = i / 4;
          probe(Math.floor(rx + rw * t), ry - d);
          probe(Math.floor(rx + rw * t), ry + rh + d);
          probe(rx - d, Math.floor(ry + rh * t));
          probe(rx + rw + d, Math.floor(ry + rh * t));
        }
      }
      if (n === 0) return [255, 255, 255];
      return [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)];
    };

    // Approach:
    //   1. pad = 0 — no rect inflation. Inflation bled the fill
    //      into adjacent table grid lines and broke them.
    //   2. Selective dark-pixel replacement — only pixels darker
    //      than (local paper luma − DARK_DELTA) are candidates for
    //      replacement. Light/paper pixels stay as-is.
    //   3. Line-preservation — even among dark pixels, those that
    //      sit on a row OR column where a continuous dark run
    //      extends OUTSIDE the rect on BOTH sides are kept. That
    //      means horizontal grid lines, vertical cell separators,
    //      table borders, and underlines that pass through the text
    //      rect remain unbroken; only the isolated text-glyph
    //      strokes (which start and end inside the rect) are wiped.
    //
    //   Probe length 6 px / 4-of-6 dark threshold is empirically a
    //   good balance — short enough to not touch nearby decorative
    //   accents, long enough to confidently identify long thin
    //   table lines.
    const DARK_DELTA = 35;
    const PROBE = 6;
    const PROBE_THRESHOLD = 4;

    const isDarkAt = (px: number, py: number, cutoff: number): boolean => {
      if (px < 0 || px >= w || py < 0 || py >= h) return false;
      const i = (py * w + px) * 4;
      const l =
        data2[i] * 0.299 + data2[i + 1] * 0.587 + data2[i + 2] * 0.114;
      return l < cutoff;
    };

    for (const r of textRects) {
      const x = Math.max(0, Math.floor(r.x));
      const y = Math.max(0, Math.floor(r.y));
      const rw = Math.min(w - x, Math.ceil(r.w));
      const rh = Math.min(h - y, Math.ceil(r.h));
      if (rw <= 0 || rh <= 0) continue;
      const [br, bg, bb] = sampleBgColor(x, y, rw, rh);
      const bgLuma = br * 0.299 + bg * 0.587 + bb * 0.114;
      const cutoff = bgLuma - DARK_DELTA;

      // Detect rows that contain a horizontal line crossing the rect.
      // A row qualifies when there are enough dark pixels both
      // immediately to the LEFT and immediately to the RIGHT of the
      // rect at this row. Both sides must qualify so we don't mistake
      // a glyph that touches one rect edge for a line.
      const horizontalLineRows = new Set<number>();
      for (let py = y; py < y + rh; py++) {
        let darkLeft = 0;
        let darkRight = 0;
        for (let i = 1; i <= PROBE; i++) {
          if (isDarkAt(x - i, py, cutoff)) darkLeft++;
          if (isDarkAt(x + rw - 1 + i, py, cutoff)) darkRight++;
        }
        if (darkLeft >= PROBE_THRESHOLD && darkRight >= PROBE_THRESHOLD) {
          horizontalLineRows.add(py);
        }
      }

      // Same idea for vertical lines crossing the rect.
      const verticalLineCols = new Set<number>();
      for (let px = x; px < x + rw; px++) {
        let darkUp = 0;
        let darkDown = 0;
        for (let i = 1; i <= PROBE; i++) {
          if (isDarkAt(px, y - i, cutoff)) darkUp++;
          if (isDarkAt(px, y + rh - 1 + i, cutoff)) darkDown++;
        }
        if (darkUp >= PROBE_THRESHOLD && darkDown >= PROBE_THRESHOLD) {
          verticalLineCols.add(px);
        }
      }

      for (let py = y; py < y + rh; py++) {
        const rowOnLine = horizontalLineRows.has(py);
        const rowStart = (py * w + x) * 4;
        for (let px = 0; px < rw; px++) {
          const i = rowStart + px * 4;
          const luma =
            data2[i] * 0.299 + data2[i + 1] * 0.587 + data2[i + 2] * 0.114;
          if (luma >= cutoff) continue;
          if (rowOnLine || verticalLineCols.has(x + px)) continue;
          data2[i] = br;
          data2[i + 1] = bg;
          data2[i + 2] = bb;
          data2[i + 3] = 255;
        }
      }
    }
    ctx.putImageData(id2, 0, 0);
  }
  return canvas.toDataURL("image/png");
}

export interface PageMeta {
  pdfWidthPt: number;
  pdfHeightPt: number;
  rotation: number;
  /** Display size used in the editor canvas. */
  displayWidth: number;
  displayHeight: number;
}

function hexToRgb01(hex: string) {
  const v = parseInt(hex.replace("#", ""), 16);
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

/** Built-in icon library — SVG strings rendered to PNG at use time. */
export const ICON_LIBRARY: { name: string; label: string; svg: string }[] = [
  {
    name: "check",
    label: "Check (green)",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  },
  {
    name: "cross",
    label: "Cross (red)",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  },
  {
    name: "star",
    label: "Star (gold)",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#facc15" stroke="#b45309" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  },
  {
    name: "verified",
    label: "Verified seal",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#16a34a" stroke="#fff" stroke-width="1.5"><path d="M12 1l3 5 6 1-4 5 1 7-6-3-6 3 1-7-4-5 6-1z"/><polyline points="9 12 11 14 15 10" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    name: "stamp",
    label: "Approved stamp",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect x="2" y="8" width="96" height="44" rx="6" fill="none" stroke="#dc2626" stroke-width="3"/><text x="50" y="38" font-family="Arial Black, sans-serif" font-size="22" fill="#dc2626" text-anchor="middle" font-weight="900">APPROVED</text></svg>`,
  },
  {
    name: "rejected",
    label: "Rejected stamp",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect x="2" y="8" width="96" height="44" rx="6" fill="none" stroke="#dc2626" stroke-width="3"/><text x="50" y="38" font-family="Arial Black, sans-serif" font-size="22" fill="#dc2626" text-anchor="middle" font-weight="900">REJECTED</text></svg>`,
  },
  {
    name: "draft",
    label: "Draft stamp",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect x="2" y="8" width="96" height="44" rx="6" fill="none" stroke="#64748b" stroke-width="3"/><text x="50" y="38" font-family="Arial Black, sans-serif" font-size="22" fill="#64748b" text-anchor="middle" font-weight="900">DRAFT</text></svg>`,
  },
  {
    name: "csc",
    label: "Smit CSC seal",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="#7c3aed" stroke-width="3"/><circle cx="50" cy="50" r="38" fill="none" stroke="#7c3aed" stroke-width="1.5"/><text x="50" y="46" font-family="Arial Black, sans-serif" font-size="14" fill="#7c3aed" text-anchor="middle" font-weight="900">SMIT</text><text x="50" y="62" font-family="Arial Black, sans-serif" font-size="14" fill="#7c3aed" text-anchor="middle" font-weight="900">CSC</text></svg>`,
  },
  {
    name: "arrow-right",
    label: "Right arrow",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  },
  {
    name: "circle-num",
    label: "Numbered circle",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#fde047" stroke="#a16207" stroke-width="2"/><text x="12" y="16" font-family="Arial Black, sans-serif" font-size="12" fill="#7c2d12" text-anchor="middle" font-weight="900">1</text></svg>`,
  },
];

/* ── Smart Word Extraction ─────────────────────────────────────────────────
 *
 * Uses pdfjs `getTextContent()` to scan a single page and convert every
 * text run into a TextEl with display-pixel coordinates that match the
 * rendered preview (DISPLAY_WIDTH-based). Each returned element has
 * `bgColor: "#ffffff"` so it visually whites-out the original glyphs at
 * its anchor position; the caller is also given the exact bounding rects
 * so it can paint a permanent white-out onto the page mask canvas (this
 * way the original text stays hidden even if the user moves the element).
 */
export interface ExtractedTextResult {
  elements: Omit<TextEl, "id" | "z">[];
  whiteoutRects: { x: number; y: number; w: number; h: number }[];
  displayWidth: number;
  displayHeight: number;
  /** Diagnostic reason when extraction returns 0 elements. */
  reason?: "scanned" | "encrypted" | "no-text" | "ok";
}

export async function extractPageText(
  file: File,
  pageIdx: number,
  displayWidth: number,
): Promise<ExtractedTextResult> {
  const pdfjs: any = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = (worker as any).default;
  }
  const buf = await file.arrayBuffer();
  // Try to open the document; gracefully report password-protected files
  // instead of throwing an opaque error to the caller.
  let doc: any;
  try {
    const loadingTask = pdfjs.getDocument({ data: buf, isEvalSupported: false });
    doc = await loadingTask.promise;
  } catch (err: any) {
    const name = String(err?.name ?? "");
    if (name === "PasswordException") {
      return {
        elements: [],
        whiteoutRects: [],
        displayWidth,
        displayHeight: 0,
        reason: "encrypted",
      };
    }
    throw err;
  }
  try {
    const page = await doc.getPage(pageIdx + 1);
    const v0 = page.getViewport({ scale: 1 });
    const scale = displayWidth / v0.width;
    const viewport = page.getViewport({ scale });
    // Disable combining adjacent items so we get one TextEl per visual run.
    const tc = await page.getTextContent({
      includeMarkedContent: false,
      disableCombineTextItems: false,
    });
    const styles = (tc.styles ?? {}) as Record<string, any>;

    const elements: Omit<TextEl, "id" | "z">[] = [];
    const whiteoutRects: { x: number; y: number; w: number; h: number }[] = [];

    for (const raw of tc.items as any[]) {
      const str: string = raw?.str ?? "";
      if (!str || !str.trim()) continue;
      const tr = raw.transform as number[] | undefined;
      if (!tr || tr.length < 6) continue;
      // Transform text-space → viewport pixel space.
      const tx = pdfjs.Util.transform(viewport.transform, tr) as number[];
      const fontHeightPx = Math.hypot(tx[2], tx[3]);
      if (!Number.isFinite(fontHeightPx) || fontHeightPx <= 0) continue;
      const widthPx = (raw.width ?? 0) * scale;
      const xPx = tx[4];
      // tx[5] is the baseline in viewport y-down pixels — top = baseline − ascent.
      const topPx = tx[5] - fontHeightPx;

      const styleName = raw.fontName as string | undefined;
      const styleInfo = styleName ? styles[styleName] : undefined;
      const familyHint = (styleInfo?.fontFamily ?? styleName ?? "").toLowerCase();
      const family: TextEl["fontFamily"] = /serif|times|roman/.test(familyHint)
        ? "Times"
        : /mono|courier|consol/.test(familyHint)
        ? "Courier"
        : "Helvetica";
      const fontWeight = styleInfo?.fontWeight as number | string | undefined;
      const isBold =
        /bold|black|heavy/.test(familyHint) ||
        (typeof fontWeight === "number" ? fontWeight >= 600 : /bold|[6-9]00/.test(String(fontWeight ?? "")));
      const isItalic = /italic|oblique/.test(familyHint);

      // Bounding box in display pixels — slightly padded so the editable
      // box has comfortable hit-area without overlapping neighbours much.
      const padX = Math.max(2, fontHeightPx * 0.08);
      const padY = Math.max(2, fontHeightPx * 0.12);
      const boxX = Math.max(0, xPx - padX);
      const boxY = Math.max(0, topPx - padY);
      const boxW = Math.max(8, widthPx + padX * 2);
      const boxH = Math.max(10, fontHeightPx + padY * 2);

      elements.push({
        pageIndex: pageIdx,
        type: "text",
        x: boxX,
        y: boxY,
        width: boxW,
        height: boxH,
        rotation: 0,
        text: str,
        fontSize: fontHeightPx,
        color: "#0f172a",
        bold: !!isBold,
        italic: isItalic,
        underline: false,
        fontFamily: family,
        // No background fill — extracted text overlays the cleaned page
        // raster transparently, so surrounding tables / lines / borders
        // stay intact (no per-glyph white rectangle that punches through
        // adjacent table cells).
        bgColor: null,
        align: "left",
        extracted: true,
      });
      // Whiteout slightly larger than the editable element box so the
      // cover survives anti-aliased glyph edges of the original embedded
      // text. Without this padding, sub-pixel slivers of the original
      // ink leak around the replacement and read as "thin black lines"
      // around every word in the exported PDF.
      const wPad = Math.max(2, fontHeightPx * 0.15);
      const hPad = Math.max(2, fontHeightPx * 0.2);
      whiteoutRects.push({
        x: Math.max(0, boxX - wPad),
        y: Math.max(0, boxY - hPad),
        w: boxW + wPad * 2,
        h: boxH + hPad * 2,
      });
    }

    // Heuristic: if we got 0 elements but the page has plenty of operator
    // bytes, it likely contains text-as-curves or images (scanned page).
    // We can't reliably distinguish the two from the text layer alone, so
    // we just call it "scanned" — the user message handles both cases.
    const reason: ExtractedTextResult["reason"] =
      elements.length > 0
        ? "ok"
        : (tc.items as any[]).length === 0
        ? "scanned"
        : "no-text";

    return {
      elements,
      whiteoutRects,
      displayWidth: Math.round(viewport.width),
      displayHeight: Math.round(viewport.height),
      reason,
    };
  } finally {
    try {
      await doc.cleanup();
      await doc.destroy();
    } catch {
      /* noop */
    }
  }
}

/* ── OCR pre-processing & local-worker plumbing ────────────────────────────
 *
 * Two helpers used by every OCR path below:
 *   • `preprocessForOCR` — converts a colour canvas to high-contrast black-
 *     and-white before recognition. Tesseract's accuracy plummets on the
 *     gold-foil / watermark backgrounds typical of CSC certificates; a
 *     simple luminance + S-curve pass dramatically lifts text edges out
 *     of noisy backdrops.
 *   • `getTesseractPaths` — returns same-origin URLs for the bundled
 *     Tesseract worker, core wasm, and English language data. We copy
 *     these into `public/tess/` at predev/prebuild via
 *     `scripts/copy-tesseract.mjs` so the engine NEVER has to fetch from
 *     a CDN — the most common cause of "OCR could not run" errors on
 *     mobile or sandboxed iframes.
 */
function preprocessForOCR(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = data.data;
  // S-curve contrast factor of 1.7 lifts mid-tones above complex
  // backgrounds without crushing thin glyph edges.
  const factor = 1.7;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    let v = (lum - 128) * factor + 128;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
}

function getTesseractPaths() {
  const base =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.BASE_URL) ||
    "/";
  const trim = base.endsWith("/") ? base : base + "/";
  // Tesseract.js v7 treats corePath/langPath as directories and appends
  // file names (e.g. `tesseract-core-simd.wasm.js`, `eng.traineddata.gz`)
  // — keep trailing slashes so the appended URL is well-formed.
  return {
    workerPath: `${trim}tess/worker.min.js`,
    corePath: `${trim}tess/core/`,
    langPath: `${trim}tess/lang/`,
  };
}

async function loadPdfPageCanvas(
  file: File,
  pageIdx: number,
  displayWidth: number,
  scaleMultiplier: number,
): Promise<{ canvas: HTMLCanvasElement; doc: any; cleanup: () => Promise<void> } | { encrypted: true }> {
  const pdfjs: any = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = (worker as any).default;
  }
  const buf = await file.arrayBuffer();
  let doc: any;
  try {
    doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  } catch (err: any) {
    if (String(err?.name ?? "") === "PasswordException") {
      return { encrypted: true };
    }
    throw err;
  }
  const page = await doc.getPage(pageIdx + 1);
  const v0 = page.getViewport({ scale: 1 });
  const dispScale = displayWidth / v0.width;
  const v = page.getViewport({ scale: dispScale * scaleMultiplier });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(v.width);
  canvas.height = Math.round(v.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: v }).promise;
  return {
    canvas,
    doc,
    cleanup: async () => {
      try {
        await doc.cleanup();
        await doc.destroy();
      } catch {
        /* noop */
      }
    },
  };
}

/* ── OCR fallback (Tesseract.js) ───────────────────────────────────────────
 *
 * For PDFs with no text layer (scanned, image-only, or text rendered as
 * curves) the text-layer extractor above returns 0 elements. This function
 * renders the page to a high-DPI canvas and runs Tesseract OCR so we can
 * still produce editable, draggable TextEls. Coordinates are scaled back
 * to the editor's display-pixel space so the rest of the editor pipeline
 * (white-out mask, vector/raster export) works unchanged.
 */
/** Run Tesseract on a (potentially preprocessed) canvas and convert the
 *  resulting word/line tokens into editable TextEls. Coordinates produced
 *  by Tesseract live in canvas pixel space; the caller passes
 *  `transformBbox` to map them into display-pixel space (and to apply any
 *  region offset for the Deep-Scan path).
 */
async function recogniseCanvasToElements(
  canvas: HTMLCanvasElement,
  pageIdx: number,
  lang: string,
  transformBbox: (bb: { x0: number; y0: number; x1: number; y1: number }) => {
    x: number;
    y: number;
    w: number;
    h: number;
  },
  onProgress?: (pct: number, status: string) => void,
) {
  const Tesseract: any = (await import("tesseract.js")).default;
  const paths = getTesseractPaths();
  const ocr = await Tesseract.recognize(canvas, lang, {
    ...paths,
    cacheMethod: "write",
    logger: (m: any) => {
      const pct = typeof m?.progress === "number" ? m.progress : 0;
      onProgress?.(0.05 + pct * 0.9, m?.status ?? "recognising");
    },
  });

  const elements: Omit<TextEl, "id" | "z">[] = [];
  const whiteoutRects: { x: number; y: number; w: number; h: number }[] = [];

  const pushBlock = (text: string, bb: any, conf: number) => {
    if (!text || !text.trim() || !bb) return;
    // 20 is a forgiving floor — empirically Tesseract reports 30–60% on
    // clean certificate fonts but can drop below 35 on ornate display
    // typefaces, so 35 was rejecting too many legitimate words.
    if (conf < 20) return;
    const { x, y, w: width, h: height } = transformBbox(bb);
    if (width < 4 || height < 6) return;
    const fontSize = Math.max(8, height * 0.85);
    const padX = Math.max(2, fontSize * 0.08);
    const padY = Math.max(2, fontSize * 0.12);
    const boxX = Math.max(0, x - padX);
    const boxY = Math.max(0, y - padY);
    const boxW = Math.max(8, width + padX * 2);
    const boxH = Math.max(10, height + padY * 2);
    elements.push({
      pageIndex: pageIdx,
      type: "text",
      x: boxX,
      y: boxY,
      width: boxW,
      height: boxH,
      rotation: 0,
      text: text.trim(),
      fontSize,
      color: "#0f172a",
      bold: false,
      italic: false,
      underline: false,
      fontFamily: "Helvetica",
      // Transparent: extracted text overlays the cleaned page raster
      // without punching a white rectangle through nearby table cells.
      bgColor: null,
      align: "left",
      extracted: true,
    });
    whiteoutRects.push({ x: boxX, y: boxY, w: boxW, h: boxH });
  };

  // Prefer per-word boxes (granular, easier to edit). If empty, fall back
  // to per-line boxes — some Tesseract builds skip word data on noisy
  // backgrounds. Last resort: emit a single page-level block.
  const words: any[] = ocr?.data?.words ?? [];
  for (const w of words) pushBlock(w?.text ?? "", w?.bbox, w?.confidence ?? 0);

  if (elements.length === 0) {
    const lines: any[] = ocr?.data?.lines ?? [];
    for (const l of lines) pushBlock(l?.text ?? "", l?.bbox, l?.confidence ?? 0);
  }

  return { elements, whiteoutRects };
}

export async function extractPageTextOCR(
  file: File,
  pageIdx: number,
  displayWidth: number,
  lang = "eng",
  onProgress?: (pct: number, status: string) => void,
): Promise<ExtractedTextResult> {
  // 2× display DPI gives sharper glyphs without exploding memory.
  const loaded = await loadPdfPageCanvas(file, pageIdx, displayWidth, 2);
  if ("encrypted" in loaded) {
    return {
      elements: [],
      whiteoutRects: [],
      displayWidth,
      displayHeight: 0,
      reason: "encrypted",
    };
  }
  const { canvas, cleanup } = loaded;

  try {
    onProgress?.(0.02, "enhancing image");
    preprocessForOCR(canvas);
    onProgress?.(0.05, "loading OCR engine");

    const ocrToDisp = displayWidth / canvas.width;
    const dispH = Math.round(canvas.height * ocrToDisp);

    const { elements, whiteoutRects } = await recogniseCanvasToElements(
      canvas,
      pageIdx,
      lang,
      (bb) => ({
        x: bb.x0 * ocrToDisp,
        y: bb.y0 * ocrToDisp,
        w: (bb.x1 - bb.x0) * ocrToDisp,
        h: (bb.y1 - bb.y0) * ocrToDisp,
      }),
      onProgress,
    );

    onProgress?.(0.98, "placing text blocks");

    return {
      elements,
      whiteoutRects,
      displayWidth,
      displayHeight: dispH,
      reason: elements.length > 0 ? "ok" : "no-text",
    };
  } finally {
    await cleanup();
  }
}

/* ── Manual area "Deep Scan" ───────────────────────────────────────────────
 *
 * When automatic full-page OCR misses some text (e.g. small captions over
 * complex backgrounds, stylised script names), the user draws a rectangle
 * around the area in question and we run a higher-DPI, region-only OCR
 * pass. Because we're spending the full Tesseract budget on a small slice
 * of the page, recognition accuracy on stubborn text typically jumps from
 * ~50% to >85%.
 *
 * `region` is in *display pixels* (the same coord space the editor uses).
 */
export async function extractAreaTextOCR(
  file: File,
  pageIdx: number,
  displayWidth: number,
  region: { x: number; y: number; w: number; h: number },
  lang = "eng",
  onProgress?: (pct: number, status: string) => void,
): Promise<ExtractedTextResult> {
  // 3× DPI for the deep scan — heavier than the full-page pass but only
  // applied to the user's selected slice, so memory cost is bounded.
  const SCALE_HINT = 3;
  const loaded = await loadPdfPageCanvas(file, pageIdx, displayWidth, SCALE_HINT);
  if ("encrypted" in loaded) {
    return {
      elements: [],
      whiteoutRects: [],
      displayWidth,
      displayHeight: 0,
      reason: "encrypted",
    };
  }
  const { canvas: full, cleanup } = loaded;
  let slice: HTMLCanvasElement | null = null;

  try {
    onProgress?.(0.02, "cropping selection");
    // Derive the *actual* canvas-px-per-display-px ratio from the rendered
    // canvas — `loadPdfPageCanvas` rounds dimensions, so the effective scale
    // can drift from `SCALE_HINT` by a fraction of a pixel. Using the
    // measured ratio keeps Deep Scan bboxes pixel-aligned with the editor.
    const cssScale = full.width / displayWidth;
    // Convert the selection rect from display px → high-DPI canvas px.
    const sx = Math.max(0, Math.round(region.x * cssScale));
    const sy = Math.max(0, Math.round(region.y * cssScale));
    const sw = Math.max(2, Math.round(region.w * cssScale));
    const sh = Math.max(2, Math.round(region.h * cssScale));
    const cw = Math.min(full.width - sx, sw);
    const ch = Math.min(full.height - sy, sh);
    slice = document.createElement("canvas");
    slice.width = Math.max(2, cw);
    slice.height = Math.max(2, ch);
    const sctx = slice.getContext("2d")!;
    sctx.fillStyle = "#ffffff";
    sctx.fillRect(0, 0, slice.width, slice.height);
    sctx.drawImage(full, sx, sy, cw, ch, 0, 0, cw, ch);

    onProgress?.(0.04, "enhancing image");
    preprocessForOCR(slice);
    onProgress?.(0.05, "loading OCR engine");

    // 1 slice px → 1/cssScale display px; then offset by region origin.
    const inv = 1 / cssScale;
    const { elements, whiteoutRects } = await recogniseCanvasToElements(
      slice,
      pageIdx,
      lang,
      (bb) => ({
        x: region.x + bb.x0 * inv,
        y: region.y + bb.y0 * inv,
        w: (bb.x1 - bb.x0) * inv,
        h: (bb.y1 - bb.y0) * inv,
      }),
      onProgress,
    );

    onProgress?.(0.98, "placing text blocks");

    return {
      elements,
      whiteoutRects,
      displayWidth,
      // Caller doesn't actually use this for area scans, but we keep the
      // shape consistent so the same downstream logic works unchanged.
      displayHeight: Math.round(full.height / cssScale),
      reason: elements.length > 0 ? "ok" : "no-text",
    };
  } finally {
    // Release the slice canvas backing buffer FIRST. Setting width=0 forces
    // the browser to free the GPU/RAM-backed pixel store, which is critical
    // on mobile Safari where repeated 3× DPI area scans on a 7-inch display
    // can otherwise crash the tab after ~6-8 scans.
    if (slice) {
      slice.width = 0;
      slice.height = 0;
    }
    await cleanup();
  }
}

// ════════════════════════════════════════════════════════════════════════
// Google Cloud Vision OCR — second-opinion engine for stubborn text.
//
// Tesseract is great but it stumbles on stylised display fonts (the kind
// you find on Indian Govt. certificates: ornate names, embossed seals,
// faux-handwriting). Google Vision's deep model handles these cleanly and
// returns per-word polygon vertices, which we map back into the editor's
// display-coordinate space the same way the Tesseract path does.
//
// Calls go through our own `/api/tools/vision-ocr` endpoint so the API
// key never ships to the browser.
// ════════════════════════════════════════════════════════════════════════

type VisionVertex = { x?: number; y?: number };
interface VisionWord {
  boundingBox?: { vertices?: VisionVertex[] };
  symbols?: { text?: string }[];
  confidence?: number;
}
interface VisionParagraph {
  words?: VisionWord[];
}
interface VisionBlock {
  paragraphs?: VisionParagraph[];
}
interface VisionPage {
  blocks?: VisionBlock[];
}
interface VisionResponse {
  fullTextAnnotation?: { pages?: VisionPage[] } | null;
  textAnnotations?: { description?: string }[];
}

/** Reduce 4 polygon vertices to an axis-aligned bbox. */
function visionVerticesToBbox(vertices?: VisionVertex[]) {
  if (!vertices || vertices.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const v of vertices) {
    const x = v.x ?? 0;
    const y = v.y ?? 0;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  if (!isFinite(x0) || x1 <= x0 || y1 <= y0) return null;
  return { x0, y0, x1, y1 };
}

function visionWordText(w: VisionWord): string {
  return (w.symbols ?? []).map((s) => s?.text ?? "").join("");
}

/**
 * POST a PNG-encoded canvas to our server-side Vision proxy.
 *
 * The browser only ever sees `/api/tools/vision-ocr` — the actual Google
 * API key lives on the server. Returns the trimmed Vision response with
 * `fullTextAnnotation` and `textAnnotations`.
 */
export async function fetchGoogleVisionOCR(
  canvas: HTMLCanvasElement,
): Promise<VisionResponse> {
  const dataUrl = canvas.toDataURL("image/png");
  const imageBase64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
  return apiFetch<VisionResponse>("/api/tools/vision-ocr", {
    method: "POST",
    body: JSON.stringify({
      imageBase64,
      feature: "DOCUMENT_TEXT_DETECTION",
    }),
  });
}

/**
 * High-precision OCR over a user-drawn region using Google Cloud Vision.
 *
 * Same input/output contract as `extractAreaTextOCR` so the editor can
 * swap engines without touching coord math elsewhere.
 *
 * Request size optimisation: we render the whole page at 3× DPI but
 * only POST the *cropped slice* to Vision — that keeps a typical request
 * under ~500KB instead of several MB, so each call charges as a single
 * Vision unit and stays inside the free 1000 units/month tier.
 */
export async function extractAreaTextVision(
  file: File,
  pageIdx: number,
  displayWidth: number,
  region: { x: number; y: number; w: number; h: number },
  onProgress?: (pct: number, status: string) => void,
  // Render scale hint. Defaults to 3× for sharp glyphs on small area scans.
  // Smart Text Edit's full-page Vision fallback overrides this to 2× so the
  // resulting PNG stays comfortably under the API server's 12 MiB base64
  // upload cap (a full A4 page at 3× can blow past it on image-heavy PDFs).
  scaleHint: number = 3,
): Promise<ExtractedTextResult> {
  const loaded = await loadPdfPageCanvas(file, pageIdx, displayWidth, scaleHint);
  if ("encrypted" in loaded) {
    return {
      elements: [],
      whiteoutRects: [],
      displayWidth,
      displayHeight: 0,
      reason: "encrypted",
    };
  }
  const { canvas: full, cleanup } = loaded;
  let slice: HTMLCanvasElement | null = null;

  try {
    onProgress?.(0.05, "cropping selection");
    const cssScale = full.width / displayWidth;
    const sx = Math.max(0, Math.round(region.x * cssScale));
    const sy = Math.max(0, Math.round(region.y * cssScale));
    const sw = Math.max(2, Math.round(region.w * cssScale));
    const sh = Math.max(2, Math.round(region.h * cssScale));
    const cw = Math.min(full.width - sx, sw);
    const ch = Math.min(full.height - sy, sh);
    slice = document.createElement("canvas");
    slice.width = Math.max(2, cw);
    slice.height = Math.max(2, ch);
    const sctx = slice.getContext("2d")!;
    sctx.fillStyle = "#ffffff";
    sctx.fillRect(0, 0, slice.width, slice.height);
    sctx.drawImage(full, sx, sy, cw, ch, 0, 0, cw, ch);

    onProgress?.(0.15, "uploading to Google AI");
    const response = await fetchGoogleVisionOCR(slice);

    onProgress?.(0.85, "placing text blocks");
    const elements: Omit<TextEl, "id" | "z">[] = [];
    const whiteoutRects: { x: number; y: number; w: number; h: number }[] = [];
    const inv = 1 / cssScale;

    const pages = response?.fullTextAnnotation?.pages ?? [];
    for (const page of pages) {
      for (const block of page.blocks ?? []) {
        for (const para of block.paragraphs ?? []) {
          for (const word of para.words ?? []) {
            const text = visionWordText(word).trim();
            if (!text) continue;
            const bb = visionVerticesToBbox(word.boundingBox?.vertices);
            if (!bb) continue;
            // slice px → display px, then offset by region origin.
            const x = region.x + bb.x0 * inv;
            const y = region.y + bb.y0 * inv;
            const w = (bb.x1 - bb.x0) * inv;
            const h = (bb.y1 - bb.y0) * inv;
            if (w < 4 || h < 6) continue;
            const fontSize = Math.max(8, h * 0.85);
            const padX = Math.max(2, fontSize * 0.08);
            const padY = Math.max(2, fontSize * 0.12);
            const boxX = Math.max(0, x - padX);
            const boxY = Math.max(0, y - padY);
            const boxW = Math.max(8, w + padX * 2);
            const boxH = Math.max(10, h + padY * 2);
            elements.push({
              pageIndex: pageIdx,
              type: "text",
              x: boxX,
              y: boxY,
              width: boxW,
              height: boxH,
              rotation: 0,
              text,
              fontSize,
              color: "#0f172a",
              bold: false,
              italic: false,
              underline: false,
              fontFamily: "Helvetica",
              // Transparent: extracted text overlays the cleaned page
              // raster without a white rectangle behind it that would
              // erase nearby table grid lines.
              bgColor: null,
              align: "left",
              extracted: true,
            });
            whiteoutRects.push({ x: boxX, y: boxY, w: boxW, h: boxH });
          }
        }
      }
    }

    onProgress?.(0.98, "done");
    return {
      elements,
      whiteoutRects,
      displayWidth,
      displayHeight: Math.round(full.height / cssScale),
      reason: elements.length > 0 ? "ok" : "no-text",
    };
  } finally {
    // Mirror the slice-release in the Tesseract path — see comment there.
    if (slice) {
      slice.width = 0;
      slice.height = 0;
    }
    await cleanup();
  }
}

/* ── Gemini AI OCR ─────────────────────────────────────────────────────────
 * Server-side OCR via Gemini 2.5 Flash. Used by Smart Text Edit so that:
 *   1. The browser never has to load Tesseract WASM (~25 MB) — that was
 *      blowing past the per-tab memory cap on mid-range Android phones
 *      and triggering an "automatic reload" of the editor.
 *   2. We don't depend on Google Cloud Vision billing being enabled on
 *      the project's GCP account.
 *   3. Stylised display fonts (e.g. certificate names like "JAGRUTI
 *      CHUDASAMA") are read correctly — Gemini handles them well, where
 *      Tesseract typically fails.
 *
 * Same input/output contract as `extractAreaTextOCR` / `extractAreaTextVision`
 * so the editor stays engine-agnostic.
 */
interface GeminiOcrApiResponse {
  blocks: {
    text: string;
    x: number;
    y: number;
    w: number;
    h: number;
    // Optional per-block style detected by Gemini (best-effort).
    // Any of these may be missing — client falls back to defaults.
    font_family?: "serif" | "sans" | "mono";
    is_bold?: boolean;
    is_italic?: boolean;
    color?: string; // hex e.g. "#0f172a"
  }[];
}
export async function extractAreaTextGemini(
  file: File,
  pageIdx: number,
  displayWidth: number,
  region: { x: number; y: number; w: number; h: number },
  onProgress?: (pct: number, status: string) => void,
  // Render scale hint. 1.5× keeps the JPEG well under the 8 MiB cap on
  // the api-server while still giving Gemini enough resolution to read
  // small glyphs reliably. The model is trained on web/document imagery
  // and rarely needs more than ~1500 px on the long edge.
  scaleHint: number = 1.5,
): Promise<ExtractedTextResult> {
  const loaded = await loadPdfPageCanvas(file, pageIdx, displayWidth, scaleHint);
  if ("encrypted" in loaded) {
    return {
      elements: [],
      whiteoutRects: [],
      displayWidth,
      displayHeight: 0,
      reason: "encrypted",
    };
  }
  const { canvas: full, cleanup } = loaded;
  // Track the cropped slice so we can explicitly release its backing
  // store (`canvas.width = 0`) before returning. On mobile Safari/Chrome
  // canvases are not GC'd promptly — letting them dangle has caused the
  // tab to OOM-reload after a few back-to-back Smart Text Edit runs.
  let slice: HTMLCanvasElement | null = null;

  try {
    onProgress?.(0.05, "preparing");
    const cssScale = full.width / displayWidth;
    const sx = Math.max(0, Math.round(region.x * cssScale));
    const sy = Math.max(0, Math.round(region.y * cssScale));
    const sw = Math.max(2, Math.round(region.w * cssScale));
    const sh = Math.max(2, Math.round(region.h * cssScale));
    const cw = Math.min(full.width - sx, sw);
    const ch = Math.min(full.height - sy, sh);
    slice = document.createElement("canvas");
    slice.width = Math.max(2, cw);
    slice.height = Math.max(2, ch);
    const sliceW = slice.width;
    const sliceH = slice.height;
    const sctx = slice.getContext("2d")!;
    sctx.fillStyle = "#ffffff";
    sctx.fillRect(0, 0, sliceW, sliceH);
    sctx.drawImage(full, sx, sy, cw, ch, 0, 0, cw, ch);

    onProgress?.(0.15, "uploading");
    // JPEG @ 0.85 keeps base64 under ~1 MB for a typical full A4 page,
    // well inside the 8 MiB server cap and the 8 MB Gemini inline limit.
    const dataUrl = slice.toDataURL("image/jpeg", 0.85);
    const imageBase64 = dataUrl.replace(/^data:[^;]+;base64,/, "");

    const response = await apiFetch<GeminiOcrApiResponse>(
      "/api/tools/gemini-ocr",
      {
        method: "POST",
        body: JSON.stringify({
          imageBase64,
          imageWidth: sliceW,
          imageHeight: sliceH,
          mimeType: "image/jpeg",
        }),
      },
    );

    onProgress?.(0.85, "placing text blocks");
    const elements: Omit<TextEl, "id" | "z">[] = [];
    const whiteoutRects: { x: number; y: number; w: number; h: number }[] = [];
    const inv = 1 / cssScale;
    const blocks = Array.isArray(response?.blocks) ? response.blocks : [];

    for (const b of blocks) {
      const text = (b.text ?? "").trim();
      if (!text) continue;
      // slice px → display px, then offset by region origin.
      const x = region.x + b.x * inv;
      const y = region.y + b.y * inv;
      const w = b.w * inv;
      const h = b.h * inv;
      // Defensive noise filter — drops likely-spurious blocks even if
      // the model ignored the prompt's confidence-gate. Screen photos
      // with moiré cause the model to occasionally invent 1–2 char
      // "blocks" from speckle, which show up as tiny text squiggles
      // floating across the page.
      if (w < 8 || h < 10) continue;
      if (text.length === 1 && !/^[\dA-Za-zઅ-હक-ह]$/.test(text)) continue;
      // Drop pure punctuation / symbol-only short blocks (·, —, |, …).
      if (text.length <= 3 && !/[\p{L}\p{N}]/u.test(text)) continue;

      // ── Defensive font-size estimation ───────────────────────────
      // Gemini sometimes returns a paragraph-level box that spans
      // multiple visual lines, even though the prompt asks for one
      // entry per line. If we naively use `h * 0.85` as fontSize the
      // text renders as a giant single line, completely destroying
      // the page layout (the bug the user just reported).
      //
      // Estimate the number of visual lines two ways and take the
      // larger:
      //   (a) explicit \n in the OCR text
      //   (b) implicit wrap based on box aspect ratio:
      //       lines ≈ round( textWidthEstimate / boxWidth )
      //       where textWidthEstimate ≈ chars × ( h × 0.55 ) — i.e.
      //       assume average glyph advance ≈ 0.55 × line-height.
      // Then perLineH = h / lines, and the font is sized off that.
      const explicitLines = text.split(/\r?\n/).length;
      const avgAdvance = h * 0.55; // px per char at single-line height
      const estTextWidth = text.replace(/\s+/g, " ").length * avgAdvance;
      const wrapLines = Math.max(
        1,
        Math.round(estTextWidth / Math.max(1, w)),
      );
      const lineCount = Math.max(1, explicitLines, wrapLines);
      const perLineH = h / lineCount;
      // Cap fontSize: never larger than 0.85 × per-line-height,
      // never larger than 0.45 × box height (sanity cap for huge
      // single-line boxes from heading text), never < 8 px.
      const fontSize = Math.max(
        8,
        Math.min(perLineH * 0.85, h * 0.45 * (lineCount === 1 ? 2 : 1)),
      );

      // Whiteout pad: a touch larger than the text element so no
      // original glyph fragments leak out the sides/top.
      const padX = Math.max(3, fontSize * 0.18);
      const padY = Math.max(3, fontSize * 0.22);
      const boxX = Math.max(0, x - padX);
      const boxY = Math.max(0, y - padY);
      const boxW = Math.max(8, w + padX * 2);
      const boxH = Math.max(10, h + padY * 2);
      // ── Gemini-detected style → editor TextEl style ──────────────
      // Map the OCR engine's font-family bucket onto one of the three
      // PDF standard families the export pipeline embeds. Pure
      // best-effort: a wrong guess only changes the look of the
      // editable replacement (user can still re-pick from the toolbar),
      // it never breaks layout. Unknown / missing family → Helvetica.
      const familyBucket = b.font_family;
      const fontFamily: TextEl["fontFamily"] =
        familyBucket === "serif"
          ? "Times"
          : familyBucket === "mono"
          ? "Courier"
          : "Helvetica";
      const isBold = b.is_bold === true;
      const isItalic = b.is_italic === true;
      // Validate Gemini's hex string defensively. Anything not matching
      // #rrggbb falls back to the editor's near-black default so we
      // never end up with a transparent/invalid CSS colour.
      const detectedColor =
        typeof b.color === "string" && /^#[0-9a-f]{6}$/i.test(b.color)
          ? b.color.toLowerCase()
          : "#0f172a";

      elements.push({
        pageIndex: pageIdx,
        type: "text",
        x: boxX,
        y: boxY,
        width: boxW,
        height: boxH,
        rotation: 0,
        text,
        fontSize,
        color: detectedColor,
        bold: isBold,
        italic: isItalic,
        underline: false,
        fontFamily,
        // Transparent: extracted text overlays the cleaned page raster
        // without a white rectangle behind it. Keeps every nearby
        // table grid line / border / QR cell intact in the export.
        bgColor: null,
        align: "left",
        extracted: true,
      });
      // Whiteout slightly larger again so the cover survives anti-
      // aliased edges and stylised serif overhangs.
      const wPad = Math.max(4, fontSize * 0.25);
      const hPad = Math.max(4, fontSize * 0.3);
      whiteoutRects.push({
        x: Math.max(0, x - wPad),
        y: Math.max(0, y - hPad),
        w: w + wPad * 2,
        h: h + hPad * 2,
      });
    }

    onProgress?.(0.98, "done");
    return {
      elements,
      whiteoutRects,
      displayWidth,
      displayHeight: Math.round(full.height / cssScale),
      reason: elements.length > 0 ? "ok" : "no-text",
    };
  } finally {
    // Drop the cropped slice's backing store *before* awaiting cleanup —
    // browsers don't free canvas memory on GC alone, especially on iOS.
    if (slice) {
      slice.width = 0;
      slice.height = 0;
      slice = null;
    }
    await cleanup();
  }
}

/** Render an SVG string to a PNG data URL at the requested pixel size. */
export async function svgToPngDataUrl(svg: string, size = 256): Promise<string> {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("SVG load error"));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    const ratio = img.naturalHeight / img.naturalWidth || 1;
    canvas.width = size;
    canvas.height = Math.round(size * ratio);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Convert a File (PNG/JPG) to a data URL, with optional white-bg removal for signatures. */
export async function fileToDataUrl(file: File, removeWhite = false): Promise<string> {
  const buf = await file.arrayBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: file.type }));
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Image load error"));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    if (removeWhite) {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < data.data.length; i += 4) {
        const r = data.data[i],
          g = data.data[i + 1],
          b = data.data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum > 220) data.data[i + 3] = 0;
      }
      ctx.putImageData(data, 0, 0);
      return canvas.toDataURL("image/png");
    }
    return canvas.toDataURL(file.type.includes("png") ? "image/png" : "image/jpeg", 0.95);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ── Coordinate transforms ──────────────────────────────────────────────────
 *
 * The user paints elements on a *visible* (already-rotated) canvas with the
 * top-left as the origin. We need to convert those positions into pdf-lib's
 * unrotated, bottom-left-origin PDF coordinate system, accounting for the
 * page's /Rotate metadata so the viewer ends up showing the element in the
 * exact spot the user dropped it.
 *
 * `toPdfPt`  — maps a single visible point (xv, yv) to unrotated PDF (X, Y).
 * `mapImageBox` — maps a visible rectangle to the (anchor, w, h, rotate)
 *               that pdf-lib's drawImage / drawRectangle need so that the
 *               final on-screen rendering is upright at the requested spot.
 */
function toPdfPt(xv: number, yv: number, rot: number, pw: number, ph: number) {
  switch (rot) {
    case 90:
      return { x: pw - yv, y: ph - xv };
    case 180:
      return { x: pw - xv, y: yv };
    case 270:
      return { x: yv, y: xv };
    default:
      return { x: xv, y: ph - yv };
  }
}

function mapImageBox(
  xv: number,
  yv: number,
  wv: number,
  hv: number,
  rot: number,
  pw: number,
  ph: number,
) {
  switch (rot) {
    case 90:
      return { x: pw - yv - hv, y: ph - xv, w: wv, h: hv, rotate: -90 };
    case 180:
      return { x: pw - xv, y: yv + hv, w: wv, h: hv, rotate: 180 };
    case 270:
      return { x: yv + hv, y: xv, w: wv, h: hv, rotate: 90 };
    default:
      return { x: xv, y: ph - yv - hv, w: wv, h: hv, rotate: 0 };
  }
}

/**
 * Rasterize a single element to a PNG dataURL with its rotation + crop applied.
 * The output canvas exactly fills the element's display bounding box, so the
 * caller can place it via mapImageBox using the element's normal (xV,yV,wV,hV).
 *
 * Used when an element has a non-zero rotation or any crop inset — for these
 * cases vector drawing is replaced with a raster sub-image that uniformly
 * supports rotation around centre + edge clipping for ALL element types.
 */
async function rasterizeElement(el: EditorElement, dpi: number): Promise<string> {
  const W = Math.max(2, Math.round(el.width * dpi));
  const H = Math.max(2, Math.round(el.height * dpi));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  // Crop = inset clip rect (in canvas pixels).
  const cl = (el.crop?.left ?? 0) * dpi;
  const ct = (el.crop?.top ?? 0) * dpi;
  const cr = (el.crop?.right ?? 0) * dpi;
  const cb = (el.crop?.bottom ?? 0) * dpi;
  const cw = Math.max(1, W - cl - cr);
  const ch = Math.max(1, H - ct - cb);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cl, ct, cw, ch);
  ctx.clip();
  // Rotate around the element's centre (clockwise visually).
  const rad = ((el.rotation ?? 0) * Math.PI) / 180;
  ctx.translate(W / 2, H / 2);
  ctx.rotate(rad);
  ctx.translate(-W / 2, -H / 2);
  // Draw element body in local (0,0)-(W,H) space.
  if (el.type === "image" || el.type === "icon" || el.type === "signature") {
    const img = await loadImage(el.src);
    // object-contain: fit while preserving aspect ratio.
    const sr = img.naturalWidth / img.naturalHeight;
    const dr = W / H;
    let dw = W,
      dh = H,
      dx = 0,
      dy = 0;
    if (sr > dr) {
      dh = W / sr;
      dy = (H - dh) / 2;
    } else {
      dw = H * sr;
      dx = (W - dw) / 2;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
  } else if (el.type === "rect") {
    if (el.fillColor) {
      ctx.fillStyle = el.fillColor;
      ctx.fillRect(0, 0, W, H);
    }
    if (el.strokeWidth > 0) {
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = Math.max(1, el.strokeWidth * dpi);
      ctx.strokeRect(
        el.strokeWidth * dpi * 0.5,
        el.strokeWidth * dpi * 0.5,
        W - el.strokeWidth * dpi,
        H - el.strokeWidth * dpi,
      );
    }
  } else if (el.type === "circle") {
    const sw = Math.max(0, el.strokeWidth) * dpi;
    ctx.beginPath();
    ctx.ellipse(W / 2, H / 2, Math.max(1, W / 2 - sw / 2), Math.max(1, H / 2 - sw / 2), 0, 0, Math.PI * 2);
    if (el.fillColor) {
      ctx.fillStyle = el.fillColor;
      ctx.fill();
    }
    if (sw > 0) {
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = sw;
      ctx.stroke();
    }
  } else if (el.type === "line" || el.type === "arrow") {
    const sw = Math.max(1, el.strokeWidth) * dpi;
    ctx.strokeStyle = el.strokeColor;
    ctx.lineWidth = sw;
    ctx.lineCap = "round";
    const isArrow = el.type === "arrow";
    const dist = Math.hypot(W, H);
    const headLen = isArrow ? Math.min(28 * dpi, dist * 0.3) : 0;
    const ang = Math.atan2(H, W);
    const lex = W - Math.cos(ang) * headLen * 0.85;
    const ley = H - Math.sin(ang) * headLen * 0.85;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(isArrow ? lex : W, isArrow ? ley : H);
    ctx.stroke();
    if (isArrow) {
      const hx1 = W - Math.cos(ang - Math.PI / 7) * headLen;
      const hy1 = H - Math.sin(ang - Math.PI / 7) * headLen;
      const hx2 = W - Math.cos(ang + Math.PI / 7) * headLen;
      const hy2 = H - Math.sin(ang + Math.PI / 7) * headLen;
      ctx.beginPath();
      ctx.fillStyle = el.strokeColor;
      ctx.moveTo(W, H);
      ctx.lineTo(hx1, hy1);
      ctx.lineTo(hx2, hy2);
      ctx.closePath();
      ctx.fill();
    }
  } else if (el.type === "text") {
    if (el.bgColor) {
      ctx.fillStyle = el.bgColor;
      ctx.fillRect(0, 0, W, H);
    }
    const fs = el.fontSize * dpi;
    const family =
      el.fontFamily === "Times" ? "Times, serif" : el.fontFamily === "Courier" ? "Courier, monospace" : "Helvetica, Arial, sans-serif";
    ctx.fillStyle = el.color;
    ctx.font = `${el.italic ? "italic " : ""}${el.bold ? "bold " : ""}${fs}px ${family}`;
    ctx.textBaseline = "alphabetic";
    const align = el.align ?? "left";
    ctx.textAlign = align === "center" ? "center" : align === "right" ? "right" : "left";
    const lines = el.text.split("\n");
    const ascent = fs * 0.78;
    const lineGap = el.fontSize * 1.2 * dpi;
    const padX = dpi * 4;
    const startX = align === "center" ? W / 2 : align === "right" ? W - padX : padX;
    for (let i = 0; i < lines.length; i++) {
      const yy = ascent + i * lineGap;
      ctx.fillText(lines[i], startX, yy);
      if (el.underline) {
        const tw = ctx.measureText(lines[i]).width;
        const ulY = yy + fs * 0.12;
        const ulX = align === "center" ? startX - tw / 2 : align === "right" ? startX - tw : startX;
        ctx.beginPath();
        ctx.moveTo(ulX, ulY);
        ctx.lineTo(ulX + tw, ulY);
        ctx.lineWidth = Math.max(1, fs * 0.06);
        ctx.strokeStyle = el.color;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("img load failed"));
    i.src = src;
  });
}

/** Whether an element needs raster export (rotation or crop applied). */
function needsRaster(el: EditorElement): boolean {
  const r = ((el.rotation ?? 0) % 360 + 360) % 360;
  if (r !== 0) return true;
  const c = el.crop;
  if (c && (c.left > 0 || c.top > 0 || c.right > 0 || c.bottom > 0)) return true;
  return false;
}

/**
 * Export the edited PDF: load the original, embed every element on its page
 * mapping display pixels → PDF points using each page's display scale.
 */
export async function exportEditedPdf(
  originalFile: File,
  elements: EditorElement[],
  pageMetas: PageMeta[],
  pageOverlays: Record<number, PageOverlays> = {},
): Promise<Blob> {
  const bytes = new Uint8Array(await originalFile.arrayBuffer());
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();

  // Cache embedded resources.
  const pngCache = new Map<string, any>();
  const fontCache = new Map<string, any>();
  const embedPng = async (dataUrl: string) => {
    let p = pngCache.get(dataUrl);
    if (p) return p;
    if (dataUrl.startsWith("data:image/png")) {
      const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      p = await doc.embedPng(u8);
    } else {
      const b64 = dataUrl.replace(/^data:image\/jpe?g;base64,/, "");
      const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      p = await doc.embedJpg(u8);
    }
    pngCache.set(dataUrl, p);
    return p;
  };
  const embedFont = async (
    family: TextEl["fontFamily"],
    bold: boolean,
    italic: boolean,
  ) => {
    let key: keyof typeof StandardFonts;
    if (family === "Times") {
      key = bold && italic ? "TimesRomanBoldItalic" : bold ? "TimesRomanBold" : italic ? "TimesRomanItalic" : "TimesRoman";
    } else if (family === "Courier") {
      key = bold && italic ? "CourierBoldOblique" : bold ? "CourierBold" : italic ? "CourierOblique" : "Courier";
    } else {
      key = bold && italic ? "HelveticaBoldOblique" : bold ? "HelveticaBold" : italic ? "HelveticaOblique" : "Helvetica";
    }
    const k = String(key);
    if (fontCache.has(k)) return fontCache.get(k);
    const f = await doc.embedFont(StandardFonts[key]);
    fontCache.set(k, f);
    return f;
  };

  // ── Pre-pre-pass: clean-background wipe ────────────────────────────
  // For pages flagged with cleanBackground we want to bury the original
  // noisy raster (moiré, scan halo, screen-photo cream tint, paper
  // texture) but KEEP the structural ink the page contains — table grid
  // lines, QR-code modules, stamps, signatures, logos — so the export
  // looks like the original PDF, just cleaner. The client side already
  // produced a per-page "cleaned" image via cleanPageBackground() (hard
  // luminance threshold: bright→white, dark→preserved). We embed that
  // cleaned image as a full-page background. Stacking order ends up:
  //   [original noisy page] → [CLEANED IMAGE COVER] → [mask] → [elements]
  //
  // Defensive fallback: if the cleaned image is missing for any reason
  // (cache cleared, decode failure, race during page switch), we drop
  // back to the previous behaviour — a solid white rectangle. The page
  // still ends up "clean" just without the preserved table/QR ink.
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const ov = pageOverlays[pageIdx];
    if (!ov?.cleanBackground) continue;
    const page = pages[pageIdx];
    const meta = pageMetas[pageIdx];
    const { width: pw, height: ph } = page.getSize();
    let drewImage = false;
    if (ov.cleanBgImageDataUrl && meta) {
      try {
        // cleanPageBackground emits PNG; embedPng()/embedJpg() inside
        // the local helper auto-routes by mime so we just hand it the
        // raw dataUrl. Result is cached, so repeated pages reuse it.
        const embedded = await embedPng(ov.cleanBgImageDataUrl);
        // CRITICAL: cleanBgImageDataUrl was generated from the rendered
        // viewport (post-rotation, display-orientation pixels). PDF user
        // space is bottom-left origin and may be rotated 90/180/270.
        // We must use the same rotation-aware mapping as the mask pre-
        // pass below — otherwise rotated pages get a misoriented or
        // mis-sized cleaned background that no longer aligns with the
        // page content the user is editing.
        const rot = meta.rotation;
        const visW = rot === 90 || rot === 270 ? ph : pw;
        const visHpt = rot === 90 || rot === 270 ? pw : ph;
        const m = mapImageBox(0, 0, visW, visHpt, rot, pw, ph);
        page.drawImage(embedded, {
          x: m.x,
          y: m.y,
          width: m.w,
          height: m.h,
          rotate: degrees(m.rotate),
        });
        drewImage = true;
      } catch {
        // Embed failure — fall through to the white-rect fallback so
        // the export still produces something usable.
      }
    }
    if (!drewImage) {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pw,
        height: ph,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });
    }
  }

  // ── Pre-pass: stamp the AI-Erase / extraction white-out mask onto each
  // page BEFORE elements draw, so editor-level stacking
  // (page → mask → elements → crop) is preserved in the exported PDF.
  // Otherwise, extracted text replacements at the original glyph location
  // would be hidden by the mask painted on top of them.
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const ov = pageOverlays[pageIdx];
    if (!ov?.maskDataUrl) continue;
    const page = pages[pageIdx];
    const meta = pageMetas[pageIdx];
    if (!meta) continue;
    const rot = meta.rotation;
    const { width: pw, height: ph } = page.getSize();
    const visW = rot === 90 || rot === 270 ? ph : pw;
    const visHpt = rot === 90 || rot === 270 ? pw : ph;
    const img = await embedPng(ov.maskDataUrl);
    const m = mapImageBox(0, 0, visW, visHpt, rot, pw, ph);
    page.drawImage(img, {
      x: m.x,
      y: m.y,
      width: m.w,
      height: m.h,
      rotate: degrees(m.rotate),
    });
  }

  // Group elements by page, sorted by z-index ascending so later draws are on top.
  const byPage = new Map<number, EditorElement[]>();
  elements.forEach((el) => {
    if (!byPage.has(el.pageIndex)) byPage.set(el.pageIndex, []);
    byPage.get(el.pageIndex)!.push(el);
  });

  for (const [pageIdx, els] of byPage) {
    if (pageIdx < 0 || pageIdx >= pages.length) continue;
    const page = pages[pageIdx];
    const meta = pageMetas[pageIdx];
    if (!meta) continue;
    const sorted = [...els].sort((a, b) => a.z - b.z);
    const rot = meta.rotation;
    const { width: pw, height: ph } = page.getSize();
    const visW = rot === 90 || rot === 270 ? ph : pw;
    const visH = rot === 90 || rot === 270 ? pw : ph;
    const scale = visW / meta.displayWidth; // px → pt

    for (const el of sorted) {
      // Display-space → visible-PDF-space (top-left origin still).
      const xV = el.x * scale;
      const yV = el.y * scale;
      const wV = el.width * scale;
      const hV = el.height * scale;
      void visH;

      // ── Rotated or cropped → rasterize to PNG and embed uniformly ──
      if (needsRaster(el)) {
        // 2× display DPI keeps rasterised text/shapes crisp at print size.
        const dpi = Math.max(2, scale * 2);
        const dataUrl = await rasterizeElement(el, dpi);
        const img = await embedPng(dataUrl);
        const m = mapImageBox(xV, yV, wV, hV, rot, pw, ph);
        page.drawImage(img, {
          x: m.x,
          y: m.y,
          width: m.w,
          height: m.h,
          rotate: degrees(m.rotate),
        });
        continue;
      }

      if (el.type === "image" || el.type === "icon" || el.type === "signature") {
        const img = await embedPng(el.src);
        const m = mapImageBox(xV, yV, wV, hV, rot, pw, ph);
        page.drawImage(img, {
          x: m.x,
          y: m.y,
          width: m.w,
          height: m.h,
          rotate: degrees(m.rotate),
        });
      } else if (el.type === "rect") {
        const m = mapImageBox(xV, yV, wV, hV, rot, pw, ph);
        page.drawRectangle({
          x: m.x,
          y: m.y,
          width: m.w,
          height: m.h,
          borderColor: hexToRgb01(el.strokeColor),
          borderWidth: el.strokeWidth * scale,
          color: el.fillColor ? hexToRgb01(el.fillColor) : undefined,
          rotate: degrees(m.rotate),
        });
      } else if (el.type === "circle") {
        // Map the center via the point transform; swap scales on 90/270 so
        // the visual aspect ratio of the ellipse matches the visible bbox.
        const cxv = xV + wV / 2;
        const cyv = yV + hV / 2;
        const c = toPdfPt(cxv, cyv, rot, pw, ph);
        const xScale = rot === 90 || rot === 270 ? hV / 2 : wV / 2;
        const yScale = rot === 90 || rot === 270 ? wV / 2 : hV / 2;
        page.drawEllipse({
          x: c.x,
          y: c.y,
          xScale,
          yScale,
          borderColor: hexToRgb01(el.strokeColor),
          borderWidth: el.strokeWidth * scale,
          color: el.fillColor ? hexToRgb01(el.fillColor) : undefined,
        });
      } else if (el.type === "line" || el.type === "arrow") {
        // Endpoints in visible coords. For arrow, trim the line before the
        // head so it doesn't bleed past the triangle tip.
        const sx = xV;
        const sy = yV;
        const ex = xV + wV;
        const ey = yV + hV;
        const len = Math.hypot(wV, hV);
        if (len < 1) continue;
        const isArrow = el.type === "arrow";
        const headLen = isArrow ? Math.min(28 * scale, len * 0.3) : 0;
        const ang = Math.atan2(ey - sy, ex - sx);
        const lex = ex - Math.cos(ang) * headLen * 0.85;
        const ley = ey - Math.sin(ang) * headLen * 0.85;
        const a = toPdfPt(sx, sy, rot, pw, ph);
        const b = toPdfPt(isArrow ? lex : ex, isArrow ? ley : ey, rot, pw, ph);
        page.drawLine({
          start: { x: a.x, y: a.y },
          end: { x: b.x, y: b.y },
          thickness: el.strokeWidth * scale,
          color: hexToRgb01(el.strokeColor),
        });
        if (isArrow) {
          const c = toPdfPt(ex, ey, rot, pw, ph);
          const hx1 = ex - Math.cos(ang - Math.PI / 7) * headLen;
          const hy1 = ey - Math.sin(ang - Math.PI / 7) * headLen;
          const hx2 = ex - Math.cos(ang + Math.PI / 7) * headLen;
          const hy2 = ey - Math.sin(ang + Math.PI / 7) * headLen;
          const h1 = toPdfPt(hx1, hy1, rot, pw, ph);
          const h2 = toPdfPt(hx2, hy2, rot, pw, ph);
          page.drawSvgPath(
            `M ${c.x} ${c.y} L ${h1.x} ${h1.y} L ${h2.x} ${h2.y} Z`,
            {
              color: hexToRgb01(el.strokeColor),
              borderWidth: 0,
            },
          );
        }
      } else if (el.type === "text") {
        // Optional opaque background — covers the original PDF text under
        // elements created by Smart Word Extraction.
        if (el.bgColor) {
          const m = mapImageBox(xV, yV, wV, hV, rot, pw, ph);
          page.drawRectangle({
            x: m.x,
            y: m.y,
            width: m.w,
            height: m.h,
            color: hexToRgb01(el.bgColor),
            rotate: degrees(m.rotate),
          });
        }
        const font = await embedFont(el.fontFamily, el.bold, el.italic);
        const fontSizePt = el.fontSize * scale;
        const ascent = fontSizePt * 0.78; // matches DOM line-box visually
        const lineGap = el.fontSize * 1.2 * scale;
        const lines = el.text.split("\n");
        const drawRot = rot === 90 ? -90 : rot === 270 ? 90 : rot;
        const align = el.align ?? "left";
        for (let li = 0; li < lines.length; li++) {
          // Compute per-line x offset to honour alignment within the element box.
          const tw = font.widthOfTextAtSize(lines[li], fontSizePt);
          const lineXv =
            align === "center"
              ? xV + (wV - tw) / 2
              : align === "right"
              ? xV + wV - tw
              : xV;
          const blyV = yV + ascent + li * lineGap;
          const anchor = toPdfPt(lineXv, blyV, rot, pw, ph);
          page.drawText(lines[li], {
            x: anchor.x,
            y: anchor.y,
            size: fontSizePt,
            font,
            color: hexToRgb01(el.color),
            rotate: degrees(drawRot),
          });
          if (el.underline) {
            // Underline = horizontal line in visible space, just below baseline.
            const ulYv = blyV + fontSizePt * 0.12;
            const ulX1 = lineXv;
            const ulX2 = lineXv + tw;
            const u1 = toPdfPt(ulX1, ulYv, rot, pw, ph);
            const u2 = toPdfPt(ulX2, ulYv, rot, pw, ph);
            page.drawLine({
              start: { x: u1.x, y: u1.y },
              end: { x: u2.x, y: u2.y },
              thickness: Math.max(0.5, fontSizePt * 0.06),
              color: hexToRgb01(el.color),
            });
          }
        }
      }
    }
  }

  // ── Post-pass: apply Crop only. (Mask was drawn pre-elements above.) ──
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const ov = pageOverlays[pageIdx];
    if (!ov) continue;
    const page = pages[pageIdx];
    const meta = pageMetas[pageIdx];
    if (!meta) continue;
    const rot = meta.rotation;
    const { width: pw, height: ph } = page.getSize();
    const visW = rot === 90 || rot === 270 ? ph : pw;
    const scale = visW / meta.displayWidth;

    if (ov.cropRect) {
      // Convert visible-display crop rect to a PDF-coord crop box.
      const cx = ov.cropRect.x * scale;
      const cy = ov.cropRect.y * scale;
      const cw = ov.cropRect.w * scale;
      const ch = ov.cropRect.h * scale;
      const m = mapImageBox(cx, cy, cw, ch, rot, pw, ph);
      // After mapImageBox, (m.x, m.y) is the corner anchor — for crop we need
      // the AABB in unrotated PDF coords. Compute it directly from corners.
      const c1 = toPdfPt(cx, cy, rot, pw, ph);
      const c2 = toPdfPt(cx + cw, cy + ch, rot, pw, ph);
      const minX = Math.min(c1.x, c2.x);
      const minY = Math.min(c1.y, c2.y);
      const maxX = Math.max(c1.x, c2.x);
      const maxY = Math.max(c1.y, c2.y);
      page.setCropBox(minX, minY, maxX - minX, maxY - minY);
      void m;
    }
  }

  const saved = await doc.save();
  return new Blob([saved as unknown as ArrayBuffer], { type: "application/pdf" });
}
