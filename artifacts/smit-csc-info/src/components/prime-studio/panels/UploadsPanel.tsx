/**
 * Uploads panel — file picker for both images AND PDFs.
 *
 *  • Images (JPG/PNG/WEBP/GIF/SVG) → stored as data-URL ImageElement.
 *  • PDFs → each page rendered to a JPG via pdfjs-dist, stored as a
 *    separate UploadedAsset so the user can drop any individual page
 *    onto the canvas (Canva-style).
 *
 * The first uploaded asset is auto-inserted onto the active page.
 * Subsequent thumbnails sit in the recent-uploads grid for re-insert.
 */

import { useState } from "react";
import { Upload, Image as ImageIcon, X, FileText, Loader2 } from "lucide-react";
import { useStudio, useActivePage, type UploadedAsset } from "../store";
import type { ElementData, ImageElement } from "../types";

/** Lazy-load pdfjs-dist (mirrors `src/lib/tools/pdf-tools.ts`). */
let pdfjsCache: any | null = null;
async function getPdfjs() {
  if (pdfjsCache) return pdfjsCache;
  const pdfjs: any = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  pdfjsCache = pdfjs;
  return pdfjs;
}

/**
 * Downscale a raw image File and return a **Blob URL** (NOT a base64
 * data-URL).
 *
 * Why this matters: phone-camera photos are 8-15 MB. As a base64 string
 * inside React state + zustand history snapshots + autosave JSON, the
 * same image was being held 3-4× in the JS heap → mobile Firefox / Chrome
 * killed the tab on memory pressure → page reloaded → wouter restored a
 * different URL → user reported "Prime Studio exits".
 *
 * Blob URLs (`blob:https://…/abc-123`) are tiny string handles (~50
 * bytes) — the actual pixel data lives in a separate browser-managed
 * blob heap that isn't counted against the JS heap and isn't duplicated
 * by JSON.stringify or zustand cloning.
 *
 * Pipeline:
 *   File → createImageBitmap (decoder lives off-thread, no intermediate
 *   data-URL allocation) → OffscreenCanvas/Canvas downscale → toBlob →
 *   URL.createObjectURL.
 *
 * SVG / GIF passthrough as Blob URLs (preserve vector / animation).
 */
async function downscaleImageFile(file: File, maxDim = 1280, quality = 0.82): Promise<{
  src: string; width: number; height: number;
}> {
  // SVG / GIF: passthrough straight to a Blob URL (no decode, no
  // re-encode). These formats are tiny anyway and don't benefit from
  // canvas re-encoding (and re-encoding GIFs would lose animation).
  if (file.type === "image/svg+xml" || file.type === "image/gif") {
    const url = URL.createObjectURL(file);
    // Get natural dims via a one-shot HTMLImageElement.
    const dim = await new Promise<{ w: number; h: number }>((res) => {
      const im = new Image();
      im.onload = () => res({
        w: im.naturalWidth || 800,
        h: im.naturalHeight || 600,
      });
      im.onerror = () => res({ w: 800, h: 600 });
      im.src = url;
    });
    return { src: url, width: dim.w, height: dim.h };
  }
  // Decode the file. createImageBitmap is the most memory-efficient
  // path — no intermediate data-URL allocation, the decoder runs on a
  // dedicated thread, and the resulting bitmap can be released
  // explicitly with .close(). Falls back to <img> if unavailable
  // (very old browsers).
  let bitmap: ImageBitmap | null = null;
  let imgFallback: HTMLImageElement | null = null;
  let W: number, H: number;
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
  // Already-small files: skip the downscale dance, just return a Blob
  // URL of the original. Threshold is 600 KB — typical pre-shrunk
  // images / icons sit comfortably below this.
  if (W <= maxDim && H <= maxDim && file.size < 600 * 1024) {
    bitmap?.close();
    const url = URL.createObjectURL(file);
    return { src: url, width: W, height: H };
  }
  const scale = Math.min(1, maxDim / Math.max(W, H));
  const tw = Math.max(1, Math.round(W * scale));
  const th = Math.max(1, Math.round(H * scale));
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Last-ditch: passthrough.
    bitmap?.close();
    const url = URL.createObjectURL(file);
    return { src: url, width: W, height: H };
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
    bitmap.close(); // free GPU/native memory immediately
  } else if (imgFallback) {
    ctx.drawImage(imgFallback, 0, 0, tw, th);
    imgFallback.src = ""; // hint GC to release decode buffer
  }
  // Async toBlob has lower peak memory than synchronous toDataURL
  // (no full base64-string materialisation) — critical on mobile.
  const blob: Blob = await new Promise((res, rej) => {
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error("toBlob failed"))),
      isPng ? "image/png" : "image/jpeg",
      quality,
    );
  });
  // Help GC reclaim the canvas backing store.
  canvas.width = 0;
  canvas.height = 0;
  return { src: URL.createObjectURL(blob), width: tw, height: th };
}

/**
 * Render every page of a PDF File to a JPEG **Blob URL** (NOT a data
 * URL). Same mobile-memory rationale as `downscaleImageFile` — keeping
 * 5+ rendered PDF pages as base64 strings was a fast path to the tab
 * being killed. Blob URLs keep the JS heap tiny.
 *
 * Render scale lowered from 150 DPI → 110 DPI: still print-grade for
 * design canvas use, ~50% lighter on memory and decode time.
 */
async function pdfToImageAssets(file: File): Promise<UploadedAsset[]> {
  const pdfjs = await getPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf.slice(0), isEvalSupported: false }).promise;
  const out: UploadedAsset[] = [];
  const scale = 110 / 72;
  try {
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
      const blob: Blob = await new Promise((res, rej) => {
        canvas.toBlob(
          (b) => (b ? res(b) : rej(new Error("pdf page toBlob failed"))),
          "image/jpeg",
          0.85,
        );
      });
      out.push({
        id: crypto.randomUUID(),
        src: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
        label: `${file.name} • p${i}`,
      });
      // Aggressively release the page-render canvas backing store
      // before the next page is rendered.
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return out;
}

export function UploadsPanel() {
  // Uploads now live in the Zustand store so switching sidebar tabs
  // (e.g. Templates → Uploads → Templates → Uploads) does NOT wipe the
  // recent-uploads grid the way local component state did.
  const assets = useStudio((s) => s.uploads);
  const addUpload = useStudio((s) => s.addUpload);
  const addUploads = useStudio((s) => s.addUploads);
  const removeUpload = useStudio((s) => s.removeUpload);
  const [busy, setBusy] = useState<string | null>(null);
  const addElement = useStudio((s) => s.addElement);
  const page = useActivePage();

  const insertAssetOnCanvas = (a: UploadedAsset) => {
    const pageW = page?.width ?? 1280;
    const pageH = page?.height ?? 720;
    const cx = pageW / 2;
    const cy = pageH / 2;
    // Fit the image inside ~40% of the page in BOTH dimensions so a tall
    // portrait photo doesn't overflow vertically. Preserves aspect ratio.
    const maxW = pageW * 0.4;
    const maxH = pageH * 0.4;
    const scale = Math.min(maxW / a.width, maxH / a.height, 1);
    const w = a.width * scale;
    const h = a.height * scale;
    const el: Omit<ImageElement, "id"> = {
      type: "image",
      x: cx - w / 2,
      y: cy - h / 2,
      width: w,
      height: h,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      src: a.src,
    };
    addElement(el as Omit<ElementData, "id">);
  };

  const onPick = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      const isImg = /^image\//.test(f.type);
      const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      if (!isImg && !isPdf) continue;

      try {
        if (isPdf) {
          setBusy(`Rendering ${f.name}…`);
          const pages = await pdfToImageAssets(f);
          if (pages.length === 0) continue;
          addUploads(pages);
          // Auto-insert the first page so the upload feels immediate.
          insertAssetOnCanvas(pages[0]);
        } else {
          setBusy(`Loading ${f.name}…`);
          // Always go through the downscaler — it's a no-op for already
          // small assets and a huge memory win for phone-camera photos.
          const { src, width, height } = await downscaleImageFile(f);
          const asset: UploadedAsset = {
            id: crypto.randomUUID(),
            src,
            width,
            height,
            label: f.name,
          };
          addUpload(asset);
          insertAssetOnCanvas(asset);
        }
      } catch (e) {
        console.error("Upload failed", f.name, e);
        alert(`Upload failed: ${(e as Error).message}`);
      } finally {
        setBusy(null);
      }
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-base font-bold text-purple-950">Uploads</h3>

      <label className="block w-full cursor-pointer">
        <input
          type="file"
          accept="image/*,application/pdf,.pdf"
          multiple
          onChange={(e) => onPick(e.target.files)}
          className="hidden"
          data-testid="uploads-file-input"
          disabled={!!busy}
        />
        <div
          className={`flex items-center justify-center gap-2 py-3 rounded-lg bg-gradient-to-r from-purple-700 to-indigo-700 text-white font-semibold shadow ${
            busy ? "opacity-70 cursor-wait" : "hover:from-purple-800 hover:to-indigo-800"
          }`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {busy ?? "Upload image or PDF"}
        </div>
      </label>

      <p className="text-xs text-purple-700 leading-relaxed">
        JPG / PNG / WEBP / SVG / <b>PDF</b> supported. Each page of a PDF
        appears as a separate thumbnail — drag it onto the canvas to apply
        filters, BG-remove, crop and flip.
      </p>

      {assets.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {assets.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => insertAssetOnCanvas(a)}
              className="relative group aspect-square rounded-md overflow-hidden border border-purple-200 hover:border-purple-500 hover:shadow bg-white"
              title={a.label ?? "Click to insert"}
            >
              <img src={a.src} alt="" className="w-full h-full object-contain" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
              {a.label?.includes(".pdf") && (
                <div className="absolute top-1 left-1 bg-rose-600 text-white text-[8px] font-bold px-1 rounded shadow">
                  PDF
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeUpload(a.id);
                }}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-black/60 hover:bg-rose-600 rounded-full p-0.5"
                title="Remove from uploads"
              >
                <X className="h-3 w-3 text-white" />
              </button>
            </button>
          ))}
        </div>
      )}

      {assets.length === 0 && !busy && (
        <div className="text-center py-8 border-2 border-dashed border-purple-200 rounded-lg text-purple-400">
          <div className="flex justify-center gap-2 mb-2">
            <ImageIcon className="h-9 w-9" />
            <FileText className="h-9 w-9" />
          </div>
          <p className="text-xs">Uploaded images & PDF pages appear here</p>
        </div>
      )}
    </div>
  );
}
