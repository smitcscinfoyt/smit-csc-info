import { Fragment, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Scissors,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Package,
  Files,
  Upload,
  X,
  Sparkles,
} from "lucide-react";
import JSZip from "jszip";
import {
  PrimeToolShell,
  GoldButton,
  GoldLoader,
} from "@/components/tools/prime-tool-shell";
import { getTool } from "@/components/tools/tools-data";
import {
  renderThumbnails,
  extractPages,
  type PageThumb,
} from "@/lib/tools/pdf-tools";
import { downloadBlob } from "@/lib/tools/file";

type SplitMode = "manual" | "every" | "every2" | "every3" | "everyN";

const BASE_THUMB_W = 140; // px

export default function SplitPdfPage() {
  const tool = getTool("split-pdf")!;
  const [files, setFiles] = useState<File[]>([]);
  const [thumbs, setThumbs] = useState<PageThumb[]>([]);
  // Set of page indices AFTER which a split occurs.
  // E.g. {0, 2} on a 4-page PDF → groups [[0],[1,2],[3]] → 3 output PDFs.
  const [splitAfter, setSplitAfter] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Thumbnail zoom %, 50–200, step 25.
  const [zoom, setZoom] = useState(100);
  const [splitMode, setSplitMode] = useState<SplitMode>("manual");
  const [everyN, setEveryN] = useState(2);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [renderProgress, setRenderProgress] = useState(0);

  const file = files[0];

  useEffect(() => {
    setError(null);
    setThumbs([]);
    setSplitAfter(new Set());
    setSplitMode("manual");
    if (!file) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setRenderProgress(0);
      try {
        const t = await renderThumbnails(file, 240);
        if (!cancelled) {
          setThumbs(t);
          setRenderProgress(100);
        }
      } catch {
        if (!cancelled) {
          setError(
            "આ PDF વાંચી શકાતી નથી. કદાચ encrypted અથવા corrupted છે — બીજી file આપો.",
          );
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Compute groups (one array per output PDF) from splitAfter.
  const groups = useMemo<number[][]>(() => {
    if (thumbs.length === 0) return [];
    const result: number[][] = [[]];
    for (let i = 0; i < thumbs.length; i++) {
      result[result.length - 1].push(i);
      if (splitAfter.has(i) && i < thumbs.length - 1) {
        result.push([]);
      }
    }
    return result.filter((g) => g.length > 0);
  }, [thumbs.length, splitAfter]);

  const toggleSplit = (afterIndex: number) => {
    const next = new Set(splitAfter);
    if (next.has(afterIndex)) next.delete(afterIndex);
    else next.add(afterIndex);
    setSplitAfter(next);
    setSplitMode("manual");
  };

  function applyMode(mode: SplitMode, n: number = everyN) {
    setSplitMode(mode);
    const next = new Set<number>();
    if (mode === "every") {
      // Split between every page → 1 page per output
      for (let i = 0; i < thumbs.length - 1; i++) next.add(i);
    } else if (mode === "every2") {
      for (let i = 1; i < thumbs.length - 1; i += 2) next.add(i);
    } else if (mode === "every3") {
      for (let i = 2; i < thumbs.length - 1; i += 3) next.add(i);
    } else if (mode === "everyN" && n >= 1) {
      for (let i = n - 1; i < thumbs.length - 1; i += n) next.add(i);
    }
    // manual: keep current splits — only fired by user toggle
    setSplitAfter(next);
  }

  function resetSplits() {
    setSplitAfter(new Set());
    setSplitMode("manual");
  }

  function clearFile() {
    setFiles([]);
    setThumbs([]);
    setSplitAfter(new Set());
    setError(null);
  }

  async function handleSplit() {
    if (!file || groups.length === 0) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    try {
      const base = file.name.replace(/\.pdf$/i, "");
      const padLen = String(groups.length).length;

      // Edge case: only 1 group means no actual split — give a single PDF.
      if (groups.length === 1) {
        setProgressLabel("Building PDF…");
        const blob = await extractPages(file, groups[0]);
        downloadBlob(blob, `${base}.pdf`);
        setProgress(100);
        setTimeout(() => {
          setBusy(false);
          setProgress(0);
        }, 600);
        return;
      }

      setProgressLabel(`Building ${groups.length} PDFs…`);
      const zip = new JSZip();
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const blob = await extractPages(file, g);
        const num = String(i + 1).padStart(padLen, "0");
        const range =
          g.length === 1
            ? `${g[0] + 1}`
            : `${g[0] + 1}-${g[g.length - 1] + 1}`;
        zip.file(`${base}-part${num}-pages${range}.pdf`, blob);
        setProgress(Math.round(((i + 1) / groups.length) * 80));
      }

      setProgressLabel("Packaging ZIP…");
      const zipBlob = await zip.generateAsync({ type: "blob" }, (m) => {
        setProgress(80 + Math.round(m.percent * 0.2));
      });
      downloadBlob(zipBlob, `${base}-split-${groups.length}files.zip`);
      setProgress(100);
    } catch (e) {
      console.error(e);
      setError("Split fail થયું — બીજી file try કરો અથવા page count ઘટાડો.");
    } finally {
      setTimeout(() => {
        setBusy(false);
        setProgress(0);
      }, 600);
    }
  }

  const thumbWidth = Math.round(BASE_THUMB_W * (zoom / 100));
  const totalPagesInGroups = groups.reduce((s, g) => s + g.length, 0);

  // File picker handler — single PDF only.
  const handleFiles = (fs: FileList | File[] | null) => {
    if (!fs) return;
    const arr = Array.from(fs).filter((f) => f.type === "application/pdf");
    if (arr.length === 0) {
      setError("PDF file આપો.");
      return;
    }
    setError(null);
    setFiles([arr[0]]);
  };

  return (
    <PrimeToolShell tool={tool}>
      {/* Upload area when no file */}
      {!file && (
        <UploadArea onFiles={handleFiles} />
      )}

      {/* Error toast */}
      {error && (
        <div className="mb-4 rounded-xl border border-rose-400/40 bg-rose-500/10 text-rose-100 px-4 py-3 text-sm flex items-center gap-2">
          <X className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Initial loading while reading PDF pages */}
      {file && busy && thumbs.length === 0 && (
        <div className="mt-4 rounded-2xl border border-amber-300/30 bg-gradient-to-br from-purple-900/40 to-indigo-950/40 p-6">
          <div className="flex items-center gap-3 text-amber-100">
            <Loader2 className="h-5 w-5 animate-spin text-amber-300" />
            <span className="font-bold">Reading PDF pages…</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-yellow-500 transition-all"
              style={{ width: `${renderProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Main split UI */}
      {file && thumbs.length > 0 && (
        <div className="space-y-4">
          {/* Top bar: file info + zoom + reset */}
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-3 sm:p-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-300 to-yellow-500 flex items-center justify-center flex-shrink-0">
                <Files className="h-5 w-5 text-purple-950" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-amber-100 truncate text-sm">
                  {file.name}
                </div>
                <div className="text-[11px] text-purple-100/60">
                  {thumbs.length} pages
                </div>
              </div>
            </div>
            {/* Zoom controls */}
            <div className="flex items-center gap-1 rounded-lg border border-amber-300/30 bg-white/5 p-1">
              <button
                onClick={() => setZoom((z) => Math.max(50, z - 25))}
                disabled={zoom <= 50}
                className="rounded-md p-1.5 text-amber-200 hover:bg-amber-400/15 disabled:opacity-30"
                aria-label="Zoom out"
                data-testid="btn-zoom-out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-[11px] font-bold text-amber-100 w-10 text-center">
                {zoom}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(200, z + 25))}
                disabled={zoom >= 200}
                className="rounded-md p-1.5 text-amber-200 hover:bg-amber-400/15 disabled:opacity-30"
                aria-label="Zoom in"
                data-testid="btn-zoom-in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                onClick={() => setZoom(100)}
                className="rounded-md p-1.5 text-amber-200 hover:bg-amber-400/15"
                aria-label="Reset zoom"
                data-testid="btn-zoom-reset"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={clearFile}
              className="inline-flex items-center gap-1.5 text-[11px] text-purple-200/70 hover:text-amber-200 px-2 py-1 rounded-md hover:bg-white/5"
              data-testid="btn-clear-file"
            >
              <X className="h-3.5 w-3.5" /> Change file
            </button>
          </div>

          {/* Quick split modes */}
          <div className="rounded-2xl border border-amber-300/30 bg-gradient-to-br from-purple-900/40 to-indigo-950/40 backdrop-blur-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <div className="text-[10px] uppercase tracking-wider text-amber-200/80 font-bold">
                Quick split mode
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <ModeBtn
                active={splitMode === "manual" && splitAfter.size === 0}
                onClick={resetSplits}
                label="Single PDF"
                hint="No split"
                testid="btn-mode-manual"
              />
              <ModeBtn
                active={splitMode === "every"}
                onClick={() => applyMode("every")}
                label="Every page"
                hint={`→ ${thumbs.length} files`}
                testid="btn-mode-every"
              />
              <ModeBtn
                active={splitMode === "every2"}
                onClick={() => applyMode("every2")}
                label="Every 2 pages"
                hint={`→ ${Math.ceil(thumbs.length / 2)} files`}
                testid="btn-mode-every2"
              />
              <ModeBtn
                active={splitMode === "every3"}
                onClick={() => applyMode("every3")}
                label="Every 3 pages"
                hint={`→ ${Math.ceil(thumbs.length / 3)} files`}
                testid="btn-mode-every3"
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="text-[11px] text-amber-200/70 font-bold">
                Custom every:
              </div>
              <input
                type="number"
                min={1}
                max={thumbs.length}
                value={everyN}
                onChange={(e) => {
                  const v = Math.max(
                    1,
                    Math.min(thumbs.length, parseInt(e.target.value || "1", 10)),
                  );
                  setEveryN(v);
                  if (splitMode === "everyN") applyMode("everyN", v);
                }}
                className="w-16 rounded-md bg-white/10 border border-amber-300/30 text-amber-100 px-2 py-1 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-400"
                data-testid="input-every-n"
              />
              <button
                onClick={() => applyMode("everyN", everyN)}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition-all ${
                  splitMode === "everyN"
                    ? "bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 shadow"
                    : "bg-white/5 text-amber-100 hover:bg-white/10 border border-amber-300/20"
                }`}
                data-testid="btn-mode-everyN"
              >
                pages → {Math.ceil(thumbs.length / Math.max(1, everyN))} files
              </button>
              {splitAfter.size > 0 && (
                <button
                  onClick={resetSplits}
                  className="ml-auto inline-flex items-center gap-1 text-[11px] text-amber-200/80 hover:text-amber-100 px-2 py-1 rounded-md hover:bg-white/5"
                  data-testid="btn-reset-splits"
                >
                  <RotateCcw className="h-3 w-3" /> Reset
                </button>
              )}
            </div>
          </div>

          {/* Page thumbnails with scissor split-points between */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:p-4 overflow-x-auto">
            <div className="flex flex-wrap items-stretch gap-3 justify-center sm:justify-start">
              {thumbs.map((t, i) => {
                const isSplit = splitAfter.has(i);
                return (
                  <Fragment key={t.index}>
                    <ThumbCard
                      thumb={t}
                      width={thumbWidth}
                    />
                    {i < thumbs.length - 1 && (
                      <ScissorButton
                        active={isSplit}
                        onToggle={() => toggleSplit(i)}
                        index={i}
                      />
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>

          {/* Output groups summary */}
          <div className="rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-400/10 to-purple-600/10 p-4">
            <div className="flex items-center gap-1.5 text-amber-200 font-bold mb-2 text-xs">
              <Package className="h-4 w-4" />
              Output ({groups.length} {groups.length === 1 ? "PDF" : "PDFs"} ·{" "}
              {totalPagesInGroups} pages)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g, i) => (
                <div
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md bg-white/10 border border-amber-300/30 px-2 py-1 text-[11px] text-amber-100"
                  data-testid={`group-chip-${i}`}
                >
                  <span className="font-bold text-amber-300">PDF {i + 1}:</span>
                  {g.length === 1
                    ? `Page ${g[0] + 1}`
                    : `Pages ${g[0] + 1}–${g[g.length - 1] + 1}`}
                  <span className="text-amber-200/70">({g.length}p)</span>
                </div>
              ))}
            </div>
          </div>

          {/* Progress bar */}
          <AnimatePresence>
            {busy && progress > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <GoldLoader progress={progress} label={progressLabel} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action bar */}
          <div className="sticky bottom-2 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/40 bg-purple-950/85 backdrop-blur-xl px-3 sm:px-4 py-3 shadow-2xl">
            <div className="text-xs text-amber-100 min-w-0 flex-1">
              {groups.length === 1 ? (
                <>Will produce <strong className="text-amber-300">1 PDF</strong> (no split applied).</>
              ) : (
                <>
                  Will produce{" "}
                  <strong className="text-amber-300">
                    {groups.length} separate PDFs
                  </strong>{" "}
                  in a ZIP file.
                </>
              )}
            </div>
            <GoldButton
              onClick={handleSplit}
              disabled={busy || groups.length === 0}
              testId="btn-split-download"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : groups.length > 1 ? (
                <Package className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {busy
                ? "Building…"
                : groups.length > 1
                  ? `Split & Download ZIP`
                  : "Download PDF"}
            </GoldButton>
          </div>
        </div>
      )}
    </PrimeToolShell>
  );
}

function UploadArea({ onFiles }: { onFiles: (fs: FileList | File[] | null) => void }) {
  return (
    <label
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onFiles(e.dataTransfer.files);
      }}
      className="block cursor-pointer rounded-2xl border-2 border-dashed border-amber-300/40 bg-white/5 hover:bg-white/10 hover:border-amber-300/70 transition-all p-12 text-center"
      data-testid="split-drop"
    >
      <input
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-300 to-yellow-500 flex items-center justify-center shadow-lg mb-4">
        <Upload className="h-8 w-8 text-purple-950" />
      </div>
      <div className="font-bold text-amber-100 text-lg">Upload a PDF to split</div>
      <div className="text-sm text-purple-100/70 mt-1">
        Click <Scissors className="inline h-3.5 w-3.5 -mt-0.5" /> between pages to choose where to split — every page stays, nothing is deleted.
      </div>
    </label>
  );
}

function ThumbCard({ thumb, width }: { thumb: PageThumb; width: number }) {
  const aspect = thumb.height / Math.max(1, thumb.width);
  return (
    <div
      className="relative rounded-lg overflow-hidden border-2 border-amber-300/30 bg-white shadow-md flex-shrink-0"
      style={{ width, height: width * aspect }}
      data-testid={`thumb-page-${thumb.index}`}
    >
      <img
        src={thumb.dataUrl}
        alt={`Page ${thumb.index + 1}`}
        className="w-full h-full object-contain bg-white"
        draggable={false}
      />
      <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-black/65 text-amber-200 text-[10px] font-bold leading-none">
        {thumb.index + 1}
      </div>
    </div>
  );
}

function ScissorButton({
  active,
  onToggle,
  index,
}: {
  active: boolean;
  onToggle: () => void;
  index: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative self-center group flex flex-col items-center justify-center gap-0.5 rounded-full transition-all ${
        active
          ? "h-12 w-12 bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 shadow-lg shadow-amber-500/40 scale-110"
          : "h-9 w-9 bg-white/5 text-purple-200/60 hover:bg-amber-400/20 hover:text-amber-200 border border-white/10 hover:border-amber-300/50 hover:scale-105"
      }`}
      aria-label={active ? `Remove split after page ${index + 1}` : `Split after page ${index + 1}`}
      title={active ? `Split here (after page ${index + 1})` : `Click to split after page ${index + 1}`}
      data-testid={`btn-scissor-${index}`}
    >
      <Scissors className={active ? "h-5 w-5" : "h-4 w-4"} />
      {active && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute -bottom-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-amber-300 text-purple-950 text-[9px] font-bold whitespace-nowrap shadow"
        >
          SPLIT
        </motion.div>
      )}
    </button>
  );
}

function ModeBtn({
  active,
  onClick,
  label,
  hint,
  testid,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  testid: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-left transition-all ${
        active
          ? "bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 shadow"
          : "bg-white/5 text-amber-100 hover:bg-white/10 border border-amber-300/20"
      }`}
      data-testid={testid}
    >
      <div className="text-xs font-bold leading-tight">{label}</div>
      <div className={`text-[10px] mt-0.5 ${active ? "text-purple-900/80" : "text-amber-200/60"}`}>
        {hint}
      </div>
    </button>
  );
}
