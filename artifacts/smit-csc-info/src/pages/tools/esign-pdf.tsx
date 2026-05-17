import { useEffect, useRef, useState } from "react";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { getTool } from "@/components/tools/tools-data";
import {
  renderThumbnails,
  placeSignatures,
  type PageThumb,
  type SignaturePlacement,
} from "@/lib/tools/pdf-tools";
import { ToolResult } from "@/components/tools/tool-result";
import { usePrimeDownloadGate } from "@/hooks/use-prime-download-gate";
import { useAutoResumeDownload } from "@/hooks/use-auto-resume-download";
import { downloadBlob } from "@/lib/tools/file";
import { Loader2, PenTool, Trash2, Eraser, Plus, Upload, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface UiPlacement {
  id: string;
  pageIndex: number;
  /** Position in % of the displayed thumbnail (0..1). */
  xPct: number;
  yPct: number;
  widthPct: number;
}

export default function EsignPdfPage() {
  const tool = getTool("esign-pdf")!;
  const { requirePrime, modal: primeGateModal } = usePrimeDownloadGate({
    toolId: "esign-pdf",
    toolTitle: tool.title,
    actionLabel: "Download",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [thumbs, setThumbs] = useState<PageThumb[]>([]);
  const [pagePtSizes, setPagePtSizes] = useState<{ w: number; h: number; rot: number }[]>([]);
  const [sigPng, setSigPng] = useState<string | null>(null);
  const [placements, setPlacements] = useState<UiPlacement[]>([]);
  const [busy, setBusy] = useState(false);
  const [outBlob, setOutBlob] = useState<Blob | null>(null);
  const firstFile = files[0];
  useAutoResumeDownload({
    toolId: "esign-pdf",
    ready: !!outBlob && !!firstFile,
    run: () => {
      if (outBlob && firstFile) {
        downloadBlob(outBlob, `${firstFile.name.replace(/\.pdf$/i, "")}-signed.pdf`);
      }
    },
  });
  const [error, setError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(0);

  const padRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const sigUploadRef = useRef<HTMLInputElement>(null);
  const sigUploadReqId = useRef(0);

  // ── Upload signature dialog state ──────────────────────────────────────
  const [sigUploadOpen, setSigUploadOpen] = useState(false);
  const [sigUploadBusy, setSigUploadBusy] = useState(false);
  const [sigUploadError, setSigUploadError] = useState<string | null>(null);
  const [uploadedOriginal, setUploadedOriginal] = useState<string | null>(null);
  const [uploadedTransparent, setUploadedTransparent] = useState<string | null>(null);

  const handleSignatureUpload = async (f: File | null) => {
    if (!f) return;
    // Always reset previous variants on a new upload attempt, regardless of validity.
    const reqId = ++sigUploadReqId.current;
    setUploadedOriginal(null);
    setUploadedTransparent(null);
    setSigUploadError(null);
    setSigUploadOpen(true);
    if (!f.type.startsWith("image/")) {
      setSigUploadError("Please pick an image file (PNG / JPG).");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setSigUploadError("Image is over 10 MB.");
      return;
    }
    setSigUploadBusy(true);
    const isStale = () => sigUploadReqId.current !== reqId;
    try {
      // Read original as data URL (instant preview).
      const original = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(f);
      });
      if (isStale()) return;
      setUploadedOriginal(original);

      // Browser-based background removal — runs locally via @imgly/background-removal.
      // No login, no Prime, no FHD credits used. Works for everyone.
      const { removeBackground } = await import("@imgly/background-removal");
      const hasWebGPU = (() => {
        try {
          return typeof (navigator as any)?.gpu?.requestAdapter === "function";
        } catch {
          return false;
        }
      })();
      let blob: Blob;
      try {
        blob = await removeBackground(f, {
          device: hasWebGPU ? "gpu" : "cpu",
          model: hasWebGPU ? "isnet_fp16" : "isnet_quint8",
          output: { format: "image/png", quality: 1.0 },
        } as any);
      } catch (e) {
        // GPU init can fail on some drivers — retry once on CPU.
        if (hasWebGPU) {
          blob = await removeBackground(f, {
            device: "cpu",
            model: "isnet_quint8",
            output: { format: "image/png", quality: 1.0 },
          } as any);
        } else {
          throw e;
        }
      }
      if (isStale()) return;
      const transparent = await new Promise<string>((res2, rej) => {
        const r = new FileReader();
        r.onload = () => res2(String(r.result));
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(blob);
      });
      if (isStale()) return;
      setUploadedTransparent(transparent);
    } catch (e) {
      if (isStale()) return;
      setSigUploadError(
        e instanceof Error
          ? `Background removal failed: ${e.message}. You can still use the original version.`
          : "Background removal failed. You can still use the original version.",
      );
    } finally {
      if (!isStale()) setSigUploadBusy(false);
    }
  };

  const pickUploadedSignature = (variant: "original" | "transparent") => {
    const url = variant === "transparent" ? uploadedTransparent : uploadedOriginal;
    if (!url) return;
    setSigPng(url);
    setError(null);
    setSigUploadOpen(false);
  };

  const file = files[0];

  useEffect(() => {
    setOutBlob(null);
    setError(null);
    setThumbs([]);
    setPlacements([]);
    setActivePage(0);
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await renderThumbnails(file, 360);
        if (cancelled) return;
        setThumbs(t);
        // Determine page point sizes from pdf-lib for precise math.
        const { PDFDocument } = await import("pdf-lib");
        const doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), {
          ignoreEncryption: true,
        });
        if (cancelled) return;
        setPagePtSizes(
          doc.getPages().map((p) => {
            const { width, height } = p.getSize();
            const rot = (((p.getRotation().angle ?? 0) % 360) + 360) % 360;
            return { w: width, h: height, rot };
          }),
        );
      } catch {
        if (!cancelled) setError("Could not read this PDF. It may be encrypted.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // ── Signature pad ───────────────────────────────────────────────────────
  useEffect(() => {
    const c = padRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
  }, []);

  const padPos = (e: React.PointerEvent) => {
    const c = padRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    };
  };

  const padDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPt.current = padPos(e);
  };
  const padMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const c = padRef.current!;
    const ctx = c.getContext("2d")!;
    const cur = padPos(e);
    const prev = lastPt.current ?? cur;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(cur.x, cur.y);
    ctx.stroke();
    lastPt.current = cur;
  };
  const padUp = () => {
    drawing.current = false;
    lastPt.current = null;
  };
  const clearPad = () => {
    const c = padRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    setSigPng(null);
  };

  /** Trim white background, return transparent PNG data URL. */
  const saveSignature = () => {
    const c = padRef.current!;
    const ctx = c.getContext("2d")!;
    const img = ctx.getImageData(0, 0, c.width, c.height);
    let minX = c.width,
      minY = c.height,
      maxX = 0,
      maxY = 0,
      hasInk = false;
    const out = ctx.createImageData(c.width, c.height);
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        const r = img.data[i],
          g = img.data[i + 1],
          b = img.data[i + 2];
        // Treat near-white as background.
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 220) {
          out.data[i] = r;
          out.data[i + 1] = g;
          out.data[i + 2] = b;
          out.data[i + 3] = 255;
          hasInk = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        } else {
          out.data[i + 3] = 0;
        }
      }
    }
    if (!hasInk) {
      setError("Please draw your signature first.");
      return;
    }
    const pad = 6;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(c.width - 1, maxX + pad);
    maxY = Math.min(c.height - 1, maxY + pad);
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext("2d")!;
    const cropped = tctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = ((y + minY) * c.width + (x + minX)) * 4;
        const di = (y * w + x) * 4;
        cropped.data[di] = out.data[si];
        cropped.data[di + 1] = out.data[si + 1];
        cropped.data[di + 2] = out.data[si + 2];
        cropped.data[di + 3] = out.data[si + 3];
      }
    }
    tctx.putImageData(cropped, 0, 0);
    setSigPng(tmp.toDataURL("image/png"));
    setError(null);
  };

  // ── Placement on page ───────────────────────────────────────────────────
  const addPlacement = () => {
    if (!sigPng) {
      setError("Save your signature first.");
      return;
    }
    setOutBlob(null);
    setError(null);
    setPlacements((p) => [
      ...p,
      {
        id: Math.random().toString(36).slice(2, 8),
        pageIndex: activePage,
        xPct: 0.55,
        yPct: 0.78,
        widthPct: 0.25,
      },
    ]);
  };

  const removePlacement = (id: string) => {
    setOutBlob(null);
    setPlacements((p) => p.filter((x) => x.id !== id));
  };

  const onSigDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
    dragRef.current = {
      id,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    target.setPointerCapture(e.pointerId);
  };
  const onSigMove = (e: React.PointerEvent, pageRect: DOMRect) => {
    const d = dragRef.current;
    if (!d) return;
    const newLeft = e.clientX - pageRect.left - d.offsetX;
    const newTop = e.clientY - pageRect.top - d.offsetY;
    setPlacements((prev) =>
      prev.map((p) => {
        if (p.id !== d.id) return p;
        // The displayed signature element keeps its aspect ratio, so its
        // height in % of page = widthPct * (renderedSigH / renderedSigW) *
        // (pageWidthPx / pageHeightPx). Compute exact bound from the DOM.
        const sigEl = (e.currentTarget as HTMLElement).querySelector?.(
          `[data-sig-id="${p.id}"] img`,
        ) as HTMLImageElement | null;
        const sigHpx = sigEl?.getBoundingClientRect().height ?? 0;
        const heightPct = sigHpx / pageRect.height;
        return {
          ...p,
          xPct: Math.max(0, Math.min(1 - p.widthPct, newLeft / pageRect.width)),
          yPct: Math.max(0, Math.min(Math.max(0, 1 - heightPct), newTop / pageRect.height)),
        };
      }),
    );
  };
  const onSigUp = (e: React.PointerEvent) => {
    if (dragRef.current) (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  const resize = (id: string, delta: number) => {
    setOutBlob(null);
    setPlacements((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, widthPct: Math.max(0.08, Math.min(0.6, p.widthPct + delta)) }
          : p,
      ),
    );
  };

  const run = async () => {
    if (!file || !sigPng) return;
    if (placements.length === 0) {
      setError("Place your signature on at least one page.");
      return;
    }
    if (pagePtSizes.length === 0) {
      setError("Page sizes not available — please re-upload.");
      return;
    }
    // Need signature image natural size to preserve aspect ratio.
    const sigImg = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Signature image error"));
      i.src = sigPng;
    });
    const aspect = sigImg.naturalHeight / sigImg.naturalWidth;
    const placementsPt: SignaturePlacement[] = placements.map((p) => {
      const pg = pagePtSizes[p.pageIndex];
      // Visible (post-rotation) dimensions = what the user actually sees.
      const visW = pg.rot === 90 || pg.rot === 270 ? pg.h : pg.w;
      const visH = pg.rot === 90 || pg.rot === 270 ? pg.w : pg.h;
      const wPt = visW * p.widthPct;
      const hPt = wPt * aspect;
      return {
        pageIndex: p.pageIndex,
        pngDataUrl: sigPng!,
        xPt: visW * p.xPct,
        yPt: visH * p.yPct,
        widthPt: wPt,
        heightPt: hPt,
      };
    });
    setBusy(true);
    setOutBlob(null);
    setError(null);
    try {
      const blob = await placeSignatures(file, placementsPt);
      setOutBlob(blob);
    } catch {
      setError("Failed to sign PDF.");
    } finally {
      setBusy(false);
    }
  };

  const activeThumb = thumbs[activePage];

  return (
    <ToolLayout tool={tool} fullBleed={files.length > 0}>
      <DropZone
        accept="application/pdf"
        files={files}
        onFiles={(f) => setFiles(f.slice(0, 1))}
        label="Drop a PDF to e-sign"
        hint="Draw your signature, then drag it onto the page"
        maxSizeMb={50}
      />

      {error && (
        <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {file && (
        <div className="mt-6 grid lg:grid-cols-[300px_1fr] gap-6">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
                1. Draw Signature
              </div>
              <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white overflow-hidden">
                <canvas
                  ref={padRef}
                  width={560}
                  height={220}
                  onPointerDown={padDown}
                  onPointerMove={padMove}
                  onPointerUp={padUp}
                  onPointerLeave={padUp}
                  className="w-full h-40 touch-none cursor-crosshair"
                  style={{ display: "block" }}
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={clearPad}>
                  <Eraser className="h-3 w-3 mr-1" /> Clear
                </Button>
                <Button size="sm" onClick={saveSignature}>
                  <PenTool className="h-3 w-3 mr-1" /> Save Signature
                </Button>
                <input
                  ref={sigUploadRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    void handleSignatureUpload(f);
                    if (sigUploadRef.current) sigUploadRef.current.value = "";
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => sigUploadRef.current?.click()}
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  <Upload className="h-3 w-3 mr-1" /> Upload
                </Button>
              </div>
              {sigPng && (
                <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="text-[11px] font-semibold text-emerald-700 mb-1">
                    Signature ready
                  </div>
                  <img src={sigPng} alt="signature" className="max-h-12 bg-white/50" />
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
                2. Pick Page
              </div>
              <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                {thumbs.map((t) => (
                  <button
                    key={t.index}
                    type="button"
                    onClick={() => setActivePage(t.index)}
                    className={`relative rounded-lg overflow-hidden border-2 ${
                      activePage === t.index
                        ? "border-amber-500 ring-2 ring-amber-200"
                        : "border-gray-200"
                    }`}
                  >
                    <img src={t.dataUrl} alt={`P${t.index + 1}`} className="w-full h-auto block" />
                    <div className="absolute top-1 left-1 bg-white/90 rounded px-1 text-[10px] font-bold">
                      {t.index + 1}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={addPlacement} disabled={!sigPng} className="w-full" variant="outline">
              <Plus className="h-4 w-4 mr-1" /> Place on page {activePage + 1}
            </Button>

            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={run} disabled={busy || !sigPng || placements.length === 0} size="lg">
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Signing…
                  </>
                ) : (
                  <>
                    <PenTool className="h-4 w-4 mr-2" /> Sign &amp; Save PDF
                  </>
                )}
              </Button>
            </div>

            {outBlob && file && (
              <ToolResult
                blob={outBlob}
                filename={`${file.name.replace(/\.pdf$/i, "")}-signed.pdf`}
                kind="pdf"
                fromSlug="esign-pdf"
                subtitle={`Signed on ${placements.length} page${placements.length === 1 ? "" : "s"}`}
                requirePrime={requirePrime}
              />
            )}
            {primeGateModal}
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
              3. Drag signature on page {activePage + 1}
            </div>
            {activeThumb ? (
              <PageWithSignatures
                src={activeThumb.dataUrl}
                placements={placements.filter((p) => p.pageIndex === activePage)}
                sigPng={sigPng}
                onMove={onSigMove}
                onSigDown={onSigDown}
                onSigUp={onSigUp}
                onResize={resize}
                onRemove={removePlacement}
              />
            ) : (
              <div className="text-sm text-gray-500">Loading page…</div>
            )}
          </div>
        </div>
      )}

      <Dialog open={sigUploadOpen} onOpenChange={setSigUploadOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Pick a signature version
            </DialogTitle>
            <DialogDescription>
              We removed the background right in your browser — free for everyone. Pick the version
              you want to use on the PDF.
            </DialogDescription>
          </DialogHeader>

          {sigUploadError && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              {sigUploadError}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4 mt-2">
            <SignatureChoiceCard
              title="Original"
              subtitle="Your photo as-is (background kept)"
              imageUrl={uploadedOriginal}
              checkered={false}
              busy={sigUploadBusy && !uploadedOriginal}
              onPick={() => pickUploadedSignature("original")}
              accent="gray"
            />
            <SignatureChoiceCard
              title="Transparent (PNG)"
              subtitle="Background removed — recommended"
              imageUrl={uploadedTransparent}
              checkered={true}
              busy={sigUploadBusy && !uploadedTransparent}
              onPick={() => pickUploadedSignature("transparent")}
              accent="amber"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSigUploadOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ToolLayout>
  );
}

function SignatureChoiceCard({
  title,
  subtitle,
  imageUrl,
  checkered,
  busy,
  onPick,
  accent,
}: {
  title: string;
  subtitle: string;
  imageUrl: string | null;
  checkered: boolean;
  busy: boolean;
  onPick: () => void;
  accent: "gray" | "amber";
}) {
  const checkerStyle = {
    backgroundImage:
      "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)",
    backgroundSize: "16px 16px",
    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
    backgroundColor: "#f9fafb",
  } as const;
  return (
    <div
      className={`rounded-xl border-2 overflow-hidden bg-white ${
        accent === "amber" ? "border-amber-300" : "border-gray-200"
      }`}
    >
      <div
        className="relative w-full aspect-[5/3] flex items-center justify-center overflow-hidden"
        style={checkered ? checkerStyle : { backgroundColor: "#f9fafb" }}
      >
        {busy && (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin" />
            <div className="text-xs">Processing…</div>
          </div>
        )}
        {!busy && imageUrl && (
          <img
            src={imageUrl}
            alt={title}
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        )}
        {!busy && !imageUrl && (
          <div className="text-xs text-gray-400">Not available</div>
        )}
      </div>
      <div className="p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="text-[11px] text-gray-500 truncate">{subtitle}</div>
        </div>
        <Button
          size="sm"
          disabled={busy || !imageUrl}
          onClick={onPick}
          className={
            accent === "amber"
              ? "bg-amber-500 hover:bg-amber-600 text-white"
              : ""
          }
          variant={accent === "amber" ? "default" : "outline"}
        >
          Use this
        </Button>
      </div>
    </div>
  );
}

function PageWithSignatures({
  src,
  placements,
  sigPng,
  onSigDown,
  onMove,
  onSigUp,
  onResize,
  onRemove,
}: {
  src: string;
  placements: UiPlacement[];
  sigPng: string | null;
  onSigDown: (e: React.PointerEvent, id: string) => void;
  onMove: (e: React.PointerEvent, rect: DOMRect) => void;
  onSigUp: (e: React.PointerEvent) => void;
  onResize: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        if (!ref.current) return;
        onMove(e, ref.current.getBoundingClientRect());
      }}
      onPointerUp={onSigUp}
      className="relative inline-block max-w-full rounded-xl border-2 border-gray-200 overflow-hidden bg-white select-none"
    >
      <img src={src} alt="page" className="block max-w-full h-auto" draggable={false} />
      {sigPng &&
        placements.map((p) => (
          <div
            key={p.id}
            data-sig-id={p.id}
            onPointerDown={(e) => onSigDown(e, p.id)}
            className="absolute cursor-move group"
            style={{
              left: `${p.xPct * 100}%`,
              top: `${p.yPct * 100}%`,
              width: `${p.widthPct * 100}%`,
              touchAction: "none",
            }}
          >
            <img
              src={sigPng}
              alt="sig"
              draggable={false}
              className="w-full h-auto block ring-2 ring-amber-400/60 rounded-sm"
            />
            <div className="absolute -top-7 right-0 hidden group-hover:flex gap-1 bg-white/95 border border-gray-200 rounded-md px-1 py-0.5 shadow">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onResize(p.id, -0.03)}
                className="text-xs font-bold text-gray-700 px-1 hover:text-indigo-600"
              >
                −
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onResize(p.id, 0.03)}
                className="text-xs font-bold text-gray-700 px-1 hover:text-indigo-600"
              >
                +
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onRemove(p.id)}
                className="text-xs text-red-600 px-1 hover:text-red-800"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}
