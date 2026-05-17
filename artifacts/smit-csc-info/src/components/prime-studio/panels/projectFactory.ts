/**
 * Prime Studio — project factory.
 *
 * Centralises every "create a fresh project from <X>" code path so
 * sidebar panels, the tabs bar, the New-design dialog, and the
 * Projects-panel dropdown all share one tested implementation.
 *
 * All factories return a fully-formed `ProjectData` ready to hand off
 * to `openProjectAsNewTab()`, which:
 *   • upserts the project into the My-Projects library,
 *   • adds it to the open-tabs strip,
 *   • marks it active,
 *   • loads it into the live Konva scene.
 *
 * Heavy file-format work (PDF / DOCX / XLSX) is lazy-loaded so the main
 * studio bundle isn't penalised when nobody uses these importers.
 */

import { useStudio } from "../store";
import {
  DEFAULT_PAGE_W,
  DEFAULT_PAGE_H,
  uid,
  type ProjectData,
  type PageData,
  type ImageElement,
} from "../types";
import {
  upsertProject,
  addOpenTab,
  setActiveProjectId,
  saveCurrent,
} from "./projectsStorage";

// ───────────────── Common preset sizes ─────────────────────────────────

export interface PresetSize {
  label: string;
  sub: string;
  width: number;
  height: number;
  /** Tailwind colour token used for the corner badge. Keeps the picker
   *  visually scannable. */
  accent: string;
}

export const PRESET_SIZES: PresetSize[] = [
  { label: "Custom size", sub: "Set your own width × height", width: 0, height: 0, accent: "purple" },
  { label: "Instagram Post", sub: "1080 × 1080", width: 1080, height: 1080, accent: "pink" },
  { label: "Instagram Story", sub: "1080 × 1920", width: 1080, height: 1920, accent: "rose" },
  { label: "Instagram Reel cover", sub: "1080 × 1920", width: 1080, height: 1920, accent: "fuchsia" },
  { label: "YouTube Thumbnail", sub: "1280 × 720", width: 1280, height: 720, accent: "red" },
  { label: "YouTube Banner", sub: "2560 × 1440", width: 2560, height: 1440, accent: "red" },
  { label: "WhatsApp Status", sub: "1080 × 1920", width: 1080, height: 1920, accent: "green" },
  { label: "WhatsApp Post", sub: "800 × 800", width: 800, height: 800, accent: "emerald" },
  { label: "Facebook Post", sub: "1200 × 630", width: 1200, height: 630, accent: "blue" },
  { label: "Facebook Cover", sub: "1640 × 924", width: 1640, height: 924, accent: "blue" },
  { label: "Twitter / X Post", sub: "1200 × 675", width: 1200, height: 675, accent: "slate" },
  { label: "LinkedIn Post", sub: "1200 × 627", width: 1200, height: 627, accent: "indigo" },
  { label: "Pinterest Pin", sub: "1000 × 1500", width: 1000, height: 1500, accent: "rose" },
  { label: "Visiting Card", sub: "1050 × 600", width: 1050, height: 600, accent: "amber" },
  { label: "Pamphlet", sub: "1500 × 2100", width: 1500, height: 2100, accent: "orange" },
  { label: "A4 Portrait", sub: "2480 × 3508 (300 DPI)", width: 2480, height: 3508, accent: "stone" },
  { label: "A4 Landscape", sub: "3508 × 2480 (300 DPI)", width: 3508, height: 2480, accent: "stone" },
  { label: "Presentation 16:9", sub: "1920 × 1080", width: 1920, height: 1080, accent: "violet" },
  { label: "Mobile Wallpaper", sub: "1080 × 2400", width: 1080, height: 2400, accent: "purple" },
];

// ───────────────── Tiny atomic helpers ─────────────────────────────────

function freshPage(width: number, height: number): PageData {
  return {
    id: uid("pg"),
    name: "Page 1",
    width: Math.max(50, Math.round(width)),
    height: Math.max(50, Math.round(height)),
    background: "#ffffff",
    backgroundImage: null,
    elements: [],
  };
}

function freshProject(opts: {
  title?: string;
  pages?: PageData[];
}): ProjectData {
  return {
    id: uid("proj"),
    title: opts.title || "Untitled design",
    pages: opts.pages?.length
      ? opts.pages
      : [freshPage(DEFAULT_PAGE_W, DEFAULT_PAGE_H)],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function snapshotThumbnail(): string {
  try {
    const cv = document.querySelector(
      '[data-testid="prime-studio-root"] canvas',
    ) as HTMLCanvasElement | null;
    return cv?.toDataURL("image/jpeg", 0.5) ?? "";
  } catch {
    return "";
  }
}

function persistCurrent(): void {
  try {
    const cur = useStudio.getState().exportProject();
    saveCurrent(cur, snapshotThumbnail());
  } catch {
    /* ignore — quota / serialisation */
  }
}

// ───────────────── Public factories ────────────────────────────────────

/** Create a brand-new blank project of the requested size. */
export function makeBlankProject(opts: {
  width?: number;
  height?: number;
  title?: string;
}): ProjectData {
  return freshProject({
    title: opts.title ?? "Untitled design",
    pages: [freshPage(opts.width ?? DEFAULT_PAGE_W, opts.height ?? DEFAULT_PAGE_H)],
  });
}

/**
 * Common end-of-pipeline: persist the current scene, register `proj`
 * in the library + open-tabs strip, mark it active and load it into
 * the Konva scene. All "create a new tab" code paths funnel here.
 */
export function openProjectAsNewTab(proj: ProjectData): void {
  persistCurrent();
  upsertProject(proj);
  addOpenTab(proj.id);
  setActiveProjectId(proj.id);
  useStudio.getState().loadProject(proj);
}

// ───────────────── File → ImageElement helpers ─────────────────────────
//
// IMPORTANT: every importer below stores image content as a **Blob URL**
// (`blob:https://…/abc-123`), NOT a base64 data-URL. Data URLs would
// blow up mobile JS heaps because zustand history snapshots and the
// in-memory project tree end up holding 2-4 copies of the multi-MB
// string. Blob URLs are tiny (~50 bytes) handles into a separate
// browser-managed blob heap that survives tab switches but doesn't
// count against JS heap. Same rationale documented in
// `UploadsPanel.downscaleImageFile`.

function readImageDimensions(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((res, rej) => {
    const img = new window.Image();
    img.onload = () =>
      res({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => rej(new Error("Image load failed"));
    img.src = src;
  });
}

/** Decode a File via createImageBitmap (off-thread, no intermediate
 *  base64), downscale to a max-edge bound, return a freshly minted
 *  blob: URL plus its final dimensions. SVG/GIF passthrough so we
 *  don't lose vector / animation. */
async function imageFileToBlobUrl(
  file: File,
  maxDim = 4000,
): Promise<{ src: string; width: number; height: number }> {
  if (file.type === "image/svg+xml" || file.type === "image/gif") {
    const url = URL.createObjectURL(file);
    const dim = await new Promise<{ w: number; h: number }>((res) => {
      const im = new Image();
      im.onload = () =>
        res({ w: im.naturalWidth || 800, h: im.naturalHeight || 600 });
      im.onerror = () => res({ w: 800, h: 600 });
      im.src = url;
    });
    return { src: url, width: dim.w, height: dim.h };
  }

  let bitmap: ImageBitmap | null = null;
  let imgFallback: HTMLImageElement | null = null;
  let W: number;
  let H: number;
  if (typeof createImageBitmap === "function") {
    bitmap = await createImageBitmap(file);
    W = bitmap.width;
    H = bitmap.height;
  } else {
    const tmpUrl = URL.createObjectURL(file);
    try {
      imgFallback = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = tmpUrl;
      });
      W = imgFallback.naturalWidth;
      H = imgFallback.naturalHeight;
    } finally {
      URL.revokeObjectURL(tmpUrl);
    }
  }
  // Already small + lightweight → just hand back a passthrough blob URL.
  if (W <= maxDim && H <= maxDim && file.size < 600 * 1024) {
    bitmap?.close();
    return { src: URL.createObjectURL(file), width: W, height: H };
  }
  const scale = Math.min(1, maxDim / Math.max(W, H));
  const tw = Math.max(1, Math.round(W * scale));
  const th = Math.max(1, Math.round(H * scale));
  const cv = document.createElement("canvas");
  cv.width = tw;
  cv.height = th;
  const ctx = cv.getContext("2d");
  if (!ctx) {
    bitmap?.close();
    return { src: URL.createObjectURL(file), width: W, height: H };
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const isPng = file.type === "image/png";
  if (!isPng) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, tw, th);
  }
  if (bitmap) {
    ctx.drawImage(bitmap, 0, 0, tw, th);
    bitmap.close();
  } else if (imgFallback) {
    ctx.drawImage(imgFallback, 0, 0, tw, th);
    imgFallback.src = "";
  }
  const blob: Blob = await new Promise((res, rej) =>
    cv.toBlob(
      (b) => (b ? res(b) : rej(new Error("toBlob failed"))),
      isPng ? "image/png" : "image/jpeg",
      0.85,
    ),
  );
  cv.width = 0;
  cv.height = 0;
  return { src: URL.createObjectURL(blob), width: tw, height: th };
}

function fullPageImageElement(
  src: string,
  width: number,
  height: number,
): ImageElement {
  return {
    id: uid("el"),
    type: "image",
    x: 0,
    y: 0,
    width,
    height,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    src,
  };
}

function clampPageDims(w: number, h: number, maxLongest = 4000) {
  const longest = Math.max(w, h);
  const scale = longest > maxLongest ? maxLongest / longest : 1;
  return {
    width: Math.max(50, Math.round(w * scale)) || DEFAULT_PAGE_W,
    height: Math.max(50, Math.round(h * scale)) || DEFAULT_PAGE_H,
  };
}

/** Image (JPG/PNG/WEBP/GIF/SVG) → single-page project of the image's
 *  natural dimensions, with the image filling the whole page. */
export async function imageFileToProject(file: File): Promise<ProjectData> {
  const { src, width: nw, height: nh } = await imageFileToBlobUrl(file);
  // imageFileToBlobUrl already clamps to maxDim=4000 — keep the page
  // size identical to the resulting blob's dimensions.
  const width = nw || DEFAULT_PAGE_W;
  const height = nh || DEFAULT_PAGE_H;
  const title = file.name.replace(/\.[^.]+$/, "") || "Imported image";
  return freshProject({
    title,
    pages: [
      {
        ...freshPage(width, height),
        elements: [fullPageImageElement(src, width, height)],
      },
    ],
  });
}

// ───────────────── PDF importer (lazy-loaded pdfjs-dist) ───────────────

let pdfjsCache: any | null = null;
async function getPdfjs() {
  if (pdfjsCache) return pdfjsCache;
  const pdfjs: any = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  pdfjsCache = pdfjs;
  return pdfjs;
}

/** Render every PDF page to a JPEG data-URL at ~110 DPI, then build a
 *  multi-page Prime-Studio project — one design page per PDF page. */
export async function pdfFileToProject(file: File): Promise<ProjectData> {
  const pdfjs = await getPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs
    .getDocument({ data: buf.slice(0), isEvalSupported: false })
    .promise;
  const pages: PageData[] = [];
  const scale = 110 / 72;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      const v = pg.getViewport({ scale });
      const cv = document.createElement("canvas");
      cv.width = Math.round(v.width);
      cv.height = Math.round(v.height);
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, cv.width, cv.height);
      await pg.render({ canvasContext: ctx, viewport: v }).promise;
      const blob: Blob = await new Promise((res, rej) => {
        cv.toBlob(
          (b) => (b ? res(b) : rej(new Error("pdf page toBlob failed"))),
          "image/jpeg",
          0.85,
        );
      });
      // Blob URL (NOT a data URL) — same mobile-OOM rationale as
      // UploadsPanel.pdfToImageAssets. Multi-page PDFs as base64
      // strings inside the in-memory project + zustand history would
      // explode mobile JS heaps.
      const blobUrl = URL.createObjectURL(blob);
      const { width, height } = clampPageDims(cv.width, cv.height);
      pages.push({
        id: uid("pg"),
        name: `Page ${i}`,
        width,
        height,
        background: "#ffffff",
        backgroundImage: null,
        elements: [fullPageImageElement(blobUrl, width, height)],
      });
      cv.width = 0;
      cv.height = 0;
      pg.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return freshProject({
    title: file.name.replace(/\.pdf$/i, "") || "Imported PDF",
    pages,
  });
}

// ───────────────── DOCX / XLSX → HTML → image-page helpers ─────────────

/**
 * Render a chunk of HTML to a JPEG **blob URL** using html2canvas. The
 * temp container is sized to A4-ish width so long documents grow
 * downward (matching how Word renders by default). Blob URL — not data
 * URL — for the same mobile-OOM reason the rest of this module
 * documents.
 */
async function htmlToImageBlobUrl(
  html: string,
  opts: { width?: number; backgroundColor?: string } = {},
): Promise<{ src: string; width: number; height: number }> {
  const html2canvas = (await import("html2canvas")).default;
  const wrap = document.createElement("div");
  // Off-screen positioning so the user never sees this flash on screen.
  Object.assign(wrap.style, {
    position: "fixed",
    left: "-99999px",
    top: "0",
    width: `${opts.width ?? 1240}px`,
    padding: "48px 56px",
    background: opts.backgroundColor ?? "#ffffff",
    color: "#111",
    font: "16px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    boxSizing: "border-box",
  } as Partial<CSSStyleDeclaration>);
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  try {
    const cv = await html2canvas(wrap, {
      scale: 1.5,
      backgroundColor: opts.backgroundColor ?? "#ffffff",
      logging: false,
      useCORS: true,
    });
    const blob: Blob = await new Promise((res, rej) =>
      cv.toBlob(
        (b) => (b ? res(b) : rej(new Error("html2canvas toBlob failed"))),
        "image/jpeg",
        0.88,
      ),
    );
    return {
      src: URL.createObjectURL(blob),
      width: cv.width,
      height: cv.height,
    };
  } finally {
    wrap.remove();
  }
}

/** Word (.docx) → single-page project. Document is converted to HTML
 *  via `mammoth`, then rasterised at A4 width with auto height. */
export async function docxFileToProject(file: File): Promise<ProjectData> {
  const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
  const buf = await file.arrayBuffer();
  const { value: html } = await (mammoth as any).convertToHtml({
    arrayBuffer: buf,
  });
  // Strip empty trailing paragraphs that mammoth tends to emit.
  const cleanHtml = `<div style="word-wrap:break-word">${html}</div>`;
  const { src, width: rw, height: rh } = await htmlToImageBlobUrl(cleanHtml, {
    width: 1240,
  });
  const { width, height } = clampPageDims(rw, rh, 6000);
  return freshProject({
    title: file.name.replace(/\.docx$/i, "") || "Imported Word",
    pages: [
      {
        ...freshPage(width, height),
        elements: [fullPageImageElement(src, width, height)],
      },
    ],
  });
}

/** Excel / Sheets (.xlsx / .xls / .csv) → multi-page project, one
 *  design page per spreadsheet sheet. Each sheet is rendered as an
 *  HTML table at A4 width and rasterised. */
export async function xlsxFileToProject(file: File): Promise<ProjectData> {
  const XLSX: any = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const pages: PageData[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    // sheet_to_html builds a full <table> with inline styles preserved
    // for borders/fonts where possible.
    const tableHtml: string = XLSX.utils.sheet_to_html(sheet, {
      header: `<h2 style="margin:0 0 12px;font-size:20px;font-weight:700">${sheetName}</h2>`,
    });
    const styled = `
      <style>
        table { border-collapse: collapse; width: 100%; font-size: 13px; }
        th, td { border: 1px solid #d4d4d8; padding: 6px 8px; text-align: left; }
        th { background: #f4f4f5; font-weight: 600; }
        h2 { color: #4c1d95; }
      </style>
      ${tableHtml}
    `;
    const { src, width: rw, height: rh } = await htmlToImageBlobUrl(styled, {
      width: 1240,
    });
    const { width, height } = clampPageDims(rw, rh, 6000);
    pages.push({
      id: uid("pg"),
      name: sheetName,
      width,
      height,
      background: "#ffffff",
      backgroundImage: null,
      elements: [fullPageImageElement(src, width, height)],
    });
  }
  if (pages.length === 0) {
    pages.push({
      ...freshPage(DEFAULT_PAGE_W, DEFAULT_PAGE_H),
      name: "Empty",
    });
  }
  return freshProject({
    title: file.name.replace(/\.(xlsx|xls|csv)$/i, "") || "Imported sheet",
    pages,
  });
}

// ───────────────── File-type sniffer / dispatcher ──────────────────────

export type ImportableKind = "image" | "pdf" | "docx" | "xlsx" | "json" | "unknown";

export function detectImportKind(file: File): ImportableKind {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|svg|bmp)$/i.test(name)) {
    return "image";
  }
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    name.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".csv") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel" ||
    file.type === "text/csv"
  ) {
    return "xlsx";
  }
  if (name.endsWith(".json") || file.type === "application/json") return "json";
  return "unknown";
}
