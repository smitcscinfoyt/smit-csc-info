import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, Upload, Wand2, RefreshCw } from "lucide-react";
import { PrimeToolShell, GoldButton, GoldLoader } from "@/components/tools/prime-tool-shell";
import { getTool } from "@/components/tools/tools-data";
import { loadImage, canvasToBlob, setJpegDPI } from "@/lib/tools/canvas";
import { upscaleImage } from "@/lib/tools/image-enhance";
import { formatBytes } from "@/lib/tools/file";
import { ToolResult } from "@/components/tools/tool-result";
import { consumePendingFile } from "@/lib/tools/pipeline";
import { usePrimeDownloadGate } from "@/hooks/use-prime-download-gate";
import { useAutoResumeDownload } from "@/hooks/use-auto-resume-download";
import { downloadBlob } from "@/lib/tools/file";

type Scale = 2 | 4;

export default function ImageUpscalerPage() {
  const tool = getTool("image-upscaler")!;
  const { requirePrime, modal: primeGateModal } = usePrimeDownloadGate({
    toolId: "image-upscaler",
    toolTitle: tool.title,
    actionLabel: "Download",
  });
  const [file, setFile] = useState<File | null>(null);
  // Auto-resume — placed after `file`/`resultBlob` are declared so
  // the `ready` predicate sees the latest state without TDZ issues.
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scale, setScale] = useState<Scale>(2);
  const [denoise, setDenoise] = useState(0.35);
  const [sharpen, setSharpen] = useState(0.7);
  const [outDim, setOutDim] = useState<{ w: number; h: number } | null>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);

  // Auto-consume any file passed in from a previous tool in the chain.
  useEffect(() => {
    let active = true;
    void (async () => {
      const incoming = await consumePendingFile("image/*");
      if (active && incoming) handleFile(incoming);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke each object URL when it changes or on unmount.
  useEffect(() => {
    if (!originalUrl) return;
    return () => URL.revokeObjectURL(originalUrl);
  }, [originalUrl]);
  useEffect(() => {
    if (!resultUrl) return;
    return () => URL.revokeObjectURL(resultUrl);
  }, [resultUrl]);

  function reset() {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setFile(null);
    setOriginalUrl(null);
    setResultUrl(null);
    setResultBlob(null);
    setProgress(0);
    setOutDim(null);
  }

  function handleFile(f: File | null) {
    if (!f) return;
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    setResultBlob(null);
    setProgress(0);
    setOutDim(null);
    setFile(f);
    setOriginalUrl(URL.createObjectURL(f));
  }

  async function handleUpscale() {
    if (!file) return;
    setBusy(true);
    setProgress(2);
    try {
      const img = await loadImage(file);
      const out = await upscaleImage(img, {
        scale,
        denoise,
        sharpen,
        onProgress: (p) => setProgress(p),
      });
      let blob = await canvasToBlob(out, "image/jpeg", 0.95);
      blob = await setJpegDPI(blob, 300);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultBlob(blob);
      setOutDim({ w: out.width, h: out.height });
      setSliderPos(50);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
      setProgress(100);
    }
  }

  // Comparison slider drag handler
  function onSliderMove(clientX: number) {
    const el = dragRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(0, Math.min(100, x)));
  }

  return (
    <PrimeToolShell tool={tool}>
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div>
          {!file && (
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className="cursor-pointer rounded-2xl border-2 border-dashed border-amber-300/40 bg-white/5 hover:bg-white/10 hover:border-amber-300/70 transition-all p-12 text-center"
              data-testid="upscaler-drop"
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-300 to-yellow-500 flex items-center justify-center shadow-lg mb-4">
                <Upload className="h-8 w-8 text-purple-950" />
              </div>
              <div className="font-bold text-amber-100 text-lg">Drop a low-res photo here</div>
              <div className="text-sm text-purple-100/70 mt-1">or click to browse — JPG / PNG / WEBP, max 15 MB</div>
            </div>
          )}

          {file && (
            <div className="space-y-4">
              {/* Before/After comparison */}
              <div
                ref={dragRef}
                className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black/40 select-none"
                style={{ aspectRatio: "4 / 3" }}
                onMouseMove={(e) => e.buttons === 1 && onSliderMove(e.clientX)}
                onTouchMove={(e) => onSliderMove(e.touches[0].clientX)}
              >
                {/* Bottom (after) layer always shows the result if we have one, else the original */}
                {originalUrl && (
                  <img
                    src={resultUrl ?? originalUrl}
                    alt={resultUrl ? "Upscaled result" : "Original"}
                    className="absolute inset-0 w-full h-full object-contain"
                    draggable={false}
                  />
                )}
                {/* Top (before) layer is the original, clipped to the slider position */}
                {resultUrl && originalUrl && (
                  <img
                    src={originalUrl}
                    alt="Original"
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                    draggable={false}
                  />
                )}
                {resultUrl && (
                  <>
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.8)] pointer-events-none"
                      style={{ left: `${sliderPos}%` }}
                    />
                    <div
                      role="slider"
                      tabIndex={0}
                      aria-label="Compare before and after"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(sliderPos)}
                      onMouseDown={(e) => onSliderMove(e.clientX)}
                      onTouchStart={(e) => onSliderMove(e.touches[0].clientX)}
                      onTouchMove={(e) => {
                        e.preventDefault();
                        onSliderMove(e.touches[0].clientX);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") setSliderPos((p) => Math.max(0, p - 5));
                        if (e.key === "ArrowRight") setSliderPos((p) => Math.min(100, p + 5));
                        if (e.key === "Home") setSliderPos(0);
                        if (e.key === "End") setSliderPos(100);
                      }}
                      className="absolute -translate-x-1/2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-gradient-to-br from-amber-300 to-yellow-500 shadow-lg flex items-center justify-center text-purple-950 cursor-ew-resize focus:outline-none focus:ring-2 focus:ring-amber-200"
                      style={{ left: `${sliderPos}%` }}
                      data-testid="compare-slider-handle"
                    >
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-[10px] uppercase tracking-wider text-amber-200 font-bold">
                      Before
                    </div>
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-amber-400/90 text-[10px] uppercase tracking-wider text-purple-950 font-bold">
                      After
                    </div>
                  </>
                )}
              </div>

              {/* Progress */}
              <AnimatePresence>
                {busy && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <GoldLoader progress={progress} label="Enhancing with AI logic…" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action row */}
              <div className="flex flex-wrap items-center gap-3">
                {!resultUrl && (
                  <GoldButton onClick={handleUpscale} disabled={busy} testId="btn-upscale">
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    {busy ? "Enhancing…" : `Upscale ${scale}×`}
                  </GoldButton>
                )}
                {resultUrl && (
                  <button
                    onClick={() => {
                      setResultUrl(null);
                      setResultBlob(null);
                      setProgress(0);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-300/40 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm font-semibold text-amber-100"
                  >
                    <RefreshCw className="h-4 w-4" /> Re-run
                  </button>
                )}
                <button
                  onClick={reset}
                  className="ml-auto text-xs text-purple-200/70 hover:text-amber-200 underline underline-offset-4"
                >
                  Choose another image
                </button>
              </div>

              {outDim && (
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-xs text-purple-100/80 grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-[10px] uppercase text-amber-200/70">Output size</div>
                    <div className="font-mono font-bold text-amber-100">
                      {outDim.w} × {outDim.h}px
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-amber-200/70">DPI</div>
                    <div className="font-mono font-bold text-amber-100">300</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-amber-200/70">File size</div>
                    <div className="font-mono font-bold text-amber-100">
                      {resultBlob ? formatBytes(resultBlob.size) : "—"}
                    </div>
                  </div>
                </div>
              )}

              {resultBlob && file && (
                <ToolResult
                  blob={resultBlob}
                  filename={`${file.name.replace(/\.[^.]+$/, "")}-upscaled-${scale}x.jpg`}
                  kind="image"
                  fromSlug="image-upscaler"
                  subtitle={`${scale}× upscaled • ${formatBytes(resultBlob.size)}`}
                  requirePrime={requirePrime}
                />
              )}
              {primeGateModal}
            </div>
          )}
        </div>

        {/* Sidebar settings */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-200 mb-3">
              Upscale factor
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([2, 4] as Scale[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScale(s)}
                  disabled={busy}
                  className={`rounded-xl py-2 font-bold text-sm transition-all ${
                    scale === s
                      ? "bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 shadow-lg"
                      : "bg-white/5 text-amber-100 hover:bg-white/10 border border-amber-300/20"
                  }`}
                  data-testid={`btn-scale-${s}x`}
                >
                  {s}× {s === 4 && <span className="text-[10px] opacity-70">(4K)</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl space-y-4">
            <div>
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="font-bold uppercase tracking-wider text-amber-200">Denoise</span>
                <span className="font-mono text-amber-100 text-base">{denoise.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDenoise((v) => Math.max(0, +(v - 0.05).toFixed(2)))}
                  className="w-9 h-9 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 font-bold text-lg disabled:opacity-40"
                  aria-label="Decrease denoise"
                >
                  −
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={denoise}
                  disabled={busy}
                  onChange={(e) => setDenoise(Number(e.target.value))}
                  className="flex-1 accent-amber-400 h-3"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDenoise((v) => Math.min(1, +(v + 0.05).toFixed(2)))}
                  className="w-9 h-9 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 font-bold text-lg disabled:opacity-40"
                  aria-label="Increase denoise"
                >
                  +
                </button>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="font-bold uppercase tracking-wider text-amber-200">Sharpen</span>
                <span className="font-mono text-amber-100 text-base">{sharpen.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSharpen((v) => Math.max(0, +(v - 0.05).toFixed(2)))}
                  className="w-9 h-9 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 font-bold text-lg disabled:opacity-40"
                  aria-label="Decrease sharpen"
                >
                  −
                </button>
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={sharpen}
                  disabled={busy}
                  onChange={(e) => setSharpen(Number(e.target.value))}
                  className="flex-1 accent-amber-400 h-3"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSharpen((v) => Math.min(1.5, +(v + 0.05).toFixed(2)))}
                  className="w-9 h-9 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 font-bold text-lg disabled:opacity-40"
                  aria-label="Increase sharpen"
                >
                  +
                </button>
              </div>
            </div>
            <div className="border-t border-white/10 pt-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-200/70 mb-2">
                Quick Presets
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDenoise(0.15);
                    setSharpen(0.4);
                  }}
                  className="rounded-lg border border-white/15 bg-white/5 hover:bg-amber-400/20 hover:border-amber-300/40 text-xs font-bold text-purple-100 py-2 transition disabled:opacity-40"
                >
                  Light
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDenoise(0.35);
                    setSharpen(0.7);
                  }}
                  className="rounded-lg border border-white/15 bg-white/5 hover:bg-amber-400/20 hover:border-amber-300/40 text-xs font-bold text-purple-100 py-2 transition disabled:opacity-40"
                >
                  Medium
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDenoise(0.6);
                    setSharpen(1.2);
                  }}
                  className="rounded-lg border border-white/15 bg-white/5 hover:bg-amber-400/20 hover:border-amber-300/40 text-xs font-bold text-purple-100 py-2 transition disabled:opacity-40"
                >
                  Strong
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-400/10 to-purple-600/10 p-4 text-xs text-purple-100/80 leading-relaxed">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-amber-300" />
              <span className="font-bold text-amber-100">Pro tip</span>
            </div>
            Use 4× on small ID-card photos (under 500px). Use 2× to keep a smoother look on portrait
            shots. Output is always JPG @ 300 DPI, ready for printing.
          </div>
        </aside>
      </div>
    </PrimeToolShell>
  );
}
