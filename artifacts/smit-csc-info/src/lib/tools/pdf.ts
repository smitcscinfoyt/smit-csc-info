import jsPDF from "jspdf";
import { PDFDocument } from "pdf-lib";
import { loadImage } from "./canvas";

const A4_W_MM = 210;
const A4_H_MM = 297;

/** Convert one or more image files (JPG/PNG) into a single A4 PDF. */
export async function imagesToPdf(
  files: File[],
  opts: { fit?: "contain" | "cover"; orientation?: "portrait" | "landscape" } = {},
): Promise<Blob> {
  const orientation = opts.orientation ?? "portrait";
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageW = orientation === "portrait" ? A4_W_MM : A4_H_MM;
  const pageH = orientation === "portrait" ? A4_H_MM : A4_W_MM;
  const margin = 10;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;

  for (let i = 0; i < files.length; i++) {
    if (i > 0) pdf.addPage();
    const dataUrl = await fileToDataURL(files[i]);
    const img = await loadImage(files[i]);
    const ratio = Math.min(usableW / (img.width / 4), usableH / (img.height / 4));
    const drawW = (img.width / 4) * ratio;
    const drawH = (img.height / 4) * ratio;
    const dx = (pageW - drawW) / 2;
    const dy = (pageH - drawH) / 2;
    const fmt = files[i].type.includes("png") ? "PNG" : "JPEG";
    pdf.addImage(dataUrl, fmt, dx, dy, drawW, drawH);
  }
  return pdf.output("blob");
}

/** Merge two images stacked vertically (front/back of an Aadhaar) into one A4 PDF. */
export async function aadhaarMergePdf(front: File, back: File): Promise<Blob> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 15;
  const usableW = A4_W_MM - margin * 2;
  const halfH = (A4_H_MM - margin * 3) / 2;

  const placeImage = async (file: File, yOffset: number) => {
    const img = await loadImage(file);
    const ratio = Math.min(usableW / img.width, halfH / img.height);
    const drawW = img.width * ratio;
    const drawH = img.height * ratio;
    const dx = (A4_W_MM - drawW) / 2;
    const dataUrl = await fileToDataURL(file);
    const fmt = file.type.includes("png") ? "PNG" : "JPEG";
    pdf.addImage(dataUrl, fmt, dx, yOffset + (halfH - drawH) / 2, drawW, drawH);
  };

  await placeImage(front, margin);
  await placeImage(back, margin * 2 + halfH);
  return pdf.output("blob");
}

/** Merge two images side-by-side onto a single A4 JPG (Aadhaar JPG merge). */
export async function aadhaarMergeJpg(front: File, back: File): Promise<Blob> {
  const dpi = 200;
  const wPx = Math.round((A4_W_MM / 25.4) * dpi);
  const hPx = Math.round((A4_H_MM / 25.4) * dpi);
  const canvas = document.createElement("canvas");
  canvas.width = wPx;
  canvas.height = hPx;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, wPx, hPx);

  const margin = Math.round(wPx * 0.06);
  const usableW = wPx - margin * 2;
  const halfH = Math.round((hPx - margin * 3) / 2);

  const place = async (file: File, yOffset: number) => {
    const img = await loadImage(file);
    const ratio = Math.min(usableW / img.width, halfH / img.height);
    const dw = img.width * ratio;
    const dh = img.height * ratio;
    const dx = (wPx - dw) / 2;
    const dy = yOffset + (halfH - dh) / 2;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, dx, dy, dw, dh);
  };

  await place(front, margin);
  await place(back, margin * 2 + halfH);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas error"))),
      "image/jpeg",
      0.92,
    ),
  );
}

/** Merge multiple PDF files into one using pdf-lib. */
export async function mergePdfs(files: File[]): Promise<Blob> {
  const merged = await PDFDocument.create();
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  const out = await merged.save();
  return new Blob([out as unknown as ArrayBuffer], { type: "application/pdf" });
}

/**
 * Compress a PDF by rasterizing each page to JPEG at a chosen quality.
 * Uses pdf.js if loaded, otherwise re-saves via pdf-lib (basic optimization).
 */
export async function compressPdf(file: File, targetKB: number): Promise<Blob> {
  const targetBytes = targetKB * 1024;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let quality = 0.85;
  let scale = 1.5;
  let outBlob: Blob | null = null;

  for (let i = 0; i < 6; i++) {
    outBlob = await rasterizePdfToCompressed(bytes, quality, scale);
    if (outBlob.size <= targetBytes) break;
    quality = Math.max(0.32, quality - 0.12);
    scale = Math.max(0.6, scale - 0.2);
  }
  return outBlob!;
}

async function rasterizePdfToCompressed(
  bytes: Uint8Array,
  quality: number,
  scale: number,
): Promise<Blob> {
  const pdfjs: any = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const out = new jsPDF({ unit: "pt", format: "a4" });

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (p > 1) out.addPage();
    const pw = out.internal.pageSize.getWidth();
    const ph = out.internal.pageSize.getHeight();
    const ratio = Math.min(pw / canvas.width, ph / canvas.height);
    const dw = canvas.width * ratio;
    const dh = canvas.height * ratio;
    out.addImage(dataUrl, "JPEG", (pw - dw) / 2, (ph - dh) / 2, dw, dh);
  }
  return out.output("blob");
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("File read error"));
    reader.readAsDataURL(file);
  });
}
