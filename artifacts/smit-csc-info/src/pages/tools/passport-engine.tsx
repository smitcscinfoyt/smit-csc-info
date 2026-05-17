import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crop as CropIcon,
  Download,
  Loader2,
  Printer,
  Upload,
  Trash2,
  Wand2,
  UserPlus,
  X,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import jsPDF from "jspdf";
import Cropper, { type Area } from "react-easy-crop";
import { removeBackground } from "@imgly/background-removal";
import { PrimeToolShell, GoldButton, GoldLoader } from "@/components/tools/prime-tool-shell";
import { getTool } from "@/components/tools/tools-data";
import { loadImage, canvasToBlob, MM_TO_PX_300 } from "@/lib/tools/canvas";
import { downloadBlob } from "@/lib/tools/file";
import { usePrimeDownloadGate } from "@/hooks/use-prime-download-gate";
import { useAutoResumeDownload } from "@/hooks/use-auto-resume-download";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type PageSize = "A4" | "4x6" | "5x7";
type Copies = number;
type BgChoice = "none" | "white" | "blue";

const PRESET_COPIES = [1, 2, 4, 6, 12, 32] as const;
const MAX_COPIES = 200;

const PHOTO_W_MM = 35;
const PHOTO_H_MM = 45;

const PAGE_DIMS_MM: Record<PageSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  "4x6": { w: 102, h: 152 },
  "5x7": { w: 127, h: 178 },
};

// One photo entry on the sheet — typically one PERSON. Multiple entries
// can sit on the same page (e.g. husband on row 1, wife on row 2).
interface PhotoEntry {
  id: string;
  originalImageUrl: string; // for re-crop
  photoCanvas: HTMLCanvasElement; // 300-DPI cropped passport-size canvas
  finalUrl: string; // cached preview JPEG URL (with bg applied)
  copies: number;
  bg: BgChoice;
  bgRemoved: HTMLCanvasElement | null;
  bgRemoving: boolean;
}

interface LayoutCell {
  xMm: number;
  yMm: number;
  entryIndex: number;
}

interface LayoutResult {
  cells: LayoutCell[];
  cols: number;
  rotate: boolean;
  cellW: number;
  cellH: number;
}

// Multi-entry top-left layout. Each entry's photos fill the current row(s);
// when an entry finishes mid-row, the NEXT entry starts on a fresh row so
// different people are visually separated and easy to cut. We try both
// portrait and rotated orientations and pick the one that fits the most
// total photos.
function multiEntryLayout(
  pageW: number,
  pageH: number,
  entries: { copies: number }[],
): LayoutResult | null {
  if (entries.length === 0) return null;
  const gap = 2; // mm between photos
  const margin = 5; // mm fixed top + left page margin

  const orientations = [
    { w: PHOTO_W_MM, h: PHOTO_H_MM, rotate: false },
    { w: PHOTO_H_MM, h: PHOTO_W_MM, rotate: true },
  ];

  let best: LayoutResult | null = null;

  for (const o of orientations) {
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;
    const cols = Math.max(1, Math.floor((usableW + gap) / (o.w + gap)));
    const rowsCapacity = Math.max(1, Math.floor((usableH + gap) / (o.h + gap)));

    const cells: LayoutCell[] = [];
    let row = 0;
    let col = 0;

    // Pack continuously — entries flow one after another with no blank
    // gaps. When Person 1 ends mid-row, Person 2 begins right after them
    // in the same row so the page is fully utilised.
    for (let entryIdx = 0; entryIdx < entries.length; entryIdx++) {
      const need = Math.max(0, Math.floor(entries[entryIdx].copies));
      let placed = 0;
      while (placed < need && row < rowsCapacity) {
        cells.push({
          xMm: margin + col * (o.w + gap),
          yMm: margin + row * (o.h + gap),
          entryIndex: entryIdx,
        });
        placed++;
        col++;
        if (col >= cols) {
          col = 0;
          row++;
        }
      }
      if (row >= rowsCapacity) break;
    }

    if (!best || cells.length > best.cells.length) {
      best = { cells, cols, rotate: o.rotate, cellW: o.w, cellH: o.h };
    }
  }
  return best;
}

function applyBg(canvas: HTMLCanvasElement, bg: BgChoice): HTMLCanvasElement {
  if (bg === "none") return canvas;
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = bg === "white" ? "#ffffff" : "#3a86ff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

function entryFinalCanvas(e: PhotoEntry): HTMLCanvasElement {
  return applyBg(e.bgRemoved ?? e.photoCanvas, e.bg);
}

export default function PassportEnginePage() {
  const tool = getTool("passport-engine")!;
  const { requirePrime, modal: primeGateModal } = usePrimeDownloadGate({
    toolId: "passport-engine",
    toolTitle: tool.title,
    actionLabel: "Download",
  });
  const [entries, setEntries] = useState<PhotoEntry[]>([]);
  // Which entry's settings are shown in the shared controls panel.
  // Null when no photos at all.
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>("A4");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Crop dialog state. cropTargetId = null → creating a brand new entry from
  // pendingImageUrl; otherwise it's the id of an existing entry being re-cropped.
  const [cropOpen, setCropOpen] = useState(false);
  const [cropTargetId, setCropTargetId] = useState<string | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropApplying, setCropApplying] = useState(false);

  // Per-entry custom-copies UI state. Keyed by entry id so each card has
  // independent typing without leaking between entries.
  const [customMode, setCustomMode] = useState<Record<string, boolean>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  const cropSourceUrl = useMemo(() => {
    if (cropTargetId === null) return pendingImageUrl;
    return entries.find((e) => e.id === cropTargetId)?.originalImageUrl ?? null;
  }, [cropTargetId, pendingImageUrl, entries]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  function openNewCrop(f: File | null) {
    if (!f) return;
    if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl);
    const url = URL.createObjectURL(f);
    setPendingImageUrl(url);
    setCropTargetId(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedAreaPixels(null);
    setCropOpen(true);
  }

  function reopenCropFor(entryId: string) {
    setCropTargetId(entryId);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedAreaPixels(null);
    setCropOpen(true);
  }

  function rotateBy(delta: number) {
    setRotation((r) => {
      const next = (r + delta) % 360;
      return next < 0 ? next + 360 : next;
    });
  }

  function cancelCrop() {
    setCropOpen(false);
    if (cropTargetId === null && pendingImageUrl) {
      URL.revokeObjectURL(pendingImageUrl);
      setPendingImageUrl(null);
    }
    setCropTargetId(null);
  }

  async function applyCrop() {
    if (!cropSourceUrl || !croppedAreaPixels || cropApplying) return;
    setCropApplying(true);
    try {
      const img = await loadImage(cropSourceUrl);
      const targetW = MM_TO_PX_300(PHOTO_W_MM);
      const targetH = MM_TO_PX_300(PHOTO_H_MM);

      // react-easy-crop returns croppedAreaPixels in the rotated bounding-box
      // coordinate space. So when rotation != 0 we must first draw the rotated
      // image onto an intermediate canvas (sized to the rotated bounding box),
      // and then crop from that.
      let sourceCanvas: HTMLCanvasElement | HTMLImageElement = img;
      if (rotation !== 0) {
        const rotRad = (rotation * Math.PI) / 180;
        const sin = Math.abs(Math.sin(rotRad));
        const cos = Math.abs(Math.cos(rotRad));
        const bBoxW = Math.round(cos * img.width + sin * img.height);
        const bBoxH = Math.round(sin * img.width + cos * img.height);
        const rc = document.createElement("canvas");
        rc.width = bBoxW;
        rc.height = bBoxH;
        const rctx = rc.getContext("2d")!;
        rctx.fillStyle = "#ffffff";
        rctx.fillRect(0, 0, bBoxW, bBoxH);
        rctx.imageSmoothingEnabled = true;
        rctx.imageSmoothingQuality = "high";
        rctx.translate(bBoxW / 2, bBoxH / 2);
        rctx.rotate(rotRad);
        rctx.drawImage(img, -img.width / 2, -img.height / 2);
        sourceCanvas = rc;
      }

      const c = document.createElement("canvas");
      c.width = targetW;
      c.height = targetH;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        sourceCanvas,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        targetW,
        targetH,
      );
      const blob = await canvasToBlob(c, "image/jpeg", 0.95);
      const finalUrl = URL.createObjectURL(blob);

      if (cropTargetId === null) {
        // Create a new entry from the pending image.
        // First entry defaults to 12 copies (typical sheet); subsequent
        // entries default to 5 (a common per-person request).
        const newEntry: PhotoEntry = {
          id: typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          originalImageUrl: pendingImageUrl!,
          photoCanvas: c,
          finalUrl,
          copies: entries.length === 0 ? 12 : 5,
          bg: "none",
          bgRemoved: null,
          bgRemoving: false,
        };
        setEntries((prev) => [...prev, newEntry]);
        // Newly added photo becomes the focused one in the shared panel.
        setActiveEntryId(newEntry.id);
        // Ownership of pendingImageUrl now belongs to the entry; clear pointer
        // so we don't accidentally revoke it.
        setPendingImageUrl(null);
      } else {
        // Update existing entry's crop. Re-crop invalidates any background
        // removal because that was computed from the old crop.
        setEntries((prev) =>
          prev.map((e) => {
            if (e.id !== cropTargetId) return e;
            if (e.finalUrl) URL.revokeObjectURL(e.finalUrl);
            return { ...e, photoCanvas: c, finalUrl, bgRemoved: null };
          }),
        );
      }
      setCropOpen(false);
      setCropTargetId(null);
    } catch (err) {
      console.error("Crop apply failed", err);
    } finally {
      setCropApplying(false);
    }
  }

  function updateEntry(id: string, patch: Partial<PhotoEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function deleteEntry(id: string) {
    setEntries((prev) => {
      const target = prev.find((e) => e.id === id);
      if (target) {
        URL.revokeObjectURL(target.originalImageUrl);
        URL.revokeObjectURL(target.finalUrl);
      }
      const remaining = prev.filter((e) => e.id !== id);
      // If the deleted entry was the active one, focus the next available
      // photo so the shared panel always shows a valid selection.
      if (activeEntryId === id) {
        const removedIdx = prev.findIndex((e) => e.id === id);
        const nextActive =
          remaining[removedIdx] ?? remaining[removedIdx - 1] ?? remaining[0] ?? null;
        setActiveEntryId(nextActive ? nextActive.id : null);
      }
      return remaining;
    });
    setCustomMode((m) => {
      const { [id]: _drop, ...rest } = m;
      return rest;
    });
    setCustomInputs((m) => {
      const { [id]: _drop, ...rest } = m;
      return rest;
    });
  }

  async function handleRemoveBg(entryId: string) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry || entry.bgRemoving) return;
    updateEntry(entryId, { bgRemoving: true });
    try {
      const blob = await canvasToBlob(entry.photoCanvas, "image/png");
      const out = await removeBackground(blob);
      const img = await loadImage(out);
      const c = document.createElement("canvas");
      c.width = entry.photoCanvas.width;
      c.height = entry.photoCanvas.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      // Refresh finalUrl so the new bg-removed pixels show up in preview/PDF.
      // Note we read latest entry from setEntries' prev snapshot to avoid
      // stale closures if user fired the action twice quickly.
      setEntries((prev) =>
        prev.map((e) => {
          if (e.id !== entryId) return e;
          if (e.finalUrl) URL.revokeObjectURL(e.finalUrl);
          const merged: PhotoEntry = {
            ...e,
            bgRemoved: c,
            bg: e.bg === "none" ? "white" : e.bg,
            bgRemoving: false,
            finalUrl: "", // placeholder; real URL set below
          };
          const finalCanvas = entryFinalCanvas(merged);
          finalCanvas.toBlob((blob2) => {
            if (!blob2) return;
            const url = URL.createObjectURL(blob2);
            updateEntry(entryId, { finalUrl: url });
          }, "image/jpeg", 0.95);
          return merged;
        }),
      );
    } catch (err) {
      console.error(err);
      updateEntry(entryId, { bgRemoving: false });
    }
  }

  function setEntryBg(entryId: string, bg: BgChoice) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    if (entry.finalUrl) URL.revokeObjectURL(entry.finalUrl);
    const merged: PhotoEntry = { ...entry, bg, finalUrl: "" };
    const finalCanvas = entryFinalCanvas(merged);
    finalCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        updateEntry(entryId, { bg, finalUrl: url });
      },
      "image/jpeg",
      0.95,
    );
  }

  const layout = useMemo(() => {
    const { w, h } = PAGE_DIMS_MM[pageSize];
    return multiEntryLayout(w, h, entries);
  }, [pageSize, entries]);

  const totalCopies = useMemo(
    () => entries.reduce((s, e) => s + e.copies, 0),
    [entries],
  );

  async function handleGeneratePdf() {
    return new Promise<void>((resolve) => {
      requirePrime(async () => {
        await runGeneratePdf();
        resolve();
      });
    });
  }

  // Auto-resume the PDF download once a freshly-upgraded user lands
  // back on the page (intent stashed by use-prime-download-gate).
  useAutoResumeDownload({
    toolId: "passport-engine",
    ready: entries.length > 0 && !!layout && layout.cells.length > 0,
    run: () => { void runGeneratePdf(); },
  });

  async function runGeneratePdf() {
    if (entries.length === 0 || !layout || layout.cells.length === 0) return;
    setPdfBusy(true);
    setPdfProgress(5);

    const page = PAGE_DIMS_MM[pageSize];
    const orientation = page.w > page.h ? "landscape" : "portrait";
    const pdf = new jsPDF({
      orientation,
      unit: "mm",
      format: pageSize === "A4" ? "a4" : [page.w, page.h],
      compress: true,
    });

    // Pre-build a JPEG data URL per entry (rotated up-front if the layout
    // chose rotated orientation), so the inner cell loop is just addImage.
    const entryImgData: string[] = [];
    for (const e of entries) {
      const finalCanvas = entryFinalCanvas(e);
      let imgData: string;
      if (layout.rotate) {
        const r = document.createElement("canvas");
        r.width = finalCanvas.height;
        r.height = finalCanvas.width;
        const ctx = r.getContext("2d")!;
        ctx.translate(r.width / 2, r.height / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(finalCanvas, -finalCanvas.width / 2, -finalCanvas.height / 2);
        imgData = r.toDataURL("image/jpeg", 0.95);
      } else {
        imgData = finalCanvas.toDataURL("image/jpeg", 0.95);
      }
      entryImgData.push(imgData);
    }

    setPdfProgress(35);
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.0847); // 1 px @ 300 DPI

    const total = layout.cells.length;
    for (let i = 0; i < total; i++) {
      const cell = layout.cells[i];
      const data = entryImgData[cell.entryIndex];
      pdf.addImage(data, "JPEG", cell.xMm, cell.yMm, layout.cellW, layout.cellH, undefined, "FAST");
      pdf.rect(cell.xMm, cell.yMm, layout.cellW, layout.cellH, "S");
      setPdfProgress(35 + Math.round(((i + 1) / total) * 60));
      if (i % 6 === 5) await new Promise((r) => setTimeout(r, 0));
    }

    setPdfProgress(98);
    const blob = pdf.output("blob");
    const peopleSuffix = entries.length > 1 ? `-${entries.length}people` : "";
    downloadBlob(blob, `passport-sheet-${pageSize}-${totalCopies}copies${peopleSuffix}.pdf`);
    setPdfProgress(100);
    setTimeout(() => {
      setPdfBusy(false);
      setPdfProgress(0);
    }, 600);
  }

  function clearAll() {
    entries.forEach((e) => {
      URL.revokeObjectURL(e.originalImageUrl);
      URL.revokeObjectURL(e.finalUrl);
    });
    if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl);
    setEntries([]);
    setPendingImageUrl(null);
    setCropTargetId(null);
    setCropOpen(false);
    setCustomMode({});
    setCustomInputs({});
  }

  // Cleanup all blob URLs on unmount.
  useEffect(() => {
    return () => {
      entries.forEach((e) => {
        URL.revokeObjectURL(e.originalImageUrl);
        URL.revokeObjectURL(e.finalUrl);
      });
      if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Visual preview scale: shrink the page into the available width.
  const previewScale = (() => {
    const { w } = PAGE_DIMS_MM[pageSize];
    const targetWidthPx = 380;
    return targetWidthPx / w;
  })();

  return (
    <PrimeToolShell tool={tool}>
      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <div>
          {entries.length === 0 ? (
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                openNewCrop(e.dataTransfer.files?.[0] ?? null);
              }}
              className="cursor-pointer rounded-2xl border-2 border-dashed border-amber-300/40 bg-white/5 hover:bg-white/10 hover:border-amber-300/70 transition-all p-12 text-center"
              data-testid="passport-drop"
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  openNewCrop(e.target.files?.[0] ?? null);
                  // Reset so selecting the SAME file again still fires onChange.
                  e.target.value = "";
                }}
              />
              <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-300 to-yellow-500 flex items-center justify-center shadow-lg mb-4">
                <Upload className="h-8 w-8 text-purple-950" />
              </div>
              <div className="font-bold text-amber-100 text-lg">Upload your photo</div>
              <div className="text-sm text-purple-100/70 mt-1">
                Auto-cropped to 3.5 × 4.5 cm passport size — add more people later.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Hidden input shared by "+ Add another photo" button */}
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  openNewCrop(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />

              {/* Unified panel: thumbnail strip + shared controls for the
                  selected photo. All photos live in this single panel — tap a
                  thumbnail to switch which one the controls below operate on. */}
              {(() => {
                const activeEntry =
                  entries.find((e) => e.id === activeEntryId) ?? entries[0] ?? null;
                if (!activeEntry) return null;
                const activeIdx = entries.findIndex((e) => e.id === activeEntry.id);
                const cellsForActive =
                  layout?.cells.filter((c) => c.entryIndex === activeIdx).length ?? 0;
                const inCustom = !!customMode[activeEntry.id];
                const isPresetCount = (PRESET_COPIES as readonly number[]).includes(
                  activeEntry.copies,
                );
                return (
                  <div
                    className="rounded-2xl border border-amber-300/30 bg-gradient-to-br from-purple-900/40 to-indigo-950/40 backdrop-blur-xl p-3 sm:p-4"
                    data-testid="entries-panel"
                  >
                    {/* Thumbnail strip — horizontally scrollable on small screens */}
                    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                      {entries.map((e, idx) => {
                        const isActive = e.id === activeEntry.id;
                        return (
                          <button
                            key={e.id}
                            onClick={() => setActiveEntryId(e.id)}
                            className={`relative shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                              isActive
                                ? "border-amber-300 ring-2 ring-amber-300/40 shadow-lg"
                                : "border-amber-300/30 hover:border-amber-300/60 opacity-80 hover:opacity-100"
                            }`}
                            style={{ width: 64, height: 82 }}
                            data-testid={`thumb-${idx}`}
                            aria-label={`Select Person ${idx + 1}`}
                          >
                            {e.finalUrl && (
                              <img
                                src={e.finalUrl}
                                alt=""
                                className="w-full h-full object-cover bg-white"
                              />
                            )}
                            <div className="absolute top-0.5 left-0.5 px-1 rounded bg-black/65 text-amber-200 text-[9px] font-bold leading-none py-0.5">
                              P{idx + 1}
                            </div>
                            <div className="absolute bottom-0.5 right-0.5 px-1 rounded bg-amber-300/95 text-purple-950 text-[9px] font-bold leading-none py-0.5">
                              ×{e.copies}
                            </div>
                          </button>
                        );
                      })}
                      {/* Add tile — same flow as first upload */}
                      <button
                        onClick={() => inputRef.current?.click()}
                        className="shrink-0 rounded-lg border-2 border-dashed border-amber-300/40 hover:border-amber-300/70 hover:bg-amber-400/10 flex flex-col items-center justify-center text-amber-200 transition-all"
                        style={{ width: 64, height: 82 }}
                        data-testid="btn-add-photo"
                        aria-label="Add another photo"
                      >
                        <UserPlus className="h-4 w-4" />
                        <div className="text-[9px] font-bold mt-0.5">Add</div>
                      </button>
                    </div>

                    {/* Active photo header */}
                    <div className="flex items-center gap-2 mt-3 mb-3">
                      <span className="inline-flex items-center justify-center h-6 px-2 rounded-md bg-amber-300/20 text-amber-200 text-[11px] font-bold">
                        Person {activeIdx + 1}
                      </span>
                      <div className="text-[11px] text-purple-100/60 truncate">
                        {activeEntry.copies} requested · {cellsForActive} on sheet
                      </div>
                      <button
                        onClick={() => reopenCropFor(activeEntry.id)}
                        className="ml-auto inline-flex items-center gap-1 rounded-md bg-amber-400/15 hover:bg-amber-400/25 border border-amber-300/40 px-2 py-1 text-[11px] font-bold text-amber-100"
                        data-testid="btn-recrop-active"
                      >
                        <CropIcon className="h-3 w-3" /> Re-crop
                      </button>
                      <button
                        onClick={() => deleteEntry(activeEntry.id)}
                        className="inline-flex items-center gap-1 text-[11px] text-rose-300 hover:text-rose-200 px-2 py-1 rounded-md hover:bg-rose-500/10"
                        data-testid="btn-delete-active"
                        aria-label="Remove this photo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Shared controls — apply to ACTIVE entry only */}
                    <div className="space-y-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-amber-200/80 font-bold mb-1.5">
                          Copies
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {PRESET_COPIES.map((c) => (
                            <button
                              key={c}
                              onClick={() => {
                                updateEntry(activeEntry.id, { copies: c });
                                setCustomMode((m) => ({ ...m, [activeEntry.id]: false }));
                              }}
                              className={`rounded-lg py-1.5 font-bold text-xs transition-all ${
                                activeEntry.copies === c && !inCustom
                                  ? "bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 shadow"
                                  : "bg-white/5 text-amber-100 hover:bg-white/10 border border-amber-300/20"
                              }`}
                              data-testid={`btn-copies-${c}`}
                            >
                              {c === 32 ? "32 (Full)" : c}
                            </button>
                          ))}
                        </div>
                        <div className="mt-1.5">
                          {!inCustom && !isPresetCount && (
                            <button
                              onClick={() =>
                                setCustomMode((m) => ({ ...m, [activeEntry.id]: true }))
                              }
                              className="w-full rounded-lg py-1.5 font-bold text-xs bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 shadow"
                              data-testid="btn-custom-active"
                            >
                              Custom: {activeEntry.copies}
                            </button>
                          )}
                          {!inCustom && isPresetCount && (
                            <button
                              onClick={() => {
                                setCustomMode((m) => ({ ...m, [activeEntry.id]: true }));
                                setCustomInputs((m) => ({
                                  ...m,
                                  [activeEntry.id]: String(activeEntry.copies),
                                }));
                              }}
                              className="w-full rounded-lg py-1.5 font-bold text-xs bg-white/5 text-amber-100 hover:bg-white/10 border border-amber-300/20 transition-all"
                              data-testid="btn-custom"
                            >
                              + Custom number
                            </button>
                          )}
                          {inCustom && (
                            <div className="flex gap-1.5">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={MAX_COPIES}
                                autoFocus
                                placeholder="e.g. 18"
                                value={customInputs[activeEntry.id] ?? ""}
                                onChange={(e) =>
                                  setCustomInputs((m) => ({
                                    ...m,
                                    [activeEntry.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const n = parseInt(customInputs[activeEntry.id] ?? "", 10);
                                    if (Number.isFinite(n) && n >= 1) {
                                      updateEntry(activeEntry.id, {
                                        copies: Math.min(MAX_COPIES, Math.max(1, n)),
                                      });
                                      setCustomMode((m) => ({ ...m, [activeEntry.id]: false }));
                                    }
                                  } else if (e.key === "Escape") {
                                    setCustomMode((m) => ({ ...m, [activeEntry.id]: false }));
                                  }
                                }}
                                className="flex-1 min-w-0 rounded-lg bg-white/10 border border-amber-300/40 text-amber-100 placeholder-amber-200/40 px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-400"
                                data-testid="input-custom"
                              />
                              <button
                                onClick={() => {
                                  const n = parseInt(customInputs[activeEntry.id] ?? "", 10);
                                  if (Number.isFinite(n) && n >= 1) {
                                    updateEntry(activeEntry.id, {
                                      copies: Math.min(MAX_COPIES, Math.max(1, n)),
                                    });
                                    setCustomMode((m) => ({ ...m, [activeEntry.id]: false }));
                                  }
                                }}
                                disabled={
                                  !customInputs[activeEntry.id] ||
                                  parseInt(customInputs[activeEntry.id] ?? "", 10) < 1
                                }
                                className="rounded-lg px-2.5 py-1.5 text-xs font-bold bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 shadow disabled:opacity-40 disabled:cursor-not-allowed"
                                data-testid="btn-custom-apply"
                              >
                                Set
                              </button>
                              <button
                                onClick={() =>
                                  setCustomMode((m) => ({ ...m, [activeEntry.id]: false }))
                                }
                                className="rounded-lg px-2 py-1.5 text-xs font-bold bg-white/5 text-amber-100 hover:bg-white/10 border border-amber-300/20"
                                data-testid="btn-custom-cancel"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-[10px] uppercase tracking-wider text-amber-200/80 font-bold">
                            Background
                          </div>
                          <button
                            onClick={() => handleRemoveBg(activeEntry.id)}
                            disabled={activeEntry.bgRemoving}
                            className="inline-flex items-center gap-1 rounded-md bg-amber-400/10 hover:bg-amber-400/20 border border-amber-300/40 px-2 py-0.5 text-[10px] font-bold text-amber-200 disabled:opacity-50"
                            data-testid="btn-removebg"
                          >
                            {activeEntry.bgRemoving ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            ) : (
                              <Wand2 className="h-2.5 w-2.5" />
                            )}
                            {activeEntry.bgRemoved
                              ? "Re-run"
                              : activeEntry.bgRemoving
                                ? "Removing…"
                                : "Auto remove"}
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(["none", "white", "blue"] as BgChoice[]).map((b) => (
                            <button
                              key={b}
                              onClick={() => setEntryBg(activeEntry.id, b)}
                              className={`rounded-lg py-1.5 font-bold text-[11px] transition-all capitalize ${
                                activeEntry.bg === b
                                  ? "bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 shadow"
                                  : "bg-white/5 text-amber-100 hover:bg-white/10 border border-amber-300/20"
                              }`}
                              data-testid={`btn-bg-${b}`}
                            >
                              {b === "none" ? "Original" : b}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Sheet preview */}
              {layout && layout.cells.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-amber-200 font-bold mb-1.5">
                    Sheet preview ({pageSize}, {layout.cells.length}{" "}
                    {layout.cells.length === 1 ? "photo" : "photos"} ·{" "}
                    {entries.length} {entries.length === 1 ? "person" : "people"})
                  </div>
                  <div
                    ref={sheetRef}
                    className="relative bg-white rounded-md shadow-2xl mx-auto overflow-hidden"
                    style={{
                      width: PAGE_DIMS_MM[pageSize].w * previewScale,
                      height: PAGE_DIMS_MM[pageSize].h * previewScale,
                    }}
                  >
                    {layout.cells.map((cell, i) => {
                      const url = entries[cell.entryIndex]?.finalUrl;
                      if (!url) return null;
                      return (
                        <div
                          key={i}
                          className="absolute border border-black/80 box-border overflow-hidden"
                          style={{
                            left: cell.xMm * previewScale,
                            top: cell.yMm * previewScale,
                            width: layout.cellW * previewScale,
                            height: layout.cellH * previewScale,
                          }}
                        >
                          <img
                            src={url}
                            alt=""
                            className="w-full h-full object-cover"
                            style={{
                              transform: layout.rotate ? "rotate(90deg) scale(1.4)" : undefined,
                              transformOrigin: "center",
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {entries.some(
                    (e, idx) =>
                      (layout?.cells.filter((c) => c.entryIndex === idx).length ?? 0) < e.copies,
                  ) && (
                    <div className="mt-2 text-[11px] text-amber-300/80">
                      Some photos didn't fit on this page — try a larger paper size, fewer copies,
                      or fewer people.
                    </div>
                  )}
                </div>
              )}

              <AnimatePresence>
                {pdfBusy && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <GoldLoader progress={pdfProgress} label="Building 300 DPI PDF…" />
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-wrap gap-3">
                <GoldButton
                  onClick={handleGeneratePdf}
                  disabled={pdfBusy || !layout || layout.cells.length === 0}
                  testId="btn-generate-pdf"
                >
                  {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                  {pdfBusy ? "Building PDF…" : "One-Click Print PDF"}
                </GoldButton>
                {entries.length === 1 && (
                  <button
                    onClick={() =>
                      requirePrime(async () => {
                        const e = entries[0];
                        if (!e) return;
                        const finalCanvas = entryFinalCanvas(e);
                        const blob = await canvasToBlob(finalCanvas, "image/jpeg", 0.95);
                        downloadBlob(blob, "passport-photo-3.5x4.5cm.jpg");
                      })
                    }
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-300/40 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm font-semibold text-amber-100"
                    data-testid="btn-download-single"
                  >
                    <Download className="h-4 w-4" /> Single JPG
                  </button>
                )}
                <button
                  onClick={clearAll}
                  className="ml-auto inline-flex items-center gap-1.5 text-xs text-purple-200/70 hover:text-amber-200"
                  data-testid="btn-reset-all"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Reset all
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar — page-size + global tips. Per-entry copies/bg now live
            inside each entry card on the left so each person can have an
            independent count and background. */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-200 mb-3">
              Page size
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["A4", "4x6", "5x7"] as PageSize[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPageSize(p)}
                  className={`rounded-xl py-2 font-bold text-sm transition-all ${
                    pageSize === p
                      ? "bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 shadow-lg"
                      : "bg-white/5 text-amber-100 hover:bg-white/10 border border-amber-300/20"
                  }`}
                  data-testid={`btn-page-${p}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {entries.length > 0 && (
            <div className="rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-400/10 to-purple-600/10 p-4 text-xs text-purple-100/85 leading-relaxed">
              <div className="flex items-center gap-1.5 text-amber-200 font-bold mb-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
                Sheet summary
              </div>
              <div>
                <strong className="text-amber-100">{entries.length}</strong>{" "}
                {entries.length === 1 ? "person" : "people"} ·{" "}
                <strong className="text-amber-100">{totalCopies}</strong> copies requested ·{" "}
                <strong className="text-amber-100">{layout?.cells.length ?? 0}</strong> fit on{" "}
                {pageSize}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-400/15 to-purple-600/10 p-4 text-xs text-purple-100/85 leading-relaxed">
            <div className="flex items-center gap-1.5 text-amber-200 font-bold mb-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
              Smart Alignment Active
            </div>
            Photos start from the <strong className="text-amber-100">top-left corner</strong> and
            each new person begins on their own row — easy to cut & sort.
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs text-purple-100/80 leading-relaxed">
            Output is a print-ready <strong className="text-amber-100">PDF @ 300 DPI</strong> with
            a <strong className="text-amber-100">1px black cut border</strong> around each photo —
            perfect for studio printing &amp; manual cutting.
          </div>
        </aside>
      </div>

      {/* Crop dialog — opens after every upload (new entry) and when the
          user taps "Re-crop" on an existing entry. Closing without
          applying drops the upload (new) or just dismisses (existing). */}
      <Dialog
        open={cropOpen}
        onOpenChange={(open) => {
          if (!open) cancelCrop();
          else setCropOpen(true);
        }}
      >
        <DialogContent
          className="max-w-md sm:max-w-lg p-0 gap-0 bg-gradient-to-br from-purple-950 via-purple-900 to-indigo-950 border-amber-300/30 text-amber-50"
          data-testid="crop-dialog"
        >
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-amber-300/20">
            <DialogTitle className="flex items-center gap-2 text-amber-100">
              <CropIcon className="h-4 w-4 text-amber-300" />
              {cropTargetId === null
                ? `Crop photo for Person ${entries.length + 1}`
                : "Re-crop photo"}{" "}
              <span className="text-amber-300/70 text-xs font-normal">(3.5 × 4.5 cm)</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-amber-200/70">
              Drag to position, pinch or use the slider to zoom. The frame is locked to passport
              ratio.
            </DialogDescription>
          </DialogHeader>
          <div className="relative w-full bg-black/60" style={{ height: 360 }}>
            {cropSourceUrl && (
              <Cropper
                image={cropSourceUrl}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={PHOTO_W_MM / PHOTO_H_MM}
                showGrid
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={onCropComplete}
                objectFit="contain"
                style={{
                  containerStyle: { background: "rgba(0,0,0,0.6)" },
                }}
              />
            )}
          </div>
          <div className="px-5 py-3 border-t border-amber-300/20 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-200/80 w-12">
                Zoom
              </span>
              <input
                type="range"
                min={1}
                max={4}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 accent-amber-400"
                data-testid="crop-zoom"
              />
              <span className="text-xs font-bold text-amber-100 w-10 text-right">
                {zoom.toFixed(2)}×
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-200/80 w-12">
                Rotate
              </span>
              <button
                type="button"
                onClick={() => rotateBy(-90)}
                className="flex items-center gap-1 rounded-lg border border-amber-300/30 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-bold text-amber-100"
                data-testid="btn-rotate-left"
                title="Rotate 90° left"
              >
                <RotateCcw className="h-3.5 w-3.5" /> 90° L
              </button>
              <button
                type="button"
                onClick={() => rotateBy(90)}
                className="flex items-center gap-1 rounded-lg border border-amber-300/30 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-bold text-amber-100"
                data-testid="btn-rotate-right"
                title="Rotate 90° right"
              >
                <RotateCw className="h-3.5 w-3.5" /> 90° R
              </button>
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={rotation}
                onChange={(e) => setRotation(parseInt(e.target.value, 10))}
                className="flex-1 accent-amber-400"
                data-testid="crop-rotation"
              />
              <span className="text-xs font-bold text-amber-100 w-10 text-right">
                {Math.round(rotation)}°
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={cancelCrop}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm font-bold text-amber-100"
                data-testid="btn-crop-cancel"
              >
                Cancel
              </button>
              <GoldButton
                onClick={applyCrop}
                disabled={!croppedAreaPixels || cropApplying}
                testId="btn-crop-apply"
              >
                {cropApplying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CropIcon className="h-4 w-4" />
                )}
                {cropApplying ? "Applying…" : "Apply Crop"}
              </GoldButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {primeGateModal}
    </PrimeToolShell>
  );
}
