import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import { ToolLayout } from "@/components/tools/tool-layout";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { getTool } from "@/components/tools/tools-data";
import {
  Loader2,
  Crown,
  Lock,
  Wallet,
  Upload,
  Scissors,
  Image as ImageIcon,
  Sparkles,
  Sliders,
  Type,
  Undo2,
  Redo2,
  Download,
  Eraser,
  Brush,
  RotateCcw,
  X,
  Bold,
  Italic,
  Crop as CropIcon,
  Check,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { useAuth } from "@/hooks/use-auth";
import { useGetMyCredits, getGetMyCreditsQueryKey } from "@workspace/api-client-react";
import { clearBlob } from "@/lib/blob-store";
import { clearDraft } from "@/lib/draft-store";
import { useLanguage } from "@/lib/i18n";
import {
  type EditorState,
  type DesignLayer,
  type BgMode,
  DEFAULT_STATE,
  loadImage,
  renderComposite,
  newId,
  canvasToBlob,
  snapshotMask,
  restoreMask,
} from "@/lib/tools/bg-editor";

// ---------- i18n (inline; do NOT touch lib/i18n.tsx) ---------------
type Lang = "en" | "gu" | "hi";
const T = {
  drop: { en: "Drop your photo here", gu: "ફોટો અહીં મૂકો", hi: "फोटो यहाँ डालें" },
  browse: {
    en: "or click to browse  ·  JPG / PNG  ·  up to 25 MB",
    gu: "અથવા click કરી file પસંદ કરો  ·  JPG / PNG  ·  25 MB સુધી",
    hi: "या क्लिक करें  ·  JPG / PNG  ·  25 MB तक",
  },
  processing: {
    en: "Removing background…",
    gu: "Background દૂર થઈ રહ્યું છે…",
    hi: "बैकग्राउंड हटाया जा रहा है…",
  },
  cutout: { en: "Cutout", gu: "Cutout", hi: "कटआउट" },
  background: { en: "Background", gu: "Background", hi: "बैकग्राउंड" },
  effects: { en: "Effects", gu: "Effects", hi: "इफेक्ट्स" },
  adjust: { en: "Adjust", gu: "Adjust", hi: "एडजस्ट" },
  design: { en: "Design", gu: "Design", hi: "डिज़ाइन" },
  undo: { en: "Undo", gu: "Undo", hi: "वापस" },
  redo: { en: "Redo", gu: "Redo", hi: "आगे" },
  download: { en: "Download", gu: "Download", hi: "डाउनलोड" },
  startOver: { en: "Start over", gu: "ફરી શરૂ કરો", hi: "फिर से शुरू" },
  crop: { en: "Crop", gu: "Crop", hi: "क्रॉप" },
  cropTitle: { en: "Crop image", gu: "ઈમેજ Crop કરો", hi: "इमेज क्रॉप करें" },
  apply: { en: "Apply", gu: "લાગુ કરો", hi: "लागू करें" },
  cancel: { en: "Cancel", gu: "રદ કરો", hi: "रद्द करें" },
  free: { en: "Free", gu: "Free", hi: "फ्री" },
  passport: { en: "Passport", gu: "પાસપોર્ટ", hi: "पासपोर्ट" },
  erase: { en: "Erase", gu: "ભૂંસો", hi: "मिटाएं" },
  restore: { en: "Restore", gu: "પાછું લાવો", hi: "वापस लाएं" },
  brushSize: { en: "Brush size", gu: "Brush size", hi: "ब्रश साइज़" },
  clearBrush: { en: "Clear corrections", gu: "Corrections સાફ કરો", hi: "सुधार मिटाएं" },
  transparent: { en: "Transparent", gu: "Transparent", hi: "पारदर्शी" },
  solidColor: { en: "Solid color", gu: "Color", hi: "रंग" },
  photo: { en: "Photo", gu: "Photo", hi: "फोटो" },
  uploadBg: { en: "Upload background", gu: "Background upload કરો", hi: "बैकग्राउंड अपलोड करें" },
  bgBlur: { en: "Background blur", gu: "Background blur", hi: "बैकग्राउंड ब्लर" },
  shadow: { en: "Drop shadow", gu: "Shadow", hi: "शैडो" },
  shadowSpread: { en: "Shadow spread", gu: "Shadow spread", hi: "शैडो स्प्रेड" },
  brightness: { en: "Brightness", gu: "Brightness", hi: "ब्राइटनेस" },
  contrast: { en: "Contrast", gu: "Contrast", hi: "कंट्रास्ट" },
  saturation: { en: "Saturation", gu: "Saturation", hi: "सैचुरेशन" },
  reset: { en: "Reset", gu: "Reset", hi: "रीसेट" },
  addText: { en: "Add text", gu: "Text ઉમેરો", hi: "टेक्स्ट जोड़ें" },
  text: { en: "Text", gu: "Text", hi: "टेक्स्ट" },
  size: { en: "Size", gu: "Size", hi: "साइज़" },
  color: { en: "Color", gu: "Color", hi: "रंग" },
  delete: { en: "Delete", gu: "Delete", hi: "हटाएं" },
  png: { en: "PNG (transparent)", gu: "PNG (transparent)", hi: "PNG (पारदर्शी)" },
  jpg: { en: "JPG (white BG)", gu: "JPG (સફેદ BG)", hi: "JPG (सफेद BG)" },
  fhd: { en: "FHD · Prime · 1 credit", gu: "FHD · Prime · 1 credit", hi: "FHD · Prime · 1 credit" },
  primeBanner: {
    en: "Prime members get 10 FHD credits per month.",
    gu: "Prime members ને દર મહિને 10 FHD credits મળે છે.",
    hi: "Prime सदस्यों को हर महीने 10 FHD क्रेडिट मिलते हैं।",
  },
  goPrime: { en: "Go Prime", gu: "Prime લો", hi: "Prime लें" },
  remaining: {
    en: "remaining this cycle",
    gu: "આ cycle માં બાકી",
    hi: "इस चक्र में शेष",
  },
};
const L = (lang: Lang, k: keyof typeof T) => T[k][lang];

// ---------------- Background-removal engine -------------------------
async function preResize(file: File): Promise<File> {
  // Aggressive pre-resize so the in-browser model doesn't lock up the
  // main thread on large phone photos (10+ MP). Anything over ~3 MB or
  // beyond 1600px on the longest edge gets shrunk before processing.
  if (file.size <= 3 * 1024 * 1024) return file;
  try {
    const { default: imageCompression } = await import("browser-image-compression");
    const compressed = await imageCompression(file, {
      maxSizeMB: 3,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      initialQuality: 0.92,
    });
    return new File([compressed], file.name, { type: compressed.type || file.type });
  } catch {
    return file;
  }
}
// Detect WebGPU support once. WebGPU runs the ONNX model off the main
// thread on the GPU, which prevents the "Pages Unresponsive" warning
// during background removal. Falls back to CPU/quantized model if not
// available.
function hasWebGPU(): boolean {
  try {
    return typeof (navigator as any)?.gpu?.requestAdapter === "function";
  } catch {
    return false;
  }
}
async function imglyRemove(file: File): Promise<Blob> {
  const resized = await preResize(file);
  const { removeBackground } = await import("@imgly/background-removal");
  const gpu = hasWebGPU();
  try {
    return await removeBackground(resized, {
      // GPU path: full-precision model is fine because the GPU runs it.
      // CPU path: fall back to the quantized 40MB model which is ~3-4x
      // faster on CPU and keeps the browser responsive.
      device: gpu ? "gpu" : "cpu",
      model: gpu ? "isnet_fp16" : "isnet_quint8",
      output: { format: "image/png", quality: 1.0 },
    } as any);
  } catch (e) {
    // GPU init can fail on some drivers/browsers (e.g. headless, Linux
    // with broken Vulkan). Retry once on CPU + quantized model.
    if (gpu) {
      return await removeBackground(resized, {
        device: "cpu",
        model: "isnet_quint8",
        output: { format: "image/png", quality: 1.0 },
      } as any);
    }
    throw e;
  }
}
async function fhdRemove(file: File, token: string): Promise<{ blob: Blob; remaining: number }> {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch("/api/tools/remove-bg-fhd", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    let msg = "FHD download failed";
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {
      /* ignore */
    }
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const remaining = parseInt(res.headers.get("X-Credits-Remaining") || "0", 10);
  return { blob: await res.blob(), remaining };
}

// =================== Component =====================================
type TabKey = "cutout" | "background" | "effects" | "adjust" | "design";

export default function BackgroundRemover() {
  const tool = getTool("background-remover")!;
  const { user } = useAuth();
  const { language } = useLanguage();
  const lang = (language as Lang) || "en";
  const credits = useGetMyCredits({
    query: { enabled: !!user, queryKey: getGetMyCreditsQueryKey() },
  });
  const credBalance = credits.data;
  const refreshCredits = credits.refetch;
  const getToken = () =>
    typeof window !== "undefined" ? sessionStorage.getItem("auth_token") : null;

  // ---- file & images
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0] ?? null;
  const [srcImg, setSrcImg] = useState<HTMLImageElement | null>(null);
  const [cutoutImg, setCutoutImg] = useState<HTMLImageElement | null>(null);
  const [cutoutQuality, setCutoutQuality] = useState<"normal" | "fhd" | null>(null);
  const [busy, setBusy] = useState<"none" | "normal" | "fhd">("none");
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const fhdLockRef = useRef(false);
  // Cancellation guard for async bg-removal: any inflight run whose token
  // doesn't match the current value is treated as stale and discarded.
  const runTokenRef = useRef(0);

  // ---- editor state + history
  const [state, setState] = useState<EditorState>(DEFAULT_STATE);
  const [bgImgEl, setBgImgEl] = useState<HTMLImageElement | null>(null);
  const bgImgUrlRef = useRef<string | null>(null);
  const historyRef = useRef<EditorState[]>([DEFAULT_STATE]);
  const historyIdxRef = useRef(0);
  const [, forceTick] = useState(0);
  const reTick = () => forceTick((n) => n + 1);

  // ---- toolbar
  const [tab, setTab] = useState<TabKey>("cutout");
  const [brushMode, setBrushMode] = useState<"erase" | "restore">("erase");
  const [brushSize, setBrushSize] = useState(40);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropAspect, setCropAspect] = useState<number | undefined>(undefined);
  const [cropRect, setCropRect] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const cropImgRef = useRef<HTMLImageElement | null>(null);
  // srcImg's underlying blob URL is revoked by loadImage after the
  // first decode, so srcImg.src cannot be reused in a new <img> tag
  // (would render broken). When the crop dialog opens we re-export
  // srcImg to a fresh data URL the dialog's <img> can load.
  const [cropDataUrl, setCropDataUrl] = useState<string | null>(null);
  // Percent-crop captured on commit, used as the source of truth for
  // applying the crop across assets that may have different pixel dims
  // (srcImg vs preResized cutoutImg vs brush masks).
  const completedPctRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  // Once the user has cropped the image, the original `file` no longer
  // matches the on-screen image, so FHD (which reprocesses the original
  // file at full size) would replace the cutout with a full-sized one
  // and break alignment. Disable FHD post-crop.
  const [wasCropped, setWasCropped] = useState(false);
  // Stage zoom (1 = fit). Range 0.25..6.
  const [zoom, setZoom] = useState(1);
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 6;

  // ---- canvases
  const stageRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null); // brush cursor preview
  const brushAddRef = useRef<HTMLCanvasElement | null>(null);
  const brushSubRef = useRef<HTMLCanvasElement | null>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);

  // Auto-process is heavy (WASM ML inference). We deliberately do NOT
  // auto-restore any previous draft — opening the page should always show
  // the upload dropzone first, otherwise processing kicks off immediately
  // and the browser shows a "Pages Unresponsive" warning. Clear any
  // leftover draft from older builds on first mount.
  useEffect(() => {
    void clearBlob("bg-remover:source").catch(() => {});
    try {
      clearDraft("bg-remover:source");
    } catch {
      /* ignore */
    }
  }, []);

  // --------- File pickers ---------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const pickFile = useCallback(() => fileInputRef.current?.click(), []);
  const onFileChosen = useCallback((f: File | null | undefined) => {
    if (!f) return;
    if (!/^image\/(jpe?g|png|webp)$/.test(f.type)) {
      setError("Please choose a JPG, PNG or WebP file.");
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      setError("File too big — keep it under 25 MB.");
      return;
    }
    setError(null);
    setFiles([f]);
  }, []);

  // ---- Drag overlay (page-level dropzone before upload) ----
  const [drag, setDrag] = useState(false);

  // ---- Load src image whenever file changes; reset editor; auto-process
  useEffect(() => {
    let cancelled = false;
    // bump the run token so any inflight remove-bg call from a previous file
    // sees its token mismatch and discards its result.
    runTokenRef.current += 1;
    setSrcImg(null);
    setCutoutImg(null);
    setCutoutQuality(null);
    setWasCropped(false);
    setZoom(1);
    setState(DEFAULT_STATE);
    historyRef.current = [DEFAULT_STATE];
    historyIdxRef.current = 0;
    setBgImgEl(null);
    if (bgImgUrlRef.current) {
      URL.revokeObjectURL(bgImgUrlRef.current);
      bgImgUrlRef.current = null;
    }
    if (!file) return;
    (async () => {
      try {
        const img = await loadImage(file);
        if (cancelled) return;
        setSrcImg(img);
        // initialise brush mask canvases at native size
        const a = document.createElement("canvas");
        a.width = img.naturalWidth;
        a.height = img.naturalHeight;
        const s = document.createElement("canvas");
        s.width = img.naturalWidth;
        s.height = img.naturalHeight;
        brushAddRef.current = a;
        brushSubRef.current = s;
        // auto-run free engine
        await runNormal(file, runTokenRef.current);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load image");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Revoke any background-image URL we hold on unmount.
  useEffect(() => {
    return () => {
      if (bgImgUrlRef.current) {
        URL.revokeObjectURL(bgImgUrlRef.current);
        bgImgUrlRef.current = null;
      }
    };
  }, []);

  const runNormal = async (f: File, token: number) => {
    setBusy("normal");
    setError(null);
    let lastErr: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const blob = await imglyRemove(f);
        if (token !== runTokenRef.current) return; // stale
        const img = await loadImage(blob);
        if (token !== runTokenRef.current) return; // stale
        setCutoutImg(img);
        setCutoutQuality("normal");
        setBusy("none");
        return;
      } catch (e: any) {
        lastErr = e;
        console.error(`Normal engine failed (attempt ${attempt + 1}):`, e);
      }
    }
    if (token !== runTokenRef.current) return; // stale
    setBusy("none");
    const msg = (lastErr?.message || String(lastErr || "")).toLowerCase();
    if (msg.includes("network") || msg.includes("fetch") || msg.includes("load")) {
      setError("Couldn't load the in-browser AI model. Check your connection or try FHD.");
    } else if (msg.includes("memory") || msg.includes("oom")) {
      setError("Image is too large for in-browser processing. Use a smaller photo or try FHD.");
    } else {
      setError(`Engine failed: ${lastErr?.message || "unknown error"}.`);
    }
  };

  const runFhd = async () => {
    if (!file) return;
    if (busy !== "none" || fhdLockRef.current) return;
    const token = getToken();
    if (!user || !token) {
      setShowUpgrade(true);
      return;
    }
    if (!credBalance?.isPrime || (credBalance?.credits ?? 0) <= 0) {
      setShowUpgrade(true);
      return;
    }
    fhdLockRef.current = true;
    const myToken = ++runTokenRef.current;
    setBusy("fhd");
    setError(null);
    try {
      const { blob } = await fhdRemove(file, token);
      if (myToken !== runTokenRef.current) return; // stale
      const img = await loadImage(blob);
      if (myToken !== runTokenRef.current) return; // stale
      setCutoutImg(img);
      setCutoutQuality("fhd");
      await refreshCredits();
    } catch (e: any) {
      if (myToken !== runTokenRef.current) return;
      if (e.status === 402) setShowUpgrade(true);
      else setError(e.message || "FHD download failed.");
      await refreshCredits();
    } finally {
      if (myToken === runTokenRef.current) setBusy("none");
      fhdLockRef.current = false;
    }
  };

  // -------- History helpers (synchronous to avoid races with undo/redo) --------
  const pushHistory = useCallback((next: EditorState) => {
    const snap: EditorState = {
      ...next,
      brushAdd: snapshotMask(brushAddRef.current),
      brushSub: snapshotMask(brushSubRef.current),
    };
    const stack = historyRef.current.slice(0, historyIdxRef.current + 1);
    stack.push(snap);
    while (stack.length > 30) stack.shift();
    historyRef.current = stack;
    historyIdxRef.current = stack.length - 1;
    reTick();
  }, []);

  const updateState = useCallback(
    (patch: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) => {
      setState((prev) => {
        const p = typeof patch === "function" ? patch(prev) : patch;
        const next = { ...prev, ...p };
        pushHistory(next);
        return next;
      });
    },
    [pushHistory],
  );

  // Live state update WITHOUT pushing a history entry. Use this for
  // continuous controls (sliders) and pair with `commitHistory()` on
  // release — otherwise every micro-tick of the drag becomes its own
  // undo step and Undo feels broken.
  const updateStateLive = useCallback(
    (patch: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) => {
      setState((prev) => {
        const p = typeof patch === "function" ? patch(prev) : patch;
        return { ...prev, ...p };
      });
    },
    [],
  );

  const commitHistory = useCallback(() => {
    // Snapshot the latest state from React's perspective (use functional
    // setState to read the most up-to-date value).
    setState((cur) => {
      pushHistory(cur);
      return cur;
    });
  }, [pushHistory]);

  // -------- Crop --------
  const openCrop = () => {
    if (!srcImg) return;
    // Re-export srcImg to a fresh data URL — its original blob URL was
    // revoked after first decode, so we can't reuse srcImg.src directly.
    // Downscale the preview if the natural image is huge, to keep the
    // dialog snappy. Crop math still uses percent against natural dims.
    const MAX = 1600;
    const ratio = srcImg.naturalWidth / srcImg.naturalHeight;
    let pw = srcImg.naturalWidth;
    let ph = srcImg.naturalHeight;
    if (pw > MAX || ph > MAX) {
      if (ratio >= 1) {
        pw = MAX;
        ph = Math.round(MAX / ratio);
      } else {
        ph = MAX;
        pw = Math.round(MAX * ratio);
      }
    }
    const c = document.createElement("canvas");
    c.width = pw;
    c.height = ph;
    const cx = c.getContext("2d");
    if (cx) cx.drawImage(srcImg, 0, 0, pw, ph);
    setCropDataUrl(c.toDataURL("image/jpeg", 0.9));
    setCropAspect(undefined);
    setCropRect(undefined);
    setCompletedCrop(undefined);
    setCropOpen(true);
  };

  const onCropImgLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      cropImgRef.current = img;
      // Default crop = 90% centered.
      const initial = centerCrop(
        cropAspect
          ? makeAspectCrop({ unit: "%", width: 90 }, cropAspect, img.width, img.height)
          : { unit: "%" as const, x: 5, y: 5, width: 90, height: 90 },
        img.width,
        img.height,
      );
      setCropRect(initial);
    },
    [cropAspect],
  );

  const applyCrop = useCallback(async () => {
    const pct = completedPctRef.current;
    if (!pct || !srcImg || !cutoutImg) {
      setCropOpen(false);
      return;
    }
    if (pct.w <= 0 || pct.h <= 0) {
      setCropOpen(false);
      return;
    }

    // For each asset, derive its own pixel rect from the percent crop —
    // assets may have different natural dims (e.g. cutoutImg from a
    // preResized file is smaller than the full srcImg) and reusing one
    // pixel rect across all of them would crop the wrong region.
    const rectFor = (W: number, H: number) => {
      const x = Math.max(0, Math.min(W - 1, Math.round((pct.x / 100) * W)));
      const y = Math.max(0, Math.min(H - 1, Math.round((pct.y / 100) * H)));
      const w = Math.max(1, Math.min(W - x, Math.round((pct.w / 100) * W)));
      const h = Math.max(1, Math.min(H - y, Math.round((pct.h / 100) * H)));
      return { x, y, w, h };
    };

    const cropToCanvas = (
      source: CanvasImageSource,
      sw: number,
      sh: number,
    ): HTMLCanvasElement => {
      const r = rectFor(sw, sh);
      const out = document.createElement("canvas");
      out.width = r.w;
      out.height = r.h;
      const ctx = out.getContext("2d");
      if (ctx) ctx.drawImage(source, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      return out;
    };

    const srcCan = cropToCanvas(srcImg, srcImg.naturalWidth, srcImg.naturalHeight);
    const cutCan = cropToCanvas(cutoutImg, cutoutImg.naturalWidth, cutoutImg.naturalHeight);
    const newSrc = await loadImage(srcCan.toDataURL("image/png"));
    const newCut = await loadImage(cutCan.toDataURL("image/png"));

    // Crop brush masks using each canvas's own pixel grid.
    for (const ref of [brushAddRef, brushSubRef]) {
      const old = ref.current;
      if (!old || old.width === 0 || old.height === 0) continue;
      ref.current = cropToCanvas(old, old.width, old.height);
    }

    setSrcImg(newSrc);
    setCutoutImg(newCut);
    setWasCropped(true);
    setZoom(1);

    // Reset history with the new state as the only entry — crop
    // changes pixel-level images that aren't part of EditorState, so
    // attempting to undo across a crop would leave src/cutout/masks
    // misaligned with prior snapshots.
    setState((cur) => {
      historyRef.current = [cur];
      historyIdxRef.current = 0;
      reTick();
      return cur;
    });
    setCropOpen(false);
  }, [srcImg, cutoutImg]);

  const canUndo = historyIdxRef.current > 0;
  const canRedo = historyIdxRef.current < historyRef.current.length - 1;

  // Track a render version that bumps after async mask restores so the
  // stage re-renders even though state object reference hasn't changed.
  const [renderVer, setRenderVer] = useState(0);

  const doUndo = useCallback(async () => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    const snap = historyRef.current[historyIdxRef.current];
    setState(snap);
    if (brushAddRef.current) await restoreMask(snap.brushAdd, brushAddRef.current);
    if (brushSubRef.current) await restoreMask(snap.brushSub, brushSubRef.current);
    setRenderVer((v) => v + 1);
    reTick();
  }, []);
  const doRedo = useCallback(async () => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    const snap = historyRef.current[historyIdxRef.current];
    setState(snap);
    if (brushAddRef.current) await restoreMask(snap.brushAdd, brushAddRef.current);
    if (brushSubRef.current) await restoreMask(snap.brushSub, brushSubRef.current);
    setRenderVer((v) => v + 1);
    reTick();
  }, []);

  // -------- Render to stage canvas (re-fit) --------
  const renderStage = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !cutoutImg) return;
    // Native composite
    const off = document.createElement("canvas");
    renderComposite({
      out: off,
      cutout: cutoutImg,
      source: srcImg,
      brushAdd: brushAddRef.current,
      brushSub: brushSubRef.current,
      state,
      bgImage: bgImgEl,
    });
    // Fit to wrap width while preserving aspect
    const wrap = stageWrapRef.current;
    const maxW = wrap?.clientWidth ?? 800;
    const maxH = wrap?.clientHeight ?? 600;
    const ratio = off.width / off.height;
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    // Apply zoom on top of fit. Backing store also scales with zoom so
    // text/edges stay crisp when zoomed in for deep editing.
    const dispW = w * zoom;
    const dispH = h * zoom;
    stage.width = Math.round(dispW * window.devicePixelRatio);
    stage.height = Math.round(dispH * window.devicePixelRatio);
    stage.style.width = `${dispW}px`;
    stage.style.height = `${dispH}px`;
    const ctx = stage.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, stage.width, stage.height);
    ctx.drawImage(off, 0, 0, stage.width, stage.height);
    // sync overlay size
    const ov = overlayRef.current;
    if (ov) {
      ov.width = stage.width;
      ov.height = stage.height;
      ov.style.width = stage.style.width;
      ov.style.height = stage.style.height;
    }
  }, [cutoutImg, srcImg, state, bgImgEl, renderVer, zoom]);

  useEffect(() => {
    renderStage();
  }, [renderStage]);

  useEffect(() => {
    const onResize = () => renderStage();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [renderStage]);

  // -------- Brush painting on stage --------
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);

  const stageToImage = (clientX: number, clientY: number) => {
    const stage = stageRef.current;
    const cut = cutoutImg;
    if (!stage || !cut) return null;
    const rect = stage.getBoundingClientRect();
    const u = (clientX - rect.left) / rect.width;
    const v = (clientY - rect.top) / rect.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    return { x: u * cut.naturalWidth, y: v * cut.naturalHeight };
  };

  const drawBrushDot = (x: number, y: number) => {
    const target = brushMode === "erase" ? brushSubRef.current : brushAddRef.current;
    const opposite = brushMode === "erase" ? brushAddRef.current : brushSubRef.current;
    if (!target || !cutoutImg) return;
    const ctx = target.getContext("2d");
    if (!ctx) return;
    const stage = stageRef.current;
    const scale = stage ? cutoutImg.naturalWidth / parseFloat(stage.style.width || "1") : 1;
    const r = brushSize * scale;
    // Paint into the active mask
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // Latest-stroke-wins: clear the same area from the opposing mask so
    // erase strokes always defeat earlier restore strokes (and vice versa).
    if (opposite) {
      const octx = opposite.getContext("2d");
      if (octx) {
        octx.save();
        octx.globalCompositeOperation = "destination-out";
        octx.beginPath();
        octx.arc(x, y, r, 0, Math.PI * 2);
        octx.fill();
        octx.restore();
      }
    }
  };

  const drawCursor = (clientX: number, clientY: number) => {
    const ov = overlayRef.current;
    if (!ov) return;
    const ctx = ov.getContext("2d")!;
    ctx.clearRect(0, 0, ov.width, ov.height);
    if (tab !== "cutout") return;
    const rect = ov.getBoundingClientRect();
    const cx = (clientX - rect.left) * (ov.width / rect.width);
    const cy = (clientY - rect.top) * (ov.height / rect.height);
    ctx.beginPath();
    ctx.arc(cx, cy, brushSize * (ov.width / rect.width), 0, Math.PI * 2);
    ctx.strokeStyle = brushMode === "erase" ? "rgba(220,38,38,0.9)" : "rgba(34,197,94,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  const onStagePointerDown = (e: React.PointerEvent) => {
    if (tab !== "cutout") return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = stageToImage(e.clientX, e.clientY);
    if (!p) return;
    drawBrushDot(p.x, p.y);
    lastPtRef.current = p;
    renderStage();
  };
  const onStagePointerMove = (e: React.PointerEvent) => {
    drawCursor(e.clientX, e.clientY);
    if (!drawingRef.current) return;
    const p = stageToImage(e.clientX, e.clientY);
    if (!p) return;
    // interpolate between last & current to make a continuous stroke
    const last = lastPtRef.current;
    if (last) {
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const dist = Math.hypot(dx, dy);
      const step = Math.max(2, brushSize * 0.5);
      const n = Math.ceil(dist / step);
      for (let i = 1; i <= n; i++) {
        drawBrushDot(last.x + (dx * i) / n, last.y + (dy * i) / n);
      }
    } else {
      drawBrushDot(p.x, p.y);
    }
    lastPtRef.current = p;
    renderStage();
  };
  const onStagePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPtRef.current = null;
    pushHistory(state);
  };
  const onStagePointerLeave = () => {
    const ov = overlayRef.current;
    if (ov) ov.getContext("2d")!.clearRect(0, 0, ov.width, ov.height);
  };

  const clearBrushCorrections = () => {
    if (brushAddRef.current) {
      const ctx = brushAddRef.current.getContext("2d")!;
      ctx.clearRect(0, 0, brushAddRef.current.width, brushAddRef.current.height);
    }
    if (brushSubRef.current) {
      const ctx = brushSubRef.current.getContext("2d")!;
      ctx.clearRect(0, 0, brushSubRef.current.width, brushSubRef.current.height);
    }
    pushHistory(state);
    setRenderVer((v) => v + 1);
  };

  // -------- Background photo upload --------
  const onPickBg = useCallback(
    async (f: File | null | undefined) => {
      if (!f) return;
      // Revoke any previous bg URL we held before swapping it out.
      if (bgImgUrlRef.current) {
        URL.revokeObjectURL(bgImgUrlRef.current);
        bgImgUrlRef.current = null;
      }
      const url = URL.createObjectURL(f);
      bgImgUrlRef.current = url;
      try {
        const img = await loadImage(url);
        setBgImgEl(img);
        updateState({ bg: { ...state.bg, mode: "image", imageUrl: url } });
      } catch {
        setError("Couldn't load that background image.");
        if (bgImgUrlRef.current === url) {
          URL.revokeObjectURL(url);
          bgImgUrlRef.current = null;
        }
      }
    },
    [state.bg, updateState],
  );

  // -------- Design layer ops --------
  const addText = () => {
    const layer: DesignLayer = {
      id: newId(),
      type: "text",
      text: "Smit CSC Info",
      x: 0.5,
      y: 0.9,
      fontSize: cutoutImg ? Math.round(cutoutImg.naturalHeight * 0.06) : 48,
      color: "#ffffff",
      fontWeight: "bold",
      fontStyle: "normal",
      fontFamily: "Inter, system-ui, sans-serif",
    };
    updateState({ design: [...state.design, layer] });
  };
  const updateLayer = (id: string, patch: Partial<DesignLayer>) => {
    updateState({
      design: state.design.map((l) =>
        l.id === id ? ({ ...l, ...patch } as DesignLayer) : l,
      ),
    });
  };
  const updateLayerLive = (id: string, patch: Partial<DesignLayer>) => {
    updateStateLive((prev) => ({
      design: prev.design.map((l) =>
        l.id === id ? ({ ...l, ...patch } as DesignLayer) : l,
      ),
    }));
  };
  const deleteLayer = (id: string) =>
    updateState({ design: state.design.filter((l) => l.id !== id) });

  // -------- Download --------
  const exportBlob = async (kind: "png" | "jpg") => {
    if (!cutoutImg) return null;
    const off = document.createElement("canvas");
    renderComposite({
      out: off,
      cutout: cutoutImg,
      source: srcImg,
      brushAdd: brushAddRef.current,
      brushSub: brushSubRef.current,
      state:
        kind === "jpg" && state.bg.mode === "transparent"
          ? { ...state, bg: { ...state.bg, mode: "color", color: "#ffffff" } }
          : state,
      bgImage: bgImgEl,
    });
    return await canvasToBlob(off, kind === "png" ? "image/png" : "image/jpeg", 0.95);
  };

  const doDownload = async (kind: "png" | "jpg") => {
    const blob = await exportBlob(kind);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const base =
      cutoutQuality === "fhd"
        ? `bg-removed-fhd.${kind}`
        : `bg-removed.${kind}`;
    a.download = base;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ------- Render guards -------
  const empty = !file;

  // =================== JSX ==================================
  return (
    <ToolLayout tool={tool} fullBleed={!empty}>
      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => onFileChosen(e.target.files?.[0])}
        data-testid="file-input"
      />
      <input
        ref={bgInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => onPickBg(e.target.files?.[0])}
        data-testid="bg-input"
      />

      {/* Credits banner */}
      {user && credBalance && (
        <div
          className={`mt-2 mb-3 flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${
            credBalance.isPrime
              ? "bg-amber-50 border-amber-200"
              : "bg-gray-50 border-gray-200"
          }`}
          data-testid="credits-banner"
        >
          {credBalance.isPrime ? (
            <Crown className="h-4 w-4 text-amber-600 flex-shrink-0" />
          ) : (
            <Lock className="h-4 w-4 text-gray-500 flex-shrink-0" />
          )}
          <div className="flex-1">
            {credBalance.isPrime ? (
              <>
                <span className="font-bold text-amber-900" data-testid="credits-count">
                  {credBalance.credits} / {credBalance.monthlyAllowance} FHD credits
                </span>{" "}
                <span className="text-amber-700">{L(lang, "remaining")}</span>
              </>
            ) : (
              <span className="font-semibold text-gray-700">{L(lang, "primeBanner")}</span>
            )}
          </div>
          {!credBalance.isPrime && (
            <Link href="/membership">
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white font-bold">
                {L(lang, "goPrime")}
              </Button>
            </Link>
          )}
        </div>
      )}

      {empty ? (
        // ------- Pre-upload dropzone -------
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            onFileChosen(e.dataTransfer.files?.[0]);
          }}
          onClick={pickFile}
          className={`mt-4 cursor-pointer rounded-2xl border-2 border-dashed transition-all p-12 sm:p-16 text-center ${
            drag
              ? "border-indigo-500 bg-indigo-50"
              : "border-gray-300 bg-gradient-to-br from-violet-50/50 to-white hover:border-indigo-400 hover:bg-indigo-50/30"
          }`}
          data-testid="dropzone"
        >
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-lg mb-4">
            <Upload className="h-8 w-8 text-white" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-gray-900">{L(lang, "drop")}</div>
          <div className="text-sm text-gray-500 mt-1">{L(lang, "browse")}</div>
          {error && (
            <div className="mt-4 inline-block px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>
      ) : (
        // ------- Editor -------
        <div className="flex flex-col gap-3">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-white p-1.5 shadow-sm sticky top-0 z-10">
            <ToolbarTab
              icon={Scissors}
              label={L(lang, "cutout")}
              active={tab === "cutout"}
              onClick={() => setTab("cutout")}
            />
            <ToolbarTab
              icon={ImageIcon}
              label={L(lang, "background")}
              active={tab === "background"}
              onClick={() => setTab("background")}
            />
            <ToolbarTab
              icon={Sparkles}
              label={L(lang, "effects")}
              active={tab === "effects"}
              onClick={() => setTab("effects")}
            />
            <ToolbarTab
              icon={Sliders}
              label={L(lang, "adjust")}
              active={tab === "adjust"}
              onClick={() => setTab("adjust")}
            />
            <ToolbarTab
              icon={Type}
              label={L(lang, "design")}
              active={tab === "design"}
              onClick={() => setTab("design")}
            />
            <div className="mx-1 h-6 w-px bg-gray-200" />
            <button
              onClick={doUndo}
              disabled={!canUndo}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="btn-undo"
              title={L(lang, "undo")}
            >
              <Undo2 className="h-4 w-4" />
              <span className="hidden sm:inline">{L(lang, "undo")}</span>
            </button>
            <button
              onClick={doRedo}
              disabled={!canRedo}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="btn-redo"
              title={L(lang, "redo")}
            >
              <Redo2 className="h-4 w-4" />
              <span className="hidden sm:inline">{L(lang, "redo")}</span>
            </button>
            <div className="mx-1 h-6 w-px bg-gray-200" />
            <button
              onClick={openCrop}
              disabled={!srcImg || busy !== "none"}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="btn-crop"
              title={L(lang, "crop")}
            >
              <CropIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{L(lang, "crop")}</span>
            </button>
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFiles([]);
                }}
                data-testid="btn-start-over"
                className="text-gray-600"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">{L(lang, "startOver")}</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    disabled={!cutoutImg || busy !== "none"}
                    className="bg-gradient-to-r from-indigo-600 to-violet-700 text-white font-bold"
                    data-testid="btn-download"
                  >
                    <Download className="h-4 w-4 mr-1.5" />
                    {L(lang, "download")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => doDownload("png")}
                    data-testid="dl-png"
                  >
                    <ImageIcon className="h-4 w-4 mr-2 text-indigo-600" />
                    {L(lang, "png")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => doDownload("jpg")} data-testid="dl-jpg">
                    <ImageIcon className="h-4 w-4 mr-2 text-emerald-600" />
                    {L(lang, "jpg")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={runFhd}
                    disabled={cutoutQuality === "fhd" || busy !== "none" || wasCropped}
                    data-testid="dl-fhd"
                    title={wasCropped ? "FHD is unavailable after crop. Use Start over to reload original." : undefined}
                  >
                    <Crown className="h-4 w-4 mr-2 text-amber-600" />
                    {L(lang, "fhd")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Stage + side panel */}
          <div className="grid lg:grid-cols-[1fr_320px] gap-3">
            <div className="flex flex-col gap-2">
            <div
              ref={stageWrapRef}
              className="relative min-h-[60vh] max-h-[80vh] overflow-auto flex items-center justify-center rounded-xl border bg-[length:16px_16px]"
              style={{
                backgroundImage:
                  "repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%)",
                backgroundPosition: "0 0, 8px 8px",
              }}
            >
              {/* processing overlay */}
              {busy !== "none" && (
                <div
                  className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-[2px] rounded-xl"
                  data-testid="processing-overlay"
                >
                  <div className="flex flex-col items-center gap-2 text-indigo-700">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <div className="text-sm font-semibold">
                      {busy === "fhd" ? "FHD…" : L(lang, "processing")}
                    </div>
                  </div>
                </div>
              )}
              {/* preview canvas */}
              <canvas
                ref={stageRef}
                onPointerDown={onStagePointerDown}
                onPointerMove={onStagePointerMove}
                onPointerUp={onStagePointerUp}
                onPointerLeave={onStagePointerLeave}
                className="block"
                style={{ touchAction: "none", cursor: tab === "cutout" ? "none" : "default" }}
                data-testid="stage"
              />
              {/* brush cursor overlay */}
              <canvas
                ref={overlayRef}
                className="block absolute pointer-events-none"
                style={{ touchAction: "none" }}
              />
              {error && (
                <div className="absolute bottom-3 left-3 right-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {error}
                </div>
              )}
            </div>

            {/* Zoom toolbar — deep editing aid */}
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border bg-white">
              <button
                onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - 0.25).toFixed(2)))}
                disabled={!cutoutImg || zoom <= ZOOM_MIN}
                className="p-1.5 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="btn-zoom-out"
                title="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <input
                type="range"
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                disabled={!cutoutImg}
                className="flex-1 accent-indigo-600"
                data-testid="zoom-slider"
              />
              <button
                onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + 0.25).toFixed(2)))}
                disabled={!cutoutImg || zoom >= ZOOM_MAX}
                className="p-1.5 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="btn-zoom-in"
                title="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <div className="w-12 text-center text-[11px] font-semibold text-gray-700 tabular-nums">
                {Math.round(zoom * 100)}%
              </div>
              <button
                onClick={() => setZoom(1)}
                disabled={!cutoutImg || zoom === 1}
                className="p-1.5 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="btn-zoom-fit"
                title="Fit"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
            </div>

            {/* Side panel */}
            <div className="rounded-xl border bg-white p-3 sm:p-4 max-h-[80vh] overflow-y-auto">
              {tab === "cutout" && (
                <CutoutPanel
                  lang={lang}
                  brushMode={brushMode}
                  setBrushMode={setBrushMode}
                  brushSize={brushSize}
                  setBrushSize={setBrushSize}
                  onClear={clearBrushCorrections}
                />
              )}
              {tab === "background" && (
                <BackgroundPanel
                  lang={lang}
                  state={state}
                  updateState={updateState}
                  onPickPhoto={() => bgInputRef.current?.click()}
                  setBgImgEl={setBgImgEl}
                />
              )}
              {tab === "effects" && (
                <EffectsPanel
                  lang={lang}
                  state={state}
                  updateStateLive={updateStateLive}
                  commitHistory={commitHistory}
                />
              )}
              {tab === "adjust" && (
                <AdjustPanel
                  lang={lang}
                  state={state}
                  updateStateLive={updateStateLive}
                  commitHistory={commitHistory}
                />
              )}
              {tab === "design" && (
                <DesignPanel
                  lang={lang}
                  state={state}
                  onAddText={addText}
                  onUpdate={updateLayer}
                  onUpdateLive={updateLayerLive}
                  commitHistory={commitHistory}
                  onDelete={deleteLayer}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Crop modal */}
      <Dialog open={cropOpen} onOpenChange={setCropOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CropIcon className="h-5 w-5 text-indigo-600" />
              {L(lang, "cropTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: "free", label: L(lang, "free"), aspect: undefined as number | undefined },
              { key: "passport", label: `${L(lang, "passport")} 35:45`, aspect: 35 / 45 },
              { key: "1:1", label: "1:1", aspect: 1 },
              { key: "4:5", label: "4:5", aspect: 4 / 5 },
              { key: "3:4", label: "3:4", aspect: 3 / 4 },
              { key: "16:9", label: "16:9", aspect: 16 / 9 },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => {
                  setCropAspect(opt.aspect);
                  // Re-init the crop rect (in %) using the new aspect against
                  // the currently displayed image. Also seed completedPctRef
                  // and completedCrop so Apply uses the freshly chosen rect
                  // even if the user doesn't drag afterwards.
                  const img = cropImgRef.current;
                  if (!img) return;
                  const next = centerCrop(
                    opt.aspect
                      ? makeAspectCrop({ unit: "%", width: 90 }, opt.aspect, img.width, img.height)
                      : { unit: "%" as const, x: 5, y: 5, width: 90, height: 90 },
                    img.width,
                    img.height,
                  );
                  setCropRect(next);
                  // next is in %, derive a px PixelCrop for ReactCrop's
                  // completed callback shape too.
                  const pxW = (next.width / 100) * img.width;
                  const pxH = (next.height / 100) * img.height;
                  const pxX = (next.x / 100) * img.width;
                  const pxY = (next.y / 100) * img.height;
                  setCompletedCrop({
                    unit: "px",
                    x: pxX,
                    y: pxY,
                    width: pxW,
                    height: pxH,
                  });
                  completedPctRef.current = {
                    x: next.x,
                    y: next.y,
                    w: next.width,
                    h: next.height,
                  };
                }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  cropAspect === opt.aspect
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-700 border-gray-300 hover:border-indigo-400"
                }`}
                data-testid={`crop-aspect-${opt.key}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-center bg-gray-100 rounded-lg p-2 max-h-[60vh] overflow-auto">
            {cropDataUrl && (
              <ReactCrop
                crop={cropRect}
                onChange={(_, pct) => setCropRect(pct)}
                onComplete={(_pixel, pct) => {
                  setCompletedCrop(_pixel);
                  completedPctRef.current = {
                    x: pct.x,
                    y: pct.y,
                    w: pct.width,
                    h: pct.height,
                  };
                }}
                aspect={cropAspect}
                keepSelection
              >
                <img
                  src={cropDataUrl}
                  alt="crop source"
                  onLoad={onCropImgLoad}
                  style={{ maxHeight: "55vh", display: "block" }}
                />
              </ReactCrop>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCropOpen(false)} data-testid="btn-crop-cancel">
              <X className="h-4 w-4 mr-1.5" />
              {L(lang, "cancel")}
            </Button>
            <Button
              onClick={applyCrop}
              disabled={!completedCrop || completedCrop.width < 4 || completedCrop.height < 4}
              className="bg-gradient-to-r from-indigo-600 to-violet-700 text-white font-bold"
              data-testid="btn-crop-apply"
            >
              <Check className="h-4 w-4 mr-1.5" />
              {L(lang, "apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade modal */}
      <Dialog open={showUpgrade} onOpenChange={setShowUpgrade}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              Upgrade to Prime for HD Download
            </DialogTitle>
            <DialogDescription>
              {!user
                ? "Please log in or create an account to use FHD downloads."
                : !credBalance?.isPrime
                  ? "FHD downloads use a studio-grade engine and are reserved for Prime members."
                  : "You've used all your FHD credits for this cycle."}
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <Wallet className="h-4 w-4 inline mr-1.5 text-amber-600" />
            Prime includes <span className="font-bold">10 FHD credits / month</span>, premium
            content library, certificates, and more.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpgrade(false)}>
              Maybe later
            </Button>
            {!user ? (
              <Link href="/login">
                <Button className="bg-gradient-to-r from-indigo-600 to-violet-700 text-white font-bold">
                  Log in
                </Button>
              </Link>
            ) : (
              <Link href="/membership">
                <Button className="bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold">
                  {credBalance?.isPrime ? "Renew Prime" : "Go Prime"}
                </Button>
              </Link>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ToolLayout>
  );
}

// =================== Toolbar tab button ============================
function ToolbarTab(props: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = props.icon;
  return (
    <button
      onClick={props.onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
        props.active
          ? "bg-indigo-100 text-indigo-700"
          : "text-gray-600 hover:bg-gray-100"
      }`}
      data-testid={`tab-${props.label.toLowerCase()}`}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{props.label}</span>
    </button>
  );
}

// =================== Side panels ===================================
function PanelSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function CutoutPanel(props: {
  lang: Lang;
  brushMode: "erase" | "restore";
  setBrushMode: (m: "erase" | "restore") => void;
  brushSize: number;
  setBrushSize: (n: number) => void;
  onClear: () => void;
}) {
  const { lang, brushMode, setBrushMode, brushSize, setBrushSize, onClear } = props;
  return (
    <>
      <PanelSection title={L(lang, "cutout")}>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setBrushMode("erase")}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border-2 transition-all ${
              brushMode === "erase"
                ? "border-rose-500 bg-rose-50 text-rose-700"
                : "border-gray-200 bg-white text-gray-600 hover:border-rose-200"
            }`}
            data-testid="brush-erase"
          >
            <Eraser className="h-4 w-4" />
            {L(lang, "erase")}
          </button>
          <button
            onClick={() => setBrushMode("restore")}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border-2 transition-all ${
              brushMode === "restore"
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-white text-gray-600 hover:border-emerald-200"
            }`}
            data-testid="brush-restore"
          >
            <Brush className="h-4 w-4" />
            {L(lang, "restore")}
          </button>
        </div>
      </PanelSection>
      <PanelSection title={`${L(lang, "brushSize")}  ·  ${brushSize}px`}>
        <Slider
          value={[brushSize]}
          min={5}
          max={120}
          step={1}
          onValueChange={(v) => setBrushSize(v[0])}
          data-testid="brush-size-slider"
        />
      </PanelSection>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={onClear}
        data-testid="btn-clear-brush"
      >
        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
        {L(lang, "clearBrush")}
      </Button>
    </>
  );
}

type UnsplashHit = {
  id: string;
  thumb: string;
  small: string;
  regular: string;
  full: string;
  alt: string;
  color: string | null;
  downloadLocation: string;
  photographer: { name: string; username: string; profile: string };
};

const PASSPORT_BG_PRESETS: Array<{ key: string; en: string; gu: string; hi: string; query: string }> = [
  { key: "studio", en: "Studio", gu: "સ્ટુડિયો", hi: "स्टूडियो", query: "studio backdrop seamless" },
  { key: "plain", en: "Plain", gu: "પ્લેન", hi: "प्लेन", query: "plain solid color background" },
  { key: "office", en: "Office", gu: "ઓફિસ", hi: "ऑफिस", query: "office wall blurred professional" },
  { key: "sky", en: "Sky", gu: "આકાશ", hi: "आसमान", query: "blue sky clouds" },
  { key: "gradient", en: "Gradient", gu: "ગ્રેડિએન્ટ", hi: "ग्रेडिएंट", query: "gradient pastel background" },
  { key: "nature", en: "Nature", gu: "પ્રકૃતિ", hi: "प्रकृति", query: "blurred nature bokeh background" },
  { key: "library", en: "Library", gu: "લાઇબ્રેરી", hi: "पुस्तकालय", query: "bookshelf library blurred" },
  { key: "wall", en: "Wall", gu: "દિવાલ", hi: "दीवार", query: "textured wall background" },
];

function BackgroundPanel(props: {
  lang: Lang;
  state: EditorState;
  updateState: (p: Partial<EditorState>) => void;
  onPickPhoto: () => void;
  setBgImgEl: (img: HTMLImageElement | null) => void;
}) {
  const { lang, state, updateState, onPickPhoto, setBgImgEl } = props;
  const setMode = (mode: BgMode) => {
    if (mode !== "image") setBgImgEl(null);
    updateState({ bg: { ...state.bg, mode } });
  };
  const onPhotoTab = () => {
    // Just enter image mode and let the gallery show below — do NOT open
    // the file picker here; users can still upload via the dedicated
    // "Upload your own" button.
    updateState({ bg: { ...state.bg, mode: "image" } });
  };
  return (
    <>
      <PanelSection title={L(lang, "background")}>
        <div className="grid grid-cols-3 gap-2">
          {(["transparent", "color", "image"] as const).map((m) => (
            <button
              key={m}
              onClick={() => (m === "image" ? onPhotoTab() : setMode(m))}
              className={`flex flex-col items-center gap-1 py-2.5 rounded-lg text-[11px] font-semibold border-2 transition-all ${
                state.bg.mode === m
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200"
              }`}
              data-testid={`bg-${m}`}
            >
              {m === "transparent" && (
                <div className="h-7 w-7 rounded border bg-[length:8px_8px]" style={{
                  backgroundImage:
                    "repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%)",
                }} />
              )}
              {m === "color" && (
                <div
                  className="h-7 w-7 rounded border"
                  style={{ background: state.bg.color }}
                />
              )}
              {m === "image" && (
                <ImageIcon className="h-7 w-7 text-gray-500" />
              )}
              {L(lang, m === "transparent" ? "transparent" : m === "color" ? "solidColor" : "photo")}
            </button>
          ))}
        </div>
      </PanelSection>
      {state.bg.mode === "color" && (
        <PanelSection title={L(lang, "color")}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={state.bg.color}
              onChange={(e) =>
                updateState({ bg: { ...state.bg, color: e.target.value } })
              }
              className="h-10 w-14 rounded border"
              data-testid="bg-color-picker"
            />
            <Input
              value={state.bg.color}
              onChange={(e) =>
                updateState({ bg: { ...state.bg, color: e.target.value } })
              }
              className="font-mono text-sm"
            />
          </div>
          <div className="grid grid-cols-8 gap-1.5 mt-3">
            {[
              "#ffffff",
              "#000000",
              "#ef4444",
              "#f97316",
              "#eab308",
              "#22c55e",
              "#06b6d4",
              "#3b82f6",
              "#8b5cf6",
              "#ec4899",
              "#78716c",
              "#a3a3a3",
              "#fde68a",
              "#fecaca",
              "#bbf7d0",
              "#bae6fd",
            ].map((c) => (
              <button
                key={c}
                onClick={() => updateState({ bg: { ...state.bg, color: c } })}
                className="aspect-square rounded border hover:scale-110 transition-transform"
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </PanelSection>
      )}
      {state.bg.mode === "image" && (
        <UnsplashBgGallery
          lang={lang}
          onPickUrl={async (hit) => {
            try {
              // Track download per Unsplash ToS (fire-and-forget).
              fetch(
                `/api/unsplash/track-download?url=${encodeURIComponent(hit.downloadLocation)}`,
              ).catch(() => {});
              // Fetch as blob → load via blob URL so the canvas stays
              // un-tainted and PNG/JPG/PDF export works.
              const r = await fetch(hit.regular, { mode: "cors" });
              if (!r.ok) throw new Error(`fetch_failed:${r.status}`);
              const blob = await r.blob();
              const url = URL.createObjectURL(blob);
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.onload = () => {
                setBgImgEl(img);
                URL.revokeObjectURL(url);
              };
              img.onerror = () => URL.revokeObjectURL(url);
              img.src = url;
            } catch {
              /* user can retry */
            }
          }}
          onUploadOwn={onPickPhoto}
        />
      )}
    </>
  );
}

function UnsplashBgGallery(props: {
  lang: Lang;
  onPickUrl: (hit: UnsplashHit) => void;
  onUploadOwn: () => void;
}) {
  const { lang, onPickUrl, onUploadOwn } = props;
  const [activePreset, setActivePreset] = useState<string>("studio");
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<UnsplashHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tokenRef = useRef(0);

  const presetLabel = (p: (typeof PASSPORT_BG_PRESETS)[number]) =>
    lang === "gu" ? p.gu : lang === "hi" ? p.hi : p.en;

  const runQuery = useCallback(async (q: string) => {
    if (!q.trim()) return;
    const myToken = ++tokenRef.current;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/unsplash/search?q=${encodeURIComponent(q)}&per_page=24&orientation=portrait`,
      );
      if (myToken !== tokenRef.current) return;
      if (!r.ok) {
        if (r.status === 503) {
          setErr(
            lang === "gu"
              ? "Unsplash હાલ ઉપલબ્ધ નથી (admin ને UNSPLASH_ACCESS_KEY સેટ કરવા કહો)."
              : lang === "hi"
                ? "Unsplash उपलब्ध नहीं है (admin से UNSPLASH_ACCESS_KEY सेट करने को कहें)."
                : "Unsplash unavailable (ask admin to set UNSPLASH_ACCESS_KEY).",
          );
        } else {
          setErr(`error_${r.status}`);
        }
        setHits([]);
        return;
      }
      const data = (await r.json()) as { results: UnsplashHit[] };
      if (myToken !== tokenRef.current) return;
      setHits(data.results || []);
    } catch (e: any) {
      if (myToken !== tokenRef.current) return;
      setErr(e?.message || "fetch_failed");
      setHits([]);
    } finally {
      if (myToken === tokenRef.current) setLoading(false);
    }
  }, [lang]);

  // initial + preset change
  useEffect(() => {
    const p = PASSPORT_BG_PRESETS.find((x) => x.key === activePreset);
    if (p) void runQuery(p.query);
  }, [activePreset, runQuery]);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      setActivePreset("");
      void runQuery(search.trim());
    }
  };

  const labels = {
    title: lang === "gu" ? "બેકગ્રાઉન્ડ ગેલેરી" : lang === "hi" ? "बैकग्राउंड गैलरी" : "Background gallery",
    searchPh: lang === "gu" ? "શોધો…" : lang === "hi" ? "खोजें…" : "Search…",
    upload: lang === "gu" ? "મારો ફોટો અપલોડ કરો" : lang === "hi" ? "मेरा फ़ोटो अपलोड करें" : "Upload your own",
    loading: lang === "gu" ? "લોડ થઈ રહ્યું છે…" : lang === "hi" ? "लोड हो रहा है…" : "Loading…",
    empty: lang === "gu" ? "કોઈ પરિણામ નથી" : lang === "hi" ? "कोई परिणाम नहीं" : "No results",
    by: lang === "gu" ? "દ્વારા" : lang === "hi" ? "द्वारा" : "by",
  };

  return (
    <PanelSection title={labels.title}>
      <Button
        variant="outline"
        size="sm"
        className="w-full mb-3"
        onClick={onUploadOwn}
        data-testid="btn-upload-own-bg"
      >
        <Upload className="h-3.5 w-3.5 mr-1.5" />
        {labels.upload}
      </Button>
      <form onSubmit={onSearchSubmit} className="mb-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.searchPh}
          className="h-9 text-sm"
          data-testid="bg-gallery-search"
        />
      </form>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PASSPORT_BG_PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              setSearch("");
              setActivePreset(p.key);
            }}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              activePreset === p.key
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-700 border-gray-300 hover:border-indigo-400"
            }`}
            data-testid={`bg-preset-${p.key}`}
          >
            {presetLabel(p)}
          </button>
        ))}
      </div>
      {err && (
        <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-2">
          {err}
        </div>
      )}
      {loading ? (
        <div className="text-center py-6 text-xs text-gray-500">
          {labels.loading}
        </div>
      ) : hits.length === 0 ? (
        <div className="text-center py-6 text-xs text-gray-400">
          {labels.empty}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {hits.map((h) => (
            <button
              key={h.id}
              onClick={() => onPickUrl(h)}
              className="group relative aspect-[3/4] overflow-hidden rounded border border-gray-200 hover:border-indigo-500 hover:ring-2 hover:ring-indigo-200 transition-all"
              style={{ background: h.color || "#f3f4f6" }}
              data-testid={`bg-hit-${h.id}`}
              title={`${h.alt || ""} — ${labels.by} ${h.photographer.name}`}
            >
              <img
                src={h.thumb}
                alt={h.alt}
                loading="lazy"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[9px] px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                {labels.by} {h.photographer.name}
              </div>
            </button>
          ))}
        </div>
      )}
    </PanelSection>
  );
}

function EffectsPanel(props: {
  lang: Lang;
  state: EditorState;
  updateStateLive: (p: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) => void;
  commitHistory: () => void;
}) {
  const { lang, state, updateStateLive, commitHistory } = props;
  const e = state.effects;
  const setE = (patch: Partial<typeof e>) =>
    updateStateLive((prev) => ({ effects: { ...prev.effects, ...patch } }));
  return (
    <>
      <PanelSection title={`${L(lang, "bgBlur")}  ·  ${e.bgBlur}px`}>
        <Slider
          value={[e.bgBlur]}
          min={0}
          max={30}
          step={1}
          onValueChange={(v) => setE({ bgBlur: v[0] })}
          onValueCommit={commitHistory}
          data-testid="effect-bg-blur"
        />
      </PanelSection>
      <PanelSection title={`${L(lang, "shadow")}  ·  ${Math.round(e.shadow * 100)}%`}>
        <Slider
          value={[Math.round(e.shadow * 100)]}
          min={0}
          max={100}
          step={1}
          onValueChange={(v) => setE({ shadow: v[0] / 100 })}
          onValueCommit={commitHistory}
          data-testid="effect-shadow"
        />
      </PanelSection>
      <PanelSection title={`${L(lang, "shadowSpread")}  ·  ${e.shadowBlur}px`}>
        <Slider
          value={[e.shadowBlur]}
          min={0}
          max={60}
          step={1}
          onValueChange={(v) => setE({ shadowBlur: v[0] })}
          onValueCommit={commitHistory}
        />
      </PanelSection>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => {
          updateStateLive({ effects: DEFAULT_STATE.effects });
          commitHistory();
        }}
      >
        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
        {L(lang, "reset")}
      </Button>
    </>
  );
}

function AdjustPanel(props: {
  lang: Lang;
  state: EditorState;
  updateStateLive: (p: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) => void;
  commitHistory: () => void;
}) {
  const { lang, state, updateStateLive, commitHistory } = props;
  const a = state.adjust;
  const setA = (patch: Partial<typeof a>) =>
    updateStateLive((prev) => ({ adjust: { ...prev.adjust, ...patch } }));
  const item = (
    label: string,
    val: number,
    set: (n: number) => void,
    testId: string,
  ) => (
    <PanelSection title={`${label}  ·  ${val.toFixed(2)}`}>
      <Slider
        value={[Math.round(val * 100)]}
        min={0}
        max={200}
        step={1}
        onValueChange={(v) => set(v[0] / 100)}
        onValueCommit={commitHistory}
        data-testid={testId}
      />
    </PanelSection>
  );
  return (
    <>
      {item(L(lang, "brightness"), a.brightness, (n) => setA({ brightness: n }), "adj-brightness")}
      {item(L(lang, "contrast"), a.contrast, (n) => setA({ contrast: n }), "adj-contrast")}
      {item(L(lang, "saturation"), a.saturate, (n) => setA({ saturate: n }), "adj-saturation")}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => {
          updateStateLive({ adjust: DEFAULT_STATE.adjust });
          commitHistory();
        }}
      >
        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
        {L(lang, "reset")}
      </Button>
    </>
  );
}

function DesignPanel(props: {
  lang: Lang;
  state: EditorState;
  onAddText: () => void;
  onUpdate: (id: string, patch: Partial<DesignLayer>) => void;
  onUpdateLive: (id: string, patch: Partial<DesignLayer>) => void;
  commitHistory: () => void;
  onDelete: (id: string) => void;
}) {
  const { lang, state, onAddText, onUpdate, onUpdateLive, commitHistory, onDelete } = props;
  return (
    <>
      <Button onClick={onAddText} className="w-full mb-4" data-testid="btn-add-text">
        <Type className="h-4 w-4 mr-1.5" />
        {L(lang, "addText")}
      </Button>
      {state.design.length === 0 && (
        <div className="text-xs text-gray-500 text-center py-4">
          No design layers yet.
        </div>
      )}
      {state.design.map((layer) => (
        <div key={layer.id} className="mb-4 p-3 rounded-lg border bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
              {L(lang, "text")}
            </div>
            <button
              onClick={() => onDelete(layer.id)}
              className="text-rose-500 hover:text-rose-700"
              aria-label={L(lang, "delete")}
              data-testid={`del-layer-${layer.id}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Input
            value={layer.text}
            onChange={(e) => onUpdate(layer.id, { text: e.target.value })}
            className="mb-2"
            data-testid={`text-input-${layer.id}`}
          />
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              onClick={() =>
                onUpdate(layer.id, {
                  fontWeight: layer.fontWeight === "bold" ? "normal" : "bold",
                })
              }
              className={`py-1.5 rounded border text-sm font-bold ${
                layer.fontWeight === "bold"
                  ? "bg-indigo-100 border-indigo-400 text-indigo-700"
                  : "bg-white border-gray-200"
              }`}
            >
              <Bold className="h-3.5 w-3.5 inline" />
            </button>
            <button
              onClick={() =>
                onUpdate(layer.id, {
                  fontStyle: layer.fontStyle === "italic" ? "normal" : "italic",
                })
              }
              className={`py-1.5 rounded border text-sm italic ${
                layer.fontStyle === "italic"
                  ? "bg-indigo-100 border-indigo-400 text-indigo-700"
                  : "bg-white border-gray-200"
              }`}
            >
              <Italic className="h-3.5 w-3.5 inline" />
            </button>
          </div>
          <div className="text-[11px] text-gray-500 mb-1">
            {L(lang, "size")}  ·  {layer.fontSize}px
          </div>
          <Slider
            value={[layer.fontSize]}
            min={12}
            max={300}
            step={1}
            onValueChange={(v) => onUpdateLive(layer.id, { fontSize: v[0] })}
            onValueCommit={commitHistory}
          />
          <div className="flex items-center gap-2 mt-2">
            <input
              type="color"
              value={layer.color}
              onChange={(e) => onUpdate(layer.id, { color: e.target.value })}
              className="h-9 w-12 rounded border"
            />
            <Input
              value={layer.color}
              onChange={(e) => onUpdate(layer.id, { color: e.target.value })}
              className="font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div>
              <div className="text-[11px] text-gray-500 mb-1">X · {(layer.x * 100).toFixed(0)}%</div>
              <Slider
                value={[Math.round(layer.x * 100)]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => onUpdateLive(layer.id, { x: v[0] / 100 })}
                onValueCommit={commitHistory}
              />
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1">Y · {(layer.y * 100).toFixed(0)}%</div>
              <Slider
                value={[Math.round(layer.y * 100)]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => onUpdateLive(layer.id, { y: v[0] / 100 })}
                onValueCommit={commitHistory}
              />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
