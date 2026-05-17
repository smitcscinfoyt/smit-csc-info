import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { getTool } from "@/components/tools/tools-data";
import { ToolResult } from "@/components/tools/tool-result";
import {
  ICON_LIBRARY,
  cleanPageBackground,
  exportEditedPdf,
  extractAreaTextGemini,
  extractAreaTextOCR,
  extractAreaTextVision,
  extractPageText,
  extractPageTextOCR,
  fileToDataUrl,
  svgToPngDataUrl,
  type EditorElement,
  type ExtractedTextResult,
  type ImageEl,
  type TextEl,
  type ShapeEl,
  type LineEl,
  type PageMeta,
  type PageOverlays,
} from "@/lib/tools/pdf-editor";
import { Progress } from "@/components/ui/progress";
import {
  Download,
  Loader2,
  ImagePlus,
  Sparkles,
  PenTool,
  Type,
  Square,
  Circle,
  ArrowRight,
  Minus,
  Eraser,
  Undo2,
  Crop as CropIcon,
  Underline,
  MousePointer2,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Palette,
  WandSparkles,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Plus,
  Droplet,
  ScanSearch,
  Layers,
  Lock,
  Unlock,
  Group as GroupIcon,
  Ungroup as UngroupIcon,
  Scissors,
  Copy,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import { useDraftBlob } from "@/hooks/use-draft-blob";
import { clearBlob } from "@/lib/blob-store";
import { clearDraft } from "@/lib/draft-store";
import { usePrimeDownloadGate } from "@/hooks/use-prime-download-gate";
import { useAutoResumeDownload } from "@/hooks/use-auto-resume-download";
import { downloadBlob } from "@/lib/tools/file";

// Maximum desktop canvas width. On mobile we shrink to fit the viewport
// (with a 16-px gutter on each side) so users on a 360-px Android phone
// don't have to horizontal-scroll the page to see the right edge of their
// PDF. The chosen width is captured ONCE at file-load and stored in every
// page's `displayWidth` meta — all element coordinates and PDF export math
// are pure ratios driven off that meta, so changing the base width is safe.
const DISPLAY_WIDTH_MAX = 820;
const DISPLAY_WIDTH_MIN = 320;
function getInitialDisplayWidth(): number {
  if (typeof window === "undefined") return DISPLAY_WIDTH_MAX;
  // Subtract the page's outer padding (~24 px each side in the Card layout)
  // so the canvas doesn't touch the screen edge on phones.
  const target = Math.min(DISPLAY_WIDTH_MAX, Math.max(DISPLAY_WIDTH_MIN, window.innerWidth - 32));
  return Math.round(target);
}

type ToolMode =
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
  | "crop"
  | "deepScan"
  | "visionScan"
  | "extractObject";

let _id = 0;
const nextId = () => `el-${++_id}-${Date.now().toString(36)}`;

interface PageRender {
  index: number;
  pageMeta: PageMeta;
  pageDataUrl: string;
}

export default function PdfEditorV2Page() {
  const tool = getTool("pdf-editor-v2")!;
  const { requirePrime, modal: primeGateModal } = usePrimeDownloadGate({
    toolId: "pdf-editor-v2",
    toolTitle: tool.title,
    actionLabel: "Save",
  });
  const [files, setFiles] = useState<File[]>([]);

  // ── Draft autosave (source PDF only) ─────────────────────────
  // Persisting the full editor state (elements/pages/history) would
  // need a non-trivial serializer for canvases & data URLs. The
  // SOURCE PDF is what users typically lose on mobile refresh
  // (the file picker often backgrounds the tab on Android), so
  // restoring just the source — letting the user redo their edits —
  // is the high-value, low-risk slice we ship now.
  useDraftBlob("pdf-editor-v2:source", files[0] ?? null, (blob, meta) => {
    setFiles([new File([blob], meta.name, { type: meta.type || "application/pdf" })]);
  });
  const [pages, setPages] = useState<PageRender[]>([]);
  const [activePage, setActivePage] = useState(0);
  const [tool_, setToolMode] = useState<ToolMode>("select");
  const [elements, setElements] = useState<EditorElement[]>([]);
  // ── Undo / Redo history ────────────────────────────────────────────────
  // We snapshot `elements` into a past stack whenever it changes (capped at
  // 80 entries — generous for a session, tiny in memory). `suppressHistoryRef`
  // is set true while we're applying an undo/redo so the observer doesn't
  // push the rolled-back state onto the past stack and create a loop.
  const historyPastRef = useRef<EditorElement[][]>([]);
  const historyFutureRef = useRef<EditorElement[][]>([]);
  const suppressHistoryRef = useRef(false);
  const lastSnapshotRef = useRef<EditorElement[]>([]);
  // First-render gate. We deliberately re-arm this to `false` inside
  // `resetHistory` so that loading a new PDF (which calls `setElements([])`
  // *and* `resetHistory()` in the same render) doesn't push a phantom
  // empty-array entry — the next observer run treats the cleared state as
  // a fresh init instead of an "edit from prev → []" transition.
  const historyInitializedRef = useRef(false);
  // Coalescing window — if a new snapshot arrives within `COALESCE_MS` of
  // the previous push, we silently update `lastSnapshotRef` without
  // creating a new past entry. This is critical for textarea editing:
  // every keystroke calls `setElements`, and without coalescing each
  // letter would be its own undo step (so typing "hello" requires 5 undos
  // to clear). Drag/resize commit on stop, so they're naturally one step.
  const lastPushTimeRef = useRef(0);
  const COALESCE_MS = 500;
  // Re-render trigger so toolbar buttons reflect stack emptiness without
  // re-rendering every keystroke (we tick this on push/undo/redo only).
  const [, setHistoryTick] = useState(0);
  /** Hard-reset history. Called when a new PDF is loaded so undo can't
   *  resurrect elements from a previous file. We re-arm the init gate
   *  to `false` so the *next* elements observer run is treated as init
   *  (silently adopts current elements, no push) — this prevents the
   *  classic "Undo enabled before any edit" bug after file load. */
  const resetHistory = useCallback(() => {
    historyPastRef.current = [];
    historyFutureRef.current = [];
    suppressHistoryRef.current = false;
    historyInitializedRef.current = false;
    lastPushTimeRef.current = 0;
    setHistoryTick((t) => t + 1);
  }, []);
  useEffect(() => {
    if (!historyInitializedRef.current) {
      historyInitializedRef.current = true;
      lastSnapshotRef.current = elements;
      return;
    }
    if (suppressHistoryRef.current) {
      suppressHistoryRef.current = false;
      lastSnapshotRef.current = elements;
      // Reset the coalescing clock so the user's first edit AFTER an
      // undo/redo always starts a fresh past entry (not merged with
      // whatever the previous push timestamp was).
      lastPushTimeRef.current = 0;
      return;
    }
    if (lastSnapshotRef.current === elements) return;
    const now = Date.now();
    const withinCoalesceWindow = now - lastPushTimeRef.current < COALESCE_MS;
    if (!withinCoalesceWindow) {
      historyPastRef.current.push(lastSnapshotRef.current);
      if (historyPastRef.current.length > 80) historyPastRef.current.shift();
      historyFutureRef.current = [];
      setHistoryTick((t) => t + 1);
    }
    // Always advance the clock and snapshot — coalesced edits stretch
    // the window, so a long burst of typing remains a single undo step.
    lastPushTimeRef.current = now;
    lastSnapshotRef.current = elements;
  }, [elements]);
  const undo = useCallback(() => {
    if (historyPastRef.current.length === 0) return;
    const prev = historyPastRef.current.pop()!;
    historyFutureRef.current.push(lastSnapshotRef.current);
    suppressHistoryRef.current = true;
    setElements(prev);
    setHistoryTick((t) => t + 1);
  }, []);
  const redo = useCallback(() => {
    if (historyFutureRef.current.length === 0) return;
    const next = historyFutureRef.current.pop()!;
    historyPastRef.current.push(lastSnapshotRef.current);
    suppressHistoryRef.current = true;
    setElements(next);
    setHistoryTick((t) => t + 1);
  }, []);
  // Keyboard shortcuts — Ctrl/⌘+Z = undo, Ctrl/⌘+Shift+Z = redo.
  // Skip when the user is typing into a text field (input, textarea,
  // contentEditable text element) so we don't hijack the browser's
  // built-in text-undo behaviour while editing a Text element's body.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // Ignore shortcuts mid-IME (Gujarati / CJK composition) — pressing
      // Ctrl during composition would otherwise hijack the commit keystroke.
      if (e.isComposing || (e as KeyboardEvent & { keyCode?: number }).keyCode === 229) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          (t as HTMLElement).isContentEditable
        )
          return;
      }
      e.preventDefault();
      if (k === "y" || (k === "z" && e.shiftKey)) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);
  // Multi-select model — `selectedIds` is the source of truth. The single
  // `selectedId` is derived as the *primary* (last-clicked) selection, kept
  // for backward compatibility with the properties panel & mini-toolbar.
  // Shift-clicking an element toggles it in/out of `selectedIds`; clicking
  // without Shift collapses the selection to that single element.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId =
    selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;
  const setSelectedId = (id: string | null) => {
    setSelectedIds(id ? [id] : []);
  };
  /** Add or remove an id from the multi-selection (Shift-click). */
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  /** Single or additive select based on the modifier key from the originating
   *  pointer/mouse event. We accept any object with `shiftKey`/`ctrlKey`/
   *  `metaKey` flags so this works for both PointerEvent and MouseEvent
   *  payloads. Either Shift OR Ctrl/⌘ adds-to-selection — Ctrl is the
   *  conventional modifier on Windows, ⌘ on macOS, Shift is also accepted
   *  for Figma-style ergonomics. */
  const selectElement = (
    id: string,
    e?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
  ) => {
    if (e?.shiftKey || e?.ctrlKey || e?.metaKey) toggleSelected(id);
    else setSelectedIds([id]);
  };

  // Click-anywhere-else deselect — when something is selected, listen
  // for pointerdowns globally and clear the selection unless the click
  // landed inside one of these "keep selection" zones:
  //   • [data-pdf-element]          → an editor element on the canvas
  //   • [data-pdf-properties-panel] → the right-hand properties panel
  //   • [data-pdf-toolbar]          → the purple top toolbar
  //   • [data-pdf-mini-toolbar]     → the floating font / format toolbar
  //   • [data-pdf-keep-selection]   → escape hatch for ad-hoc widgets
  // The page background already has its own onPointerDown that calls
  // setSelectedId(null), but this catch-all also covers clicks on the
  // surrounding chrome (nav header, page sidebar, white margin areas)
  // which previously left ghost selections behind.
  useEffect(() => {
    if (selectedIds.length === 0) return;
    const handler = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (
        t.closest("[data-pdf-element]") ||
        t.closest("[data-pdf-properties-panel]") ||
        t.closest("[data-pdf-toolbar]") ||
        t.closest("[data-pdf-mini-toolbar]") ||
        t.closest("[data-pdf-keep-selection]")
      ) {
        return;
      }
      setSelectedIds([]);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [selectedIds.length]);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  // 0–100 when an OCR / scan is running, null otherwise. Renders a real
  // animated progress bar so users on slow connections see momentum and
  // don't refresh the page mid-recognition.
  const [progressPct, setProgressPct] = useState<number | null>(null);
  // Tesseract emits dozens of progress events per second. We coalesce them
  // so React only re-renders on a *visible* change (integer percent or new
  // status string), which keeps the editor smooth on low-end phones.
  const lastProgRef = useRef<{ pct: number; status: string }>({
    pct: -1,
    status: "",
  });
  const [outBlob, setOutBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIcons, setShowIcons] = useState(false);
  const [pendingSig, setPendingSig] = useState<File | null>(null);
  const sigInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  // ── AI Erase / Restore brush state ─────────────────────────────────────
  // Stored as ImageData per page so it survives navigation. Painted into the
  // active page's overlay canvas; serialized to PNG dataURLs at export time.
  const maskDataRef = useRef<Map<number, ImageData>>(new Map());
  /** Re-entrancy guard: any in-flight `runExtractObject` call sets this true
   *  so a second pointer-up that arrives during the async crop/mask work is
   *  ignored — airtight protection on top of the immediate `setToolMode`
   *  switch in case event ordering ever delivers two pointer-ups before the
   *  state batch flushes. */
  const extractInFlightRef = useRef(false);
  const [paintedPages, setPaintedPages] = useState<Set<number>>(new Set());
  const [brushSize, setBrushSize] = useState<number>(28);

  // Default colour used when inserting a new shape (Box / Circle / Line /
  // Arrow / Right-tick) from the top toolbar. Persists across insertions so
  // the user can pick e.g. blue once and stamp ten arrows in that colour
  // without re-clicking the swatch every time. Already-placed shapes can
  // still be recoloured individually via the floating mini-toolbar.
  const [shapeColor, setShapeColor] = useState<string>("#dc2626");
  // Whether the next inserted Box/Circle should be filled (with shapeColor)
  // or just outlined. Lines/Arrows/Tick ignore this flag.
  const [shapeFilled, setShapeFilled] = useState<boolean>(false);

  // ── Crop state ─────────────────────────────────────────────────────────
  const [cropRects, setCropRects] = useState<
    Map<number, { x: number; y: number; w: number; h: number }>
  >(new Map());
  // Draft crop rect being adjusted while in "crop" mode for current page.
  const [cropDraft, setCropDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const file = files[0];
  useAutoResumeDownload({
    toolId: "pdf-editor-v2",
    ready: !!outBlob && !!file,
    run: () => {
      if (outBlob && file) {
        downloadBlob(outBlob, `${file.name.replace(/\.pdf$/i, "")}-edited.pdf`);
      }
    },
  });
  const pageRender = pages[activePage];
  const pageElements = useMemo(
    () => elements.filter((e) => e.pageIndex === activePage).sort((a, b) => a.z - b.z),
    [elements, activePage],
  );
  const selected = elements.find((e) => e.id === selectedId) ?? null;

  // ── Load PDF + render every page once ───────────────────────────────────
  useEffect(() => {
    setPages([]);
    setElements([]);
    // Wipe history so undo can't resurrect elements from a previous file.
    // Seeded with [] to match the just-cleared elements state.
    resetHistory();
    setSelectedId(null);
    setActivePage(0);
    setOutBlob(null);
    setError(null);
    maskDataRef.current.clear();
    setPaintedPages(new Set());
    setCropRects(new Map());
    setCropDraft(null);
    setExtractedPages(new Set());
    // Must reset alongside extractedPages — otherwise stale page indices
    // from a previously-loaded file would leak into the new file's
    // export and silently wipe its background pages to white.
    setCleanBgPages(new Set());
    cleanBgImagesRef.current.clear();
    smartEditSnapshotsRef.current.clear();
    // Bump the session token so any in-flight Clean BG generation
    // started against the previous file resolves to a no-op instead
    // of writing stale data into the new file's cache.
    cleanBgSessionRef.current += 1;
    if (!file) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setProgress("Loading PDF…");
      try {
        const pdfjs: any = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const { PDFDocument } = await import("pdf-lib");
        const buf = await file.arrayBuffer();
        const doc = await PDFDocument.load(new Uint8Array(buf), { ignoreEncryption: true });
        const loadingTask = pdfjs.getDocument({ data: buf.slice(0) });
        const pdfDoc = await loadingTask.promise;
        const out: PageRender[] = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          if (cancelled) return;
          setProgress(`Rendering page ${i}/${pdfDoc.numPages}…`);
          const page = await pdfDoc.getPage(i);
          const v0 = page.getViewport({ scale: 1 });
          // Recompute every page (cheap) so a viewport rotation BETWEEN page
          // renders inside the same load is honoured. The width still gets
          // baked into pageMeta.displayWidth so editor element coords stay
          // pinned to that page's space and don't shift later.
          const targetWidth = getInitialDisplayWidth();
          const scale = targetWidth / v0.width;
          const v = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(v.width);
          canvas.height = Math.round(v.height);
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: v }).promise;
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          const pdfPage = doc.getPages()[i - 1];
          const { width: pw, height: ph } = pdfPage.getSize();
          const rot = (((pdfPage.getRotation().angle ?? 0) % 360) + 360) % 360;
          out.push({
            index: i - 1,
            pageDataUrl: dataUrl,
            pageMeta: {
              pdfWidthPt: pw,
              pdfHeightPt: ph,
              rotation: rot,
              displayWidth: canvas.width,
              displayHeight: canvas.height,
            },
          });
        }
        if (!cancelled) setPages(out);
        try {
          await pdfDoc.cleanup();
          await pdfDoc.destroy();
        } catch {
          /* noop */
        }
      } catch {
        if (!cancelled) setError("Could not read this PDF. It may be encrypted or corrupted.");
      } finally {
        if (!cancelled) {
          setBusy(false);
          setProgress("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // ── Element creation ─────────────────────────────────────────────────────
  const addElement = (el: EditorElement) => {
    setOutBlob(null);
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
    setToolMode("select");
  };
  const baseEl = (overrides: Partial<EditorElement>) => {
    // Newly added items must always sit ABOVE existing layers — even after
    // the user has reordered things, so use maxZ+1 (not count+1).
    const onPage = elements.filter((e) => e.pageIndex === activePage);
    const maxZ = onPage.length ? Math.max(...onPage.map((e) => e.z)) : 0;
    return {
      id: nextId(),
      pageIndex: activePage,
      x: 60,
      y: 60,
      width: 180,
      height: 80,
      z: maxZ + 1,
      rotation: 0,
      ...overrides,
    };
  };

  const onPickImage = async (
    f: File | null,
    kind: "image" | "signature",
    transparentOverride?: boolean,
  ) => {
    if (!f) return;
    const transparent =
      typeof transparentOverride === "boolean" ? transparentOverride : kind === "signature";
    const src = await fileToDataUrl(f, transparent);
    const im = new Image();
    im.src = src;
    await new Promise((r) => (im.onload = r));
    const ratio = im.naturalHeight / im.naturalWidth;
    const w = kind === "signature" ? 200 : 220;
    addElement({
      ...(baseEl({ width: w, height: w * ratio }) as ImageEl),
      type: kind,
      src,
    } as ImageEl);
  };

  const addIcon = async (svg: string) => {
    const src = await svgToPngDataUrl(svg, 256);
    const im = new Image();
    im.src = src;
    await new Promise((r) => (im.onload = r));
    const ratio = im.naturalHeight / im.naturalWidth;
    const w = 120;
    addElement({
      ...(baseEl({ width: w, height: w * ratio }) as ImageEl),
      type: "icon",
      src,
    } as ImageEl);
    setShowIcons(false);
  };

  const addText = () => {
    addElement({
      ...(baseEl({ width: 240, height: 32 }) as TextEl),
      type: "text",
      text: "Type here…",
      fontSize: 18,
      color: "#0f172a",
      bold: false,
      italic: false,
      underline: false,
      fontFamily: "Helvetica",
      bgColor: null,
      align: "left",
    } as TextEl);
  };

  // ── Smart Word Extraction ─────────────────────────────────────────────
  // Scans the active page with pdfjs, converts every text run into a
  // draggable + editable TextEl, and paints a white-out rectangle for each
  // onto the page mask canvas so the original glyphs stay hidden no matter
  // where the user later moves the editable element.
  const [extractedPages, setExtractedPages] = useState<Set<number>>(new Set());
  // Pages flagged for full-white background wipe at export time. Toggled
  // by the "Clean BG" toolbar button — only useful after Smart Text Edit
  // has captured every glyph as an editable text block, at which point
  // the original raster (moiré, scan-line speckles, faint table grids
  // that survived the OCR's "ignore borders" instruction) becomes pure
  // visual noise. Wiping it gives a print-clean export.
  const [cleanBgPages, setCleanBgPages] = useState<Set<number>>(new Set());
  // Per-page pre-cleaned background images. Keyed by page index, value is
  // a PNG dataUrl produced by `cleanPageBackground()` — a hard luminance
  // threshold that snaps light pixels (paper, moiré, scan halo, screen-
  // photo cream tint) to pure white while leaving dark pixels (text,
  // table grid lines, QR cells, stamps) untouched. We render this image
  // both in the on-screen editor preview AND embed it into the exported
  // PDF when the matching page is in `cleanBgPages`. Held in a ref so
  // we don't trigger render storms on the (potentially large) Maps.
  const cleanBgImagesRef = useRef<Map<number, string>>(new Map());
  // Monotonic session token. Bumped every time the loaded file changes
  // (or is cleared). Async Clean BG generations capture the value at
  // start; if it has changed by the time `cleanPageBackground()`
  // resolves, the result is discarded — preventing stale cleaned
  // images from leaking into the new file's editor / export.
  const cleanBgSessionRef = useRef<number>(0);

  // ── Smart Text Edit revert snapshots ───────────────────────────────────
  // For every page on which Smart Text Edit succeeds, we record what we
  // need to put back to fully undo the operation: the IDs of elements
  // that the extractor added (so we don't touch user-added elements),
  // and whether Clean BG was already on for the page (so we know
  // whether to disable it on revert or just restore the prior cached
  // image). Cleared when a new file is loaded.
  type SmartEditSnapshot = {
    addedElementIds: string[];
    hadCleanBg: boolean;
    prevCleanBgImage: string | null;
  };
  const smartEditSnapshotsRef = useRef<Map<number, SmartEditSnapshot>>(
    new Map(),
  );

  /** Capture (or extend) the pre-Smart-Edit snapshot for a page. If a
   *  snapshot already exists from an earlier run on the same page, we
   *  KEEP its original `hadCleanBg` / `prevCleanBgImage` (the true
   *  pre-first-run baseline) and only APPEND the newly-added element
   *  IDs. This guarantees Undo Smart always reverts the page back to
   *  its original PDF state, not just the most recent run. */
  const recordSmartEditSnapshot = (pageIdx: number, addedIds: string[]) => {
    const existing = smartEditSnapshotsRef.current.get(pageIdx);
    if (existing) {
      smartEditSnapshotsRef.current.set(pageIdx, {
        ...existing,
        addedElementIds: [...existing.addedElementIds, ...addedIds],
      });
    } else {
      smartEditSnapshotsRef.current.set(pageIdx, {
        addedElementIds: addedIds,
        hadCleanBg: cleanBgPages.has(pageIdx),
        prevCleanBgImage: cleanBgImagesRef.current.get(pageIdx) ?? null,
      });
    }
  };

  /** Revert Smart Text Edit on a single page back to the original PDF
   *  state (for that page). Removes only the elements that the extractor
   *  added — anything the user later typed/dragged onto the page stays
   *  intact. Also rolls back the auto-enabled Clean BG for that page. */
  const revertSmartEdit = (pageIdx: number) => {
    const snap = smartEditSnapshotsRef.current.get(pageIdx);
    if (!snap) return;
    const removeSet = new Set(snap.addedElementIds);
    setElements((prev) => prev.filter((e) => !removeSet.has(e.id)));
    setExtractedPages((prev) => {
      if (!prev.has(pageIdx)) return prev;
      const n = new Set(prev);
      n.delete(pageIdx);
      return n;
    });
    if (!snap.hadCleanBg) {
      setCleanBgPages((prev) => {
        if (!prev.has(pageIdx)) return prev;
        const n = new Set(prev);
        n.delete(pageIdx);
        return n;
      });
      cleanBgImagesRef.current.delete(pageIdx);
    } else if (snap.prevCleanBgImage) {
      cleanBgImagesRef.current.set(pageIdx, snap.prevCleanBgImage);
    }
    smartEditSnapshotsRef.current.delete(pageIdx);
    setSelectedId(null);
    setOutBlob(null);
    setError(null);
    setProgress("Smart Text Edit reverted on this page.");
    window.setTimeout(() => setProgress(""), 1800);
  };

  /**
   * Generate (if not cached) a cleaned background image for the given
   * page and add the page to {@link cleanBgPages}. Idempotent — safe to
   * call repeatedly. Used by:
   *   1. The Clean BG toolbar button (manual user toggle).
   *   2. Smart Text Edit success — auto-enables Clean BG so the
   *      cleaned raster hides the original noisy text underneath the
   *      newly-added transparent editable overlays. Without this auto-
   *      enable the editor shows the original page raster AND the
   *      editable text on top, producing a "double print" mess.
   *
   * Cancellation: a session token captured at start is checked after
   * the (potentially slow) cleanPageBackground await — if the user
   * swapped files mid-flight, the cleaned image is discarded so it
   * doesn't leak into the new file's cache.
   */
  const enableCleanBgForPage = async (
    pageIdx: number,
    pageDataUrl: string,
    /**
     * Optional override of the text rectangles to white-out inside the
     * cleaned image. Provided by extraction success handlers (which
     * have the freshly-extracted elements before React state has
     * applied). When omitted, the helper falls back to whatever
     * extracted text elements currently sit on the target page.
     */
    textRectsOverride?: { x: number; y: number; w: number; h: number }[],
  ) => {
    try {
      const textRects =
        textRectsOverride ??
        elements
          .filter(
            (e) =>
              e.pageIndex === pageIdx &&
              e.type === "text" &&
              (e as TextEl).extracted,
          )
          .map((e) => ({
            x: e.x,
            y: e.y,
            w: e.width,
            h: e.height,
          }));
      // Always regenerate when called with an explicit text-rect set
      // (extraction path) — the rect list may have changed since the
      // last cache. For manual toolbar toggles we can reuse the cache
      // to avoid the ~25 ms threshold pass on every flick.
      const useCache =
        textRectsOverride === undefined &&
        cleanBgImagesRef.current.has(pageIdx);
      if (!useCache) {
        const session = cleanBgSessionRef.current;
        const cleaned = await cleanPageBackground(pageDataUrl, 200, textRects);
        if (session !== cleanBgSessionRef.current) return;
        cleanBgImagesRef.current.set(pageIdx, cleaned);
      }
      setCleanBgPages((prev) => {
        if (prev.has(pageIdx)) return prev;
        const next = new Set(prev);
        next.add(pageIdx);
        return next;
      });
    } catch {
      // Defensive — cleaning only fails on image decode error, which
      // shouldn't happen for a page we just rendered. Silent swallow
      // so extraction success isn't disrupted by a Clean BG hiccup.
    }
  };

  // ── Smart Text Edit: silent two-stage extraction cascade ──────────────
  // One button, two engines, zero engine choice for the user.
  //   Stage 1 (0–15%):   pdfjs embedded text — instant, free, works for
  //                      native (non-scanned) PDFs.
  //   Stage 2 (15–99%):  Gemini AI OCR on the server (extractAreaTextGemini
  //                      with a full-page region). Catches scanned PDFs,
  //                      flattened forms, and stylised display fonts like
  //                      "JAGRUTI CHUDASAMA" that Tesseract typically misses.
  //
  // We deliberately do NOT run Tesseract in the browser any more —
  // Tesseract loads ~25 MB of WebAssembly + language data and renders the
  // page at 3× DPI on the client; on mid-range Android phones that
  // combination blows past the per-tab memory cap and Chrome silently
  // kills + reloads the editor (the bug users saw as "PS automatic reload").
  // Doing OCR on the server keeps the phone's RAM footprint flat.
  //
  // Errors at every stage are intentionally swallowed — the user never
  // sees engine names, "couldn't read" messages, or quota warnings. They
  // only ever see one progress bar labelled "Processing" going 0 → 100.
  const runSmartTextEdit = async () => {
    if (!file || !pageRender) return;
    setBusy(true);
    setError(null);
    setProgress("Processing");
    setProgressPct(0);
    lastProgRef.current = { pct: -1, status: "" };

    const dispW = pageRender.pageMeta.displayWidth;
    const dispH = pageRender.pageMeta.displayHeight;
    const fullRegion = { x: 0, y: 0, w: dispW, h: dispH };

    // Throttle: pct setState only on integer change so we don't churn React.
    const setSmoothPct = (pct: number) => {
      const p = Math.max(0, Math.min(100, Math.round(pct)));
      if (p !== lastProgRef.current.pct) {
        lastProgRef.current.pct = p;
        setProgressPct(p);
      }
    };

    let result: ExtractedTextResult | null = null;
    try {
      // Stage 1 — embedded text via pdfjs.
      try {
        setSmoothPct(2);
        result = await extractPageText(file, activePage, dispW);
        setSmoothPct(15);
      } catch {
        result = null;
      }

      // Stage 2 — Gemini AI OCR (server-side).
      if (!result || result.elements.length === 0) {
        try {
          result = await extractAreaTextGemini(
            file,
            activePage,
            dispW,
            fullRegion,
            (pct) => setSmoothPct(15 + pct * 84),
          );
        } catch {
          result = null;
        }
        setSmoothPct(99);
      }

      // Apply whatever the cascade found (could be nothing — that's fine).
      // We deliberately keep `progress` set to "Processing" the entire time,
      // and rely on the button-label change ("Smart Text Edit" → "Smart
      // Edit ✓") for success feedback — per spec, the only text under the
      // bar is "Processing", never engine names or result counts.
      if (result && result.elements.length > 0) {
        // Paint white-out under each new TextEl so the original glyphs stay
        // hidden when the editable element gets dragged elsewhere. Same
        // mask-merge logic the other extractors use.
        // Per user request: extraction must NOT paint white rectangles
        // into the mask layer. Doing so used to bleed white into nearby
        // table grid lines, borders, and QR cells whenever a word's
        // padded rect overlapped them — making every word in the export
        // look like it sat inside a "cut-out" rectangle. Now we leave
        // the existing brush-mask untouched and let the cleaned page
        // raster (Clean BG) handle hiding the original ink.
        const onPage = elements.filter((e) => e.pageIndex === activePage);
        let nextZ = onPage.length ? Math.max(...onPage.map((e) => e.z)) + 1 : 1;
        const newEls: EditorElement[] = result.elements.map((e) => ({
          ...e,
          id: nextId(),
          z: nextZ++,
        } as EditorElement));
        // Capture pre-mutation snapshot so the user can fully revert
        // Smart Text Edit (and the auto-enabled Clean BG) on this page.
        // Reentrant-safe: subsequent runs append IDs and preserve the
        // original pre-first-run baseline for Clean BG.
        recordSmartEditSnapshot(activePage, newEls.map((e) => e.id));
        setElements((prev) => [...prev, ...newEls]);
        setSelectedId(null);
        setToolMode("select");
        setExtractedPages((prev) => new Set(prev).add(activePage));
        // Auto-enable Clean BG. Now that Clean BG is non-destructive
        // (it threshold-cleans noise but preserves dark text / tables /
        // QR cells / borders), turning it on by default is safe AND
        // necessary — without it the editor would render the original
        // noisy raster underneath the new transparent editable text
        // overlays, producing a "double print" mess. Awaited so the
        // cleaned image is in place by the time we settle the UI.
        // The freshly-extracted rects are passed explicitly because
        // React state hasn't applied yet — the helper's fallback that
        // reads from `elements` would see the old (empty) page.
        const newRects = newEls
          .filter((e) => e.type === "text")
          .map((e) => ({ x: e.x, y: e.y, w: e.width, h: e.height }));
        await enableCleanBgForPage(
          activePage,
          pageRender.pageDataUrl,
          newRects,
        );
        setSmoothPct(100);
        // Hold the full bar briefly so the user sees the 100% completion,
        // then clear. Label stays "Processing" the whole time — success is
        // signalled solely by the button flipping to "Smart Edit ✓".
        window.setTimeout(() => setProgress(""), 600);
      } else {
        // Silent fail by design — the user just sees the bar disappear.
        // Still walk the bar to 100 first so the visual completes.
        setSmoothPct(100);
        window.setTimeout(() => setProgress(""), 400);
      }
    } catch {
      // Catch-all so absolutely nothing throws to the UI. Silent.
      setProgress("");
    } finally {
      setBusy(false);
      setProgressPct(null);
    }
  };
  const handleExtractText = async () => {
    if (!file || !pageRender) return;
    if (extractedPages.has(activePage)) return; // already extracted
    setBusy(true);
    setError(null);
    setOutBlob(null);
    setProgress(`Extracting text from page ${activePage + 1}…`);
    try {
      let result = await extractPageText(
        file,
        activePage,
        pageRender.pageMeta.displayWidth,
      );

      // ── OCR fallback ─────────────────────────────────────────────────────
      // When the PDF has no usable text layer (scanned image, flattened
      // certificate, fonts encoded as curves), automatically fall through
      // to Tesseract OCR so the feature still works on those PDFs.
      // OCR is slow (5–30s) and downloads ~5–10 MB of language data on
      // first use, so we surface progress to the user while it runs.
      let ocrAttempted = false;
      let ocrError: string | null = null;
      if (
        (result.reason === "scanned" || result.reason === "no-text") &&
        result.elements.length === 0
      ) {
        ocrAttempted = true;
        setProgress(`No text layer — running OCR on page ${activePage + 1}…`);
        setProgressPct(2);
        lastProgRef.current = { pct: -1, status: "" };
        try {
          result = await extractPageTextOCR(
            file,
            activePage,
            pageRender.pageMeta.displayWidth,
            "eng",
            (pct, status) => {
              const p = Math.round(pct * 100);
              const prev = lastProgRef.current;
              if (p === prev.pct && status === prev.status) return;
              lastProgRef.current = { pct: p, status };
              setProgress(`OCR ${p}% — ${status}`);
              setProgressPct(p);
            },
          );
        } catch (ocrErr: any) {
          // Surface the actual OCR error — silent failures here previously
          // looked identical to "PDF has no text", which was confusing.
          console.error("OCR fallback failed", ocrErr);
          ocrError = String(ocrErr?.message ?? ocrErr ?? "unknown error");
        }
      }

      // 1) Per user request: do NOT paint per-glyph white rectangles
      //    into the mask. They used to "cut out" nearby table grid
      //    lines / borders / QR cells wherever a word's padded rect
      //    overlapped them. Original ink is hidden by the cleaned
      //    page raster (Clean BG) instead. Existing brush mask is
      //    preserved untouched.
      // 2) Add the extracted TextEls to the canvas, all sitting above existing
      //    elements (z grows monotonically per add).
      const onPage = elements.filter((e) => e.pageIndex === activePage);
      let nextZ = onPage.length ? Math.max(...onPage.map((e) => e.z)) + 1 : 1;
      const newEls: EditorElement[] = result.elements.map((e) => ({
        ...e,
        id: nextId(),
        z: nextZ++,
      } as EditorElement));
      // Capture pre-mutation snapshot so this page can be fully restored.
      if (newEls.length > 0) {
        recordSmartEditSnapshot(activePage, newEls.map((e) => e.id));
      }
      setElements((prev) => [...prev, ...newEls]);
      setSelectedId(null);
      setToolMode("select");
      // Only mark this page as "extracted" when we actually got text — that
      // way users can retry on scanned/encrypted PDFs after fixing the file.
      if (newEls.length > 0) {
        setExtractedPages((prev) => new Set(prev).add(activePage));
        // Auto-enable Clean BG so the cleaned page raster hides the
        // original noisy text underneath the new transparent overlays
        // — same reasoning as the Smart Text Edit success path. Pass
        // the freshly-extracted rects explicitly because React state
        // hasn't applied yet.
        const newRects = newEls
          .filter((e) => e.type === "text")
          .map((e) => ({ x: e.x, y: e.y, w: e.width, h: e.height }));
        await enableCleanBgForPage(
          activePage,
          pageRender.pageDataUrl,
          newRects,
        );
        setProgress(
          `Extracted ${newEls.length} text block${newEls.length === 1 ? "" : "s"} — tap any to edit.`,
        );
        window.setTimeout(() => setProgress(""), 2200);
      } else {
        const msg =
          result.reason === "encrypted"
            ? "This PDF is password-protected. Remove the password first, then re-upload."
            : ocrError
            ? `OCR could not run on this page (${ocrError}). Check your internet connection and try again, or use AI Erase + add fresh text.`
            : ocrAttempted
            ? "Even OCR couldn't read text on this page — the image may be too low-resolution or the text too stylised. Use AI Erase + add fresh text instead."
            : "No editable text was found on this page. Try AI Erase + add fresh text.";
        setError(msg);
        setProgress("");
      }
    } catch (e) {
      console.error(e);
      setError("Could not extract text from this page. The PDF may be image-only or restricted.");
    } finally {
      setBusy(false);
      setProgressPct(null);
    }
  };

  // ── Deep Scan: high-DPI OCR on a user-drawn region ──────────────────────
  // Triggered from the PageCanvas after the user draws a selection
  // rectangle in deepScan tool mode. Runs at 3× page DPI on just that
  // slice, so accuracy on small/stylised text is dramatically higher.
  const runDeepScan = async (region: { x: number; y: number; w: number; h: number }) => {
    if (!file || !pageRender) return;
    if (region.w < 8 || region.h < 8) {
      setToolMode("select");
      return;
    }
    setBusy(true);
    setError(null);
    setProgress("Deep Scan: cropping selection…");
    setProgressPct(2);
    lastProgRef.current = { pct: -1, status: "" };
    try {
      const result = await extractAreaTextOCR(
        file,
        activePage,
        pageRender.pageMeta.displayWidth,
        region,
        "eng",
        (pct, status) => {
          const p = Math.round(pct * 100);
          const prev = lastProgRef.current;
          if (p === prev.pct && status === prev.status) return;
          lastProgRef.current = { pct: p, status };
          setProgress(`Deep Scan ${p}% — ${status}`);
          setProgressPct(p);
        },
      );

      // Per user request: skip the per-glyph white-out paint into the
      // mask. Those padded rects used to wipe out adjacent table grid
      // lines / borders / QR cells in the export. Cleaned page raster
      // (Clean BG) hides the original ink instead. Existing brush
      // mask is preserved untouched.
      const onPage = elements.filter((e) => e.pageIndex === activePage);
      let nextZ = onPage.length ? Math.max(...onPage.map((e) => e.z)) + 1 : 1;
      const newEls: EditorElement[] = result.elements.map((e) => ({
        ...e,
        id: nextId(),
        z: nextZ++,
      } as EditorElement));
      setElements((prev) => [...prev, ...newEls]);
      setSelectedId(null);
      setToolMode("select");
      if (newEls.length > 0) {
        // If Clean BG is already on for this page, refresh the cached
        // cleaned image so the new Deep Scan rects get whited-out too
        // — otherwise the original glyphs in the scanned region would
        // peek through under the new transparent overlays. We pass
        // the merged set of (existing extracted + new) rects so the
        // earlier coverage isn't lost.
        if (cleanBgPages.has(activePage)) {
          const merged = [
            ...elements
              .filter(
                (e) =>
                  e.pageIndex === activePage &&
                  e.type === "text" &&
                  (e as TextEl).extracted,
              )
              .map((e) => ({ x: e.x, y: e.y, w: e.width, h: e.height })),
            ...newEls
              .filter((e) => e.type === "text")
              .map((e) => ({ x: e.x, y: e.y, w: e.width, h: e.height })),
          ];
          await enableCleanBgForPage(
            activePage,
            pageRender.pageDataUrl,
            merged,
          );
        }
        setProgress(
          `Deep Scan found ${newEls.length} text block${newEls.length === 1 ? "" : "s"} in that area.`,
        );
        window.setTimeout(() => setProgress(""), 2400);
      } else {
        setError(
          "Deep Scan couldn't read text in that area. Stylised certificate fonts often need Google AI — tap the button below to try.",
        );
        setProgress("");
      }
    } catch (e: any) {
      console.error("Deep Scan failed", e);
      setError(`Deep Scan failed: ${e?.message ?? e ?? "unknown error"}.`);
    } finally {
      setBusy(false);
      setProgressPct(null);
    }
  };

  // ── Google AI Deep Scan: Vision API on a user-drawn region ─────────────
  // Same drag-rect UI as Deep Scan but routes the cropped slice through
  // our `/api/tools/vision-ocr` proxy instead of in-browser Tesseract.
  // Vision's deep model handles ornate display fonts (the kind used on
  // Indian Govt. certificates) where Tesseract typically returns garbage.
  const runVisionDeepScan = async (region: { x: number; y: number; w: number; h: number }) => {
    if (!file || !pageRender) return;
    if (region.w < 8 || region.h < 8) {
      setToolMode("select");
      return;
    }
    setBusy(true);
    setError(null);
    setProgress("Google AI: cropping selection…");
    setProgressPct(2);
    lastProgRef.current = { pct: -1, status: "" };
    try {
      const result = await extractAreaTextVision(
        file,
        activePage,
        pageRender.pageMeta.displayWidth,
        region,
        (pct, status) => {
          const p = Math.round(pct * 100);
          const prev = lastProgRef.current;
          if (p === prev.pct && status === prev.status) return;
          lastProgRef.current = { pct: p, status };
          setProgress(`Google AI ${p}% — ${status}`);
          setProgressPct(p);
        },
      );

      // Per user request: do NOT paint per-glyph white rectangles into
      // the mask. They were wiping out adjacent table grid lines /
      // borders / QR cells in the export. Cleaned page raster (Clean
      // BG) hides the original ink. Existing brush mask preserved.
      const onPage = elements.filter((e) => e.pageIndex === activePage);
      let nextZ = onPage.length ? Math.max(...onPage.map((e) => e.z)) + 1 : 1;
      const newEls: EditorElement[] = result.elements.map((e) => ({
        ...e,
        id: nextId(),
        z: nextZ++,
      } as EditorElement));
      setElements((prev) => [...prev, ...newEls]);
      setSelectedId(null);
      setToolMode("select");
      if (newEls.length > 0) {
        // Refresh Clean BG cache when already enabled — same reasoning
        // as runDeepScan above.
        if (cleanBgPages.has(activePage)) {
          const merged = [
            ...elements
              .filter(
                (e) =>
                  e.pageIndex === activePage &&
                  e.type === "text" &&
                  (e as TextEl).extracted,
              )
              .map((e) => ({ x: e.x, y: e.y, w: e.width, h: e.height })),
            ...newEls
              .filter((e) => e.type === "text")
              .map((e) => ({ x: e.x, y: e.y, w: e.width, h: e.height })),
          ];
          await enableCleanBgForPage(
            activePage,
            pageRender.pageDataUrl,
            merged,
          );
        }
        setProgress(
          `Google AI found ${newEls.length} word${newEls.length === 1 ? "" : "s"} in that area.`,
        );
        window.setTimeout(() => setProgress(""), 2400);
      } else {
        setError(
          "Google AI couldn't read text in that area. Try selecting a tighter rectangle around just the text.",
        );
        setProgress("");
      }
    } catch (e: any) {
      console.error("Google AI Deep Scan failed", e);
      // 503 = key not configured, 429 = quota, 413 = too large.
      const msg =
        e?.status === 503
          ? "Google AI engine isn't configured yet. Use the regular Deep Scan or contact support."
          : e?.status === 429
            ? "Google AI free tier reached for now. Try Deep Scan or wait a bit."
            : `Google AI Deep Scan failed: ${e?.message ?? e ?? "unknown error"}.`;
      setError(msg);
    } finally {
      setBusy(false);
      setProgressPct(null);
    }
  };

  const addShape = (type: "rect" | "circle") => {
    addElement({
      ...(baseEl({ width: 160, height: 100 }) as ShapeEl),
      type,
      strokeColor: shapeColor,
      strokeWidth: 2,
      fillColor: shapeFilled ? shapeColor : null,
    } as ShapeEl);
  };
  const addLine = () => {
    addElement({
      ...(baseEl({ width: 200, height: 0 }) as LineEl),
      type: "line",
      strokeColor: shapeColor,
      strokeWidth: 2,
    } as LineEl);
  };
  const addArrow = () => {
    addElement({
      ...(baseEl({ width: 200, height: 0 }) as LineEl),
      type: "arrow",
      strokeColor: shapeColor,
      strokeWidth: 3,
    } as LineEl);
  };

  // One-click "Right" tick (✓) — the universally-recognised correct-mark
  // for document review. Builds a fresh SVG so the stroke colour can pick
  // up the user's currently-selected `shapeColor` (rather than the hardcoded
  // green from ICON_LIBRARY). The result is rasterised and inserted as a
  // movable / resizable / lockable / groupable / deletable IconEl just like
  // any other icon.
  const addRight = async () => {
    const tickSvg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
      `stroke="${shapeColor}" stroke-width="3" stroke-linecap="round" ` +
      `stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const src = await svgToPngDataUrl(tickSvg, 256);
    const im = new Image();
    im.src = src;
    await new Promise((r) => (im.onload = r));
    const ratio = im.naturalHeight / im.naturalWidth;
    const w = 80;
    addElement({
      ...(baseEl({ width: w, height: w * ratio }) as ImageEl),
      type: "icon",
      src,
    } as ImageEl);
  };

  // ── AI Erase / Restore: invoked by PageCanvas after each stroke ────────
  const updateMaskForPage = (pageIdx: number, data: ImageData | null) => {
    if (data) {
      maskDataRef.current.set(pageIdx, data);
    } else {
      maskDataRef.current.delete(pageIdx);
    }
    setPaintedPages(new Set(maskDataRef.current.keys()));
    setOutBlob(null);
  };
  const clearMaskForActive = () => updateMaskForPage(activePage, null);

  // ── Crop helpers ───────────────────────────────────────────────────────
  const beginCrop = () => {
    if (!pageRender) return;
    setSelectedId(null);
    setToolMode("crop");
    const existing = cropRects.get(activePage);
    if (existing) {
      setCropDraft(existing);
    } else {
      const w = pageRender.pageMeta.displayWidth;
      const h = pageRender.pageMeta.displayHeight;
      const pad = Math.round(Math.min(w, h) * 0.08);
      setCropDraft({ x: pad, y: pad, w: w - 2 * pad, h: h - 2 * pad });
    }
  };
  const applyCrop = () => {
    if (!cropDraft) return;
    setCropRects((prev) => {
      const m = new Map(prev);
      m.set(activePage, cropDraft);
      return m;
    });
    setCropDraft(null);
    setToolMode("select");
    setOutBlob(null);
  };
  const cancelCrop = () => {
    setCropDraft(null);
    setToolMode("select");
  };
  const removeCrop = () => {
    setCropRects((prev) => {
      const m = new Map(prev);
      m.delete(activePage);
      return m;
    });
    setCropDraft(null);
    setToolMode("select");
    setOutBlob(null);
  };

  // ── Element actions ──────────────────────────────────────────────────────
  const updateEl = (id: string, patch: Partial<EditorElement>) => {
    setOutBlob(null);
    setElements((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...patch } as EditorElement) : e)));
  };
  const deleteEl = (id: string) => {
    setOutBlob(null);
    setElements((prev) => prev.filter((e) => e.id !== id));
    // Drop the deleted id from the entire multi-selection — not just when
    // it happens to be the primary. Without this, deleting an element via
    // the Layers panel or the Delete keyboard shortcut while it's part of a
    // multi-selection leaves a "ghost" id in `selectedIds`. That phantom id
    // poisons every downstream multi-select operation (group, lock,
    // floating-toolbar enable/disable) until the user manually clears.
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  /**
   * Object-Extract — turns a region of the page raster (a QR code, a passport
   * photo, a small table, a stamp, etc.) into a free-floating, movable,
   * resizable {@link ImageEl}. Workflow:
   *
   *   1. User picks the "Extract Object" tool, drags a rectangle around the
   *      thing they want to lift.
   *   2. We crop that rectangle from the cleaned page raster (or the original
   *      raster if Clean BG isn't on) into a brand-new image.
   *   3. We paint a white rectangle into the page's mask canvas (same channel
   *      the brush erase tool uses) so the original ink under the region is
   *      wiped from both the on-screen preview AND the exported PDF — no
   *      lingering "ghost rectangle" if the user moves or deletes the photo.
   *   4. We add the cropped image as a fresh ImageEl on top.
   *
   * The new image is positioned exactly where the user drew the rectangle, so
   * it visually appears unchanged at first; only when the user drags it away
   * does the underlying clean (mask-erased) page show through.
   */
  const runExtractObject = async (region: {
    x: number;
    y: number;
    w: number;
    h: number;
  }) => {
    // Re-entrancy guard — bail if a previous extract is still in flight
    // (pointer-up event arrived twice before async work finished).
    if (extractInFlightRef.current) return;
    // Switch out of the extract tool IMMEDIATELY (before any async work) so
    // the in-flight pointer-up cannot fire the same handler a second time
    // and accidentally extract the photo twice.
    setToolMode("select");
    if (!pageRender) return;
    if (region.w < 8 || region.h < 8) return;
    extractInFlightRef.current = true;
    setBusy(true);
    setError(null);
    setProgress("Extracting object…");
    try {
      // Prefer the cleaned raster when available — it has the moiré/scan
      // halo wiped out so the extracted object looks crisp on export. If
      // Clean BG hasn't run for this page, fall back to the original page
      // image so the feature still works without prerequisites.
      const sourceUrl =
        cleanBgImagesRef.current.get(activePage) ?? pageRender.pageDataUrl;
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.crossOrigin = "anonymous";
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = sourceUrl;
      });
      // The page raster is rendered above display-px size; scale the crop
      // rect from display coords into raster coords.
      const meta = pageRender.pageMeta;
      const scaleX = img.naturalWidth / meta.displayWidth;
      const scaleY = img.naturalHeight / meta.displayHeight;
      const sx = Math.max(0, Math.round(region.x * scaleX));
      const sy = Math.max(0, Math.round(region.y * scaleY));
      const sw = Math.min(
        img.naturalWidth - sx,
        Math.round(region.w * scaleX),
      );
      const sh = Math.min(
        img.naturalHeight - sy,
        Math.round(region.h * scaleY),
      );
      if (sw < 4 || sh < 4) {
        setBusy(false);
        return;
      }
      const c = document.createElement("canvas");
      c.width = sw;
      c.height = sh;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("canvas 2d context unavailable");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const dataUrl = c.toDataURL("image/png");

      // Erase the original ink under the extracted region by painting a
      // white rectangle into the page's mask canvas (same channel the brush
      // erase uses). This persists in maskDataRef and is composited into
      // the export, so when the user drags the photo away the underlying
      // page is left clean — no white-out shape lingering behind.
      const dispW = meta.displayWidth;
      const dispH = meta.displayHeight;
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = dispW;
      maskCanvas.height = dispH;
      const maskCtx = maskCanvas.getContext("2d");
      if (maskCtx) {
        const existing = maskDataRef.current.get(activePage);
        if (existing && existing.width === dispW && existing.height === dispH) {
          maskCtx.putImageData(existing, 0, 0);
        }
        maskCtx.fillStyle = "#ffffff";
        maskCtx.fillRect(region.x, region.y, region.w, region.h);
        const newMask = maskCtx.getImageData(0, 0, dispW, dispH);
        updateMaskForPage(activePage, newMask);
      }

      // Allocate a fresh id — just the photo, no group, no white-out shape
      // (the mask paint above replaces what the white-out used to do).
      const onPage = elements.filter((e) => e.pageIndex === activePage);
      const nextZ = onPage.length ? Math.max(...onPage.map((e) => e.z)) + 1 : 1;
      const photo: ImageEl = {
        id: nextId(),
        type: "image",
        x: region.x,
        y: region.y,
        width: region.w,
        height: region.h,
        rotation: 0,
        pageIndex: activePage,
        z: nextZ,
        src: dataUrl,
      };
      setOutBlob(null);
      setElements((prev) => [...prev, photo]);
      setSelectedIds([photo.id]);
      setProgress("Object extracted — drag or resize to move it.");
      window.setTimeout(() => setProgress(""), 2000);
    } catch (e: any) {
      console.error("Extract Object failed", e);
      setError(`Extract failed: ${e?.message ?? e ?? "unknown error"}`);
    } finally {
      setBusy(false);
      extractInFlightRef.current = false;
    }
  };

  // ── Multi-selection actions (Lock / Group / Delete) ─────────────────────
  // These operate on the entire `selectedIds` array so the user can pick a
  // bunch of QR + tables + text with Shift-click and act on them as a unit.
  /** Generate a fresh group id. Short, URL-safe, monotonic — collisions are
   *  effectively impossible within a single editor session. */
  const newGroupId = () =>
    `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  /** Apply the same patch to every currently-selected element in one
   *  setElements pass — avoids stale-closure bugs from running setState in a
   *  loop, and avoids re-render thrash. */
  const updateSelected = (patch: Partial<EditorElement>) => {
    if (selectedIds.length === 0) return;
    const sel = new Set(selectedIds);
    setOutBlob(null);
    setElements((prev) =>
      prev.map((e) =>
        sel.has(e.id) ? ({ ...e, ...patch } as EditorElement) : e,
      ),
    );
  };
  /** Toggle lock for the whole selection. If *any* element in the selection
   *  is currently unlocked, the action locks everything; otherwise it
   *  unlocks. Mirrors how Figma's lock toggle behaves on multi-select. */
  const lockSelected = () => {
    if (selectedIds.length === 0) return;
    const sel = new Set(selectedIds);
    const anyUnlocked = elements.some((e) => sel.has(e.id) && !e.locked);
    updateSelected({ locked: anyUnlocked } as Partial<EditorElement>);
  };
  /** If 2+ elements are selected and they aren't already in one group,
   *  assign a fresh groupId to all of them. If everything in the
   *  selection already shares a single groupId, this acts as ungroup. */
  const groupSelected = () => {
    if (selectedIds.length === 0) return;
    const sel = new Set(selectedIds);
    const selEls = elements.filter((e) => sel.has(e.id));
    const ids = new Set(selEls.map((e) => e.groupId).filter(Boolean));
    const allSameGroup =
      ids.size === 1 && selEls.every((e) => !!e.groupId);
    if (allSameGroup) {
      updateSelected({ groupId: undefined } as Partial<EditorElement>);
    } else if (selEls.length >= 2) {
      updateSelected({ groupId: newGroupId() } as Partial<EditorElement>);
    }
  };
  /** Delete every selected element in one pass and clear the selection. */
  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    const sel = new Set(selectedIds);
    setOutBlob(null);
    setElements((prev) => prev.filter((e) => !sel.has(e.id)));
    setSelectedIds([]);
  };
  /** Duplicate the selected elements: clone each with a fresh id, offset
   *  +12px down/right so the copy is visible, and select the new copies.
   *  Group ids are remapped so copies of a group stay grouped together but
   *  don't share the original group id. */
  const duplicateSelected = () => {
    if (selectedIds.length === 0) return;
    const sel = new Set(selectedIds);
    const selEls = elements.filter((e) => sel.has(e.id));
    if (selEls.length === 0) return;
    const groupMap = new Map<string, string>();
    const onPage = elements.filter((e) => e.pageIndex === activePage);
    let nextZ = onPage.length ? Math.max(...onPage.map((e) => e.z)) + 1 : 1;
    const copies: EditorElement[] = selEls.map((e) => {
      let newGid: string | undefined;
      if (e.groupId) {
        if (!groupMap.has(e.groupId)) groupMap.set(e.groupId, newGroupId());
        newGid = groupMap.get(e.groupId);
      }
      return {
        ...e,
        id: nextId(),
        x: e.x + 12,
        y: e.y + 12,
        z: nextZ++,
        groupId: newGid,
      } as EditorElement;
    });
    setOutBlob(null);
    setElements((prev) => [...prev, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
  };
  /** Run @imgly background removal on a single image element and replace
   *  its src with the transparent-PNG result. Selection-driven; safe no-op
   *  when the focal element isn't an image. */
  const removeBgSelected = async () => {
    if (selectedIds.length === 0) return;
    const primaryId = selectedIds[selectedIds.length - 1];
    const el = elements.find((e) => e.id === primaryId);
    if (!el || el.type !== "image") return;
    setBusy(true);
    setError(null);
    setProgress("Removing background…");
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const resp = await fetch((el as ImageEl).src);
      const blob = await resp.blob();
      const out = await removeBackground(blob);
      const dataUrl = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result as string);
        fr.onerror = rej;
        fr.readAsDataURL(out);
      });
      setOutBlob(null);
      setElements((prev) =>
        prev.map((e) =>
          e.id === el.id ? ({ ...e, src: dataUrl } as ImageEl) : e,
        ),
      );
      setProgress("Background removed.");
      window.setTimeout(() => setProgress(""), 1500);
    } catch (e: any) {
      console.error("Remove background failed", e);
      setError(`Remove background failed: ${e?.message ?? e ?? "unknown error"}`);
    } finally {
      setBusy(false);
    }
  };
  /** Tighten an image element's bounding box by trimming N% off each side
   *  via canvas crop — quick "crop" affordance for extracted photos. */
  const cropSelected = async () => {
    if (selectedIds.length === 0) return;
    const primaryId = selectedIds[selectedIds.length - 1];
    const el = elements.find((e) => e.id === primaryId);
    if (!el || el.type !== "image") return;
    const trimPct = 0.1; // 10% off each side per click
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.crossOrigin = "anonymous";
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = (el as ImageEl).src;
      });
      const sx = Math.round(img.naturalWidth * trimPct);
      const sy = Math.round(img.naturalHeight * trimPct);
      const sw = img.naturalWidth - sx * 2;
      const sh = img.naturalHeight - sy * 2;
      if (sw < 4 || sh < 4) return;
      const c = document.createElement("canvas");
      c.width = sw;
      c.height = sh;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const dataUrl = c.toDataURL("image/png");
      const newW = el.width * (1 - trimPct * 2);
      const newH = el.height * (1 - trimPct * 2);
      setOutBlob(null);
      setElements((prev) =>
        prev.map((e) =>
          e.id === el.id
            ? ({
                ...e,
                src: dataUrl,
                x: e.x + (e.width - newW) / 2,
                y: e.y + (e.height - newH) / 2,
                width: newW,
                height: newH,
              } as ImageEl)
            : e,
        ),
      );
    } catch (e: any) {
      console.error("Crop failed", e);
      setError(`Crop failed: ${e?.message ?? e ?? "unknown error"}`);
    }
  };
  /** Drag delta from a Rnd-driven element drag: shift every other element
   *  in the same group by the same (dx, dy) so groups travel as a unit.
   *  Locked siblings are skipped — a pinned element must stay pinned even
   *  when an unlocked groupmate is moved. (Without this guard, lock could
   *  be silently bypassed by grouping a locked element with an unlocked
   *  one and dragging the unlocked one.) */
  const dragGroup = (anchorId: string, dx: number, dy: number) => {
    const anchor = elements.find((e) => e.id === anchorId);
    if (!anchor || !anchor.groupId) return;
    const gid = anchor.groupId;
    setOutBlob(null);
    setElements((prev) =>
      prev.map((e) =>
        e.id !== anchorId && e.groupId === gid && !e.locked
          ? ({ ...e, x: e.x + dx, y: e.y + dy } as EditorElement)
          : e,
      ),
    );
  };

  const bringForward = (id: string) => {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const maxZ = Math.max(...elements.filter((e) => e.pageIndex === el.pageIndex).map((e) => e.z));
    updateEl(id, { z: maxZ + 1 });
  };
  const sendBackward = (id: string) => {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const minZ = Math.min(...elements.filter((e) => e.pageIndex === el.pageIndex).map((e) => e.z));
    updateEl(id, { z: minZ - 1 });
  };
  // Move one step up/down — swap z with the immediate neighbor on this page.
  const moveLayer = (id: string, dir: 1 | -1) => {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const onPage = elements
      .filter((e) => e.pageIndex === el.pageIndex)
      .sort((a, b) => a.z - b.z);
    const idx = onPage.findIndex((e) => e.id === id);
    const swapWith = onPage[idx + dir];
    if (!swapWith) return;
    setOutBlob(null);
    setElements((prev) =>
      prev.map((e) => {
        if (e.id === el.id) return { ...e, z: swapWith.z };
        if (e.id === swapWith.id) return { ...e, z: el.z };
        return e;
      }),
    );
  };

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!file || pages.length === 0) return;
    setBusy(true);
    setProgress("Saving PDF…");
    setError(null);
    setOutBlob(null);
    try {
      // Build per-page overlays: serialize each painted mask to PNG dataURL,
      // and include any applied crop rect.
      const overlays: Record<number, PageOverlays> = {};
      for (const [pageIdx, imgData] of maskDataRef.current) {
        const c = document.createElement("canvas");
        c.width = imgData.width;
        c.height = imgData.height;
        c.getContext("2d")!.putImageData(imgData, 0, 0);
        overlays[pageIdx] = { ...(overlays[pageIdx] ?? {}), maskDataUrl: c.toDataURL("image/png") };
      }
      for (const [pageIdx, rect] of cropRects) {
        overlays[pageIdx] = { ...(overlays[pageIdx] ?? {}), cropRect: rect };
      }
      // Flag pages whose original raster background should be wiped to
      // pure white before drawing mask + elements. Per-user request,
      // this kills any moiré, scan-line, or table-grid noise that
      // survived OCR's "skip borders" instruction.
      for (const pageIdx of cleanBgPages) {
        overlays[pageIdx] = {
          ...(overlays[pageIdx] ?? {}),
          cleanBackground: true,
          // Pre-cleaned PNG dataUrl — bright pixels snapped to white,
          // dark pixels (text, table lines, QR cells, stamps) preserved.
          // exportEditedPdf will embed this as the new background; if
          // it's missing for any reason it falls back to a solid white
          // rect (the original behaviour) so the export never crashes.
          cleanBgImageDataUrl: cleanBgImagesRef.current.get(pageIdx),
        };
      }
      const blob = await exportEditedPdf(
        file,
        elements,
        pages.map((p) => p.pageMeta),
        overlays,
      );
      setOutBlob(blob);
    } catch (e) {
      console.error(e);
      setError("Failed to export the edited PDF.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  // ── UI ───────────────────────────────────────────────────────────────────
  return (
    <ToolLayout tool={tool} fullBleed={files.length > 0}>
      {!file && (
        <>
          <DropZone
            accept="application/pdf"
            files={files}
            onFiles={(f) => setFiles(f.slice(0, 1))}
            label="Drop a PDF to start editing"
            hint="Add photos, signatures, icons, text, shapes, and white-out — all in your browser"
            maxSizeMb={50}
          />
        </>
      )}

      {/* Errors only render outside Smart Text Edit (file load, export, etc).
          The cascade itself swallows all engine errors so the user sees only
          the progress bar — never an "OCR couldn't read" / "quota reached"
          message. */}
      {error && (
        <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {file && (
        <div className="space-y-4">
          {/* Royal Purple Prime Toolbar.
              MOBILE LAYOUT: sticky to viewport top so scrolling a long PDF
              still leaves every tool one tap away (toolbar would otherwise
              scroll off-screen as the user pans the page). Single horizontal
              scroll row instead of `flex-wrap` so the toolbar takes ONE row,
              not four — that frees ~120 px of vertical real-estate on
              360 × 640 phones, which is the difference between seeing half
              the page header vs the whole header.
              DESKTOP LAYOUT (md+): static, wraps as before. */}
          <div
            data-pdf-toolbar="true"
            className="rounded-2xl bg-gradient-to-r from-purple-700 via-violet-700 to-purple-800 p-2 sm:p-3 shadow-lg shadow-purple-300/40 border border-amber-400/30 sticky top-0 z-30 md:static"
          >
            <div className="flex md:flex-wrap items-center gap-1.5 sm:gap-2 overflow-x-auto md:overflow-visible -mx-1 px-1 min-w-0 max-w-full">
              <ToolBtn
                active={tool_ === "select"}
                onClick={() => setToolMode("select")}
                icon={<MousePointer2 className="h-4 w-4" />}
                label="Select"
              />
              <Divider />
              {/* Undo / Redo — disabled when stacks are empty so users get
                  a visual cue. Buttons are slightly translucent in the
                  disabled state via opacity-40. */}
              <ToolBtn
                onClick={undo}
                disabled={historyPastRef.current.length === 0}
                icon={<Undo className="h-4 w-4" />}
                label="Undo"
              />
              <ToolBtn
                onClick={redo}
                disabled={historyFutureRef.current.length === 0}
                icon={<Redo className="h-4 w-4" />}
                label="Redo"
              />
              <Divider />
              <ToolBtn
                onClick={() => imgInputRef.current?.click()}
                icon={<ImagePlus className="h-4 w-4" />}
                label="Photo"
              />
              <ToolBtn
                onClick={() => setShowIcons(true)}
                icon={<Sparkles className="h-4 w-4" />}
                label="Icon"
              />
              <ToolBtn
                onClick={() => sigInputRef.current?.click()}
                icon={<PenTool className="h-4 w-4" />}
                label="Signature"
              />
              <Divider />
              <ToolBtn onClick={addText} icon={<Type className="h-4 w-4" />} label="Text" />
              {/* Single one-click extraction button. Internally cascades
                  through pdfjs → Tesseract → Vision in silence so the user
                  doesn't have to know about engines, drag rectangles, or
                  retry failed scans — they just see a 0–100% progress bar. */}
              <ToolBtn
                onClick={runSmartTextEdit}
                icon={<WandSparkles className="h-4 w-4" />}
                label={extractedPages.has(activePage) ? "Smart Edit ✓" : "Smart Text Edit"}
                glow={!extractedPages.has(activePage)}
              />
              {extractedPages.has(activePage) &&
                smartEditSnapshotsRef.current.has(activePage) && (
                  <ToolBtn
                    onClick={() => revertSmartEdit(activePage)}
                    icon={<Undo2 className="h-4 w-4" />}
                    label="Undo Smart"
                  />
                )}
              {/* Clean BG button removed by request — the cleaned-page
                  raster still auto-enables on Smart Text Edit success
                  (so exports stay print-clean), but the toggle button
                  is no longer surfaced in the toolbar. */}
              <ToolBtn onClick={() => addShape("rect")} icon={<Square className="h-4 w-4" />} label="Box" />
              <ToolBtn onClick={addLine} icon={<Minus className="h-4 w-4" />} label="Line" />
              <ToolBtn onClick={() => addShape("circle")} icon={<Circle className="h-4 w-4" />} label="Circle" />
              <ToolBtn onClick={addArrow} icon={<ArrowRight className="h-4 w-4" />} label="Arrow" />
              <ToolBtn onClick={addRight} icon={<Check className="h-4 w-4" style={{ color: shapeColor }} />} label="Right" />

              {/* Shape colour swatch + quick palette + Fill toggle. The
                  swatch acts as both the live colour preview and as the
                  trigger for the native colour picker (label wraps the
                  invisible <input type="color">). The four chips give
                  one-tap access to the most-used review colours. */}
              <div
                className="flex items-center gap-1 px-1.5 py-1 rounded-lg bg-white/10"
                title="Colour for new Box / Line / Circle / Arrow / Right"
              >
                <label className="relative inline-flex items-center justify-center h-6 w-6 rounded-md ring-2 ring-white/30 cursor-pointer overflow-hidden"
                  style={{ background: shapeColor }}
                  title="Pick custom colour"
                >
                  <input
                    type="color"
                    value={shapeColor}
                    onChange={(e) => setShapeColor(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    data-testid="shape-color-picker"
                  />
                </label>
                {(["#dc2626", "#0f172a", "#16a34a", "#2563eb"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setShapeColor(c)}
                    className={`h-4 w-4 rounded-full ring-1 ring-white/40 transition-transform ${
                      shapeColor.toLowerCase() === c ? "scale-125 ring-2 ring-amber-300" : "hover:scale-110"
                    }`}
                    style={{ background: c }}
                    title={c}
                    aria-label={`Use colour ${c}`}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setShapeFilled((f) => !f)}
                  className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-colors ${
                    shapeFilled
                      ? "bg-amber-400 text-purple-950"
                      : "bg-white/10 text-amber-100 hover:bg-white/20"
                  }`}
                  title="Toggle filled vs outline (Box / Circle)"
                  data-testid="shape-fill-toggle"
                >
                  {shapeFilled ? "FILL" : "OUTLINE"}
                </button>
              </div>
              <Divider />
              <ToolBtn
                active={tool_ === "erase"}
                onClick={() => {
                  setSelectedId(null);
                  setToolMode(tool_ === "erase" ? "select" : "erase");
                }}
                icon={<Eraser className="h-4 w-4" />}
                label="AI Erase"
              />
              <ToolBtn
                active={tool_ === "restore"}
                onClick={() => {
                  setSelectedId(null);
                  setToolMode(tool_ === "restore" ? "select" : "restore");
                }}
                icon={<Undo2 className="h-4 w-4" />}
                label="Restore"
              />
              {(tool_ === "erase" || tool_ === "restore") && (
                <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/10">
                  <span className="text-[10px] font-bold text-amber-200">Brush</span>
                  <input
                    type="range"
                    min={6}
                    max={120}
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-20 accent-amber-400"
                  />
                  <span className="text-[10px] font-mono text-white w-7 text-right">{brushSize}</span>
                  {paintedPages.has(activePage) && (
                    <button
                      onClick={clearMaskForActive}
                      className="text-[10px] font-bold text-amber-200 hover:text-amber-100 underline"
                      title="Clear all erase marks on this page"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
              <Divider />
              {/* Extract Object — drag a box around a QR / photo / table /
                  stamp to lift it off the page as a movable, resizable
                  ImageEl. Behaves like the deep-scan rect drag UX (cyan
                  banner + cyan crop overlay). */}
              <ToolBtn
                active={tool_ === "extractObject"}
                onClick={() => {
                  setSelectedIds([]);
                  setToolMode(
                    tool_ === "extractObject" ? "select" : "extractObject",
                  );
                }}
                icon={<Scissors className="h-4 w-4" />}
                label="Extract"
              />
              <ToolBtn
                active={tool_ === "crop"}
                onClick={() => (tool_ === "crop" ? cancelCrop() : beginCrop())}
                icon={<CropIcon className="h-4 w-4" />}
                label={cropRects.has(activePage) ? "Cropped" : "Crop"}
              />
              {tool_ === "crop" && (
                <div className="flex items-center gap-1 px-1">
                  <button
                    onClick={applyCrop}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold"
                    title="Apply crop"
                  >
                    <Check className="h-3.5 w-3.5" /> Apply
                  </button>
                  <button
                    onClick={cancelCrop}
                    className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold"
                  >
                    Cancel
                  </button>
                  {cropRects.has(activePage) && (
                    <button
                      onClick={removeCrop}
                      className="px-2 py-1 rounded-md bg-red-500/80 hover:bg-red-500 text-white text-[11px] font-bold"
                      title="Remove crop on this page"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}

              <div className="flex-1" />

              <Button
                onClick={handleExport}
                disabled={busy}
                size="sm"
                className="bg-amber-400 hover:bg-amber-500 text-purple-900 font-bold shadow"
              >
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Save Edited PDF
              </Button>
              <Button
                onClick={() => {
                  setFiles([]);
                }}
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {progress && (
              <div className="mt-2 text-xs text-amber-100 flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> {progress}
              </div>
            )}
            {progressPct !== null && (
              <div className="mt-2">
                <Progress
                  value={progressPct}
                  className="h-2 bg-purple-900/40 [&>div]:bg-amber-400"
                />
              </div>
            )}
          </div>

          {/* Hidden file inputs */}
          <input
            ref={imgInputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.currentTarget.value = "";
              if (f) onPickImage(f, "image");
            }}
          />
          <input
            ref={sigInputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.currentTarget.value = "";
              if (f) setPendingSig(f);
            }}
          />

          {outBlob && (
            <ToolResult
              blob={outBlob}
              filename={`${file.name.replace(/\.pdf$/i, "")}-edited.pdf`}
              kind="pdf"
              fromSlug="pdf-editor-v2"
              subtitle="Edited PDF saved"
              requirePrime={requirePrime}
            />
          )}
          {primeGateModal}

          <div className="grid lg:grid-cols-[1fr_280px] gap-4">
            {/* Editor canvas */}
            <div className="min-w-0 space-y-3">
              {pages.length > 1 && (
                <div className="flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={activePage === 0}
                    onClick={() => {
                      setActivePage((p) => Math.max(0, p - 1));
                      setSelectedId(null);
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </Button>
                  <div className="text-sm font-semibold text-gray-700">
                    Page {activePage + 1} / {pages.length}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={activePage === pages.length - 1}
                    onClick={() => {
                      setActivePage((p) => Math.min(pages.length - 1, p + 1));
                      setSelectedId(null);
                    }}
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {pageRender ? (
                <PageCanvas
                  page={pageRender}
                  elements={pageElements}
                  selectedIds={selectedIds}
                  onSelect={(id, ev) => {
                    if (id === null) {
                      setSelectedIds([]);
                    } else {
                      selectElement(id, ev);
                    }
                  }}
                  onUpdate={updateEl}
                  onGroupDrag={dragGroup}
                  toolMode={tool_}
                  brushSize={brushSize}
                  storedMask={maskDataRef.current.get(activePage) ?? null}
                  onMaskChange={(d) => updateMaskForPage(activePage, d)}
                  cropDraft={cropDraft}
                  cropApplied={cropRects.get(activePage) ?? null}
                  onCropDraftChange={setCropDraft}
                  onDeepScan={runDeepScan}
                  onVisionDeepScan={runVisionDeepScan}
                  onExtractObject={runExtractObject}
                  cleanBg={cleanBgPages.has(activePage)}
                  cleanBgImageDataUrl={cleanBgImagesRef.current.get(activePage)}
                  onLockSelected={lockSelected}
                  onGroupSelected={groupSelected}
                  onDeleteSelected={deleteSelected}
                  onDuplicateSelected={duplicateSelected}
                  onRemoveBgSelected={removeBgSelected}
                  onCropSelected={cropSelected}
                />
              ) : (
                <div className="aspect-[3/4] rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-sm text-gray-400">
                  {busy ? progress || "Loading…" : "No pages yet"}
                </div>
              )}
            </div>

            {/* Properties panel */}
            <div data-pdf-properties-panel="true" className="space-y-4">
              <PropertiesPanel
                element={selected}
                onUpdate={updateEl}
                onDelete={deleteEl}
                onBringForward={bringForward}
                onSendBackward={sendBackward}
              />

              <LayersPanel
                elements={pageElements}
                selectedIds={selectedIds}
                onSelect={(id, ev) => selectElement(id, ev)}
                onDelete={deleteEl}
                onMove={moveLayer}
              />
            </div>
          </div>
        </div>
      )}

      {/* Icon library modal */}
      {showIcons && (
        <div
          data-pdf-keep-selection="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowIcons(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-lg text-gray-900">Icon Library</div>
              <button onClick={() => setShowIcons(false)} className="text-gray-500 hover:text-gray-900">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {ICON_LIBRARY.map((ic) => (
                <button
                  key={ic.name}
                  onClick={() => addIcon(ic.svg)}
                  className="rounded-xl border border-gray-200 hover:border-purple-400 hover:bg-purple-50 p-3 flex flex-col items-center gap-2 transition"
                >
                  <div
                    className="h-14 w-14 flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: ic.svg }}
                  />
                  <div className="text-xs font-medium text-gray-700 text-center">{ic.label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Signature upload format dialog */}
      {pendingSig && (
        <div
          data-pdf-keep-selection="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setPendingSig(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl border-4 border-purple-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-purple-700 to-purple-500 px-5 py-4">
              <h3 className="text-lg font-bold text-white">Choose signature format</h3>
              <p className="text-xs text-purple-100 mt-1">
                How should this signature be placed on the PDF?
              </p>
            </div>
            <div className="p-5 space-y-3">
              <button
                type="button"
                onClick={async () => {
                  const f = pendingSig;
                  setPendingSig(null);
                  await onPickImage(f, "signature", true);
                }}
                className="w-full text-left rounded-xl border-2 border-purple-200 hover:border-purple-500 hover:bg-purple-50 px-4 py-3 transition"
              >
                <div className="font-semibold text-purple-900">PNG (Transparent)</div>
                <div className="text-xs text-gray-600 mt-1">
                  Removes the white background — recommended for signatures on a white sheet.
                </div>
              </button>
              <button
                type="button"
                onClick={async () => {
                  const f = pendingSig;
                  setPendingSig(null);
                  await onPickImage(f, "signature", false);
                }}
                className="w-full text-left rounded-xl border-2 border-amber-200 hover:border-amber-500 hover:bg-amber-50 px-4 py-3 transition"
              >
                <div className="font-semibold text-amber-900">Original</div>
                <div className="text-xs text-gray-600 mt-1">
                  Keeps the image exactly as uploaded, including its background.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPendingSig(null)}
                className="w-full mt-2 text-sm text-gray-500 hover:text-gray-700 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}

function ToolBtn({
  icon,
  label,
  onClick,
  active,
  glow,
  disabled,
  tone = "amber",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  glow?: boolean;
  disabled?: boolean;
  // Lets a button advertise which engine it represents so the toolbar
  // colour matches the on-canvas overlay (emerald = local Deep Scan,
  // amber = Google AI). Defaults to amber to preserve existing styling.
  tone?: "amber" | "emerald";
}) {
  // Mobile: 40 px min hit target (Apple HIG / Material guideline minimum is
  // 44/48 — 40 is the sweet spot that fits 9-10 buttons in one horizontal-
  // scroll row on a 360 px phone without forcing the user to micro-tap).
  // `shrink-0` is critical so buttons don't compress inside the flex row.
  const base =
    "flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-lg text-xs font-bold transition shrink-0 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0";
  const tones = {
    amber: {
      active: "bg-amber-400 text-purple-900 shadow",
      glow: "bg-gradient-to-r from-amber-400 to-amber-500 text-purple-900 hover:from-amber-300 hover:to-amber-400 shadow-md shadow-amber-500/40 ring-1 ring-amber-300/60",
    },
    emerald: {
      active: "bg-emerald-400 text-emerald-950 shadow",
      glow: "bg-gradient-to-r from-emerald-400 to-emerald-500 text-emerald-950 hover:from-emerald-300 hover:to-emerald-400 shadow-md shadow-emerald-500/40 ring-1 ring-emerald-300/60",
    },
  } as const;
  const t = tones[tone];
  let cls = active
    ? `${base} ${t.active}`
    : glow
    ? `${base} ${t.glow}`
    : `${base} bg-white/10 text-white hover:bg-white/20`;
  if (disabled) cls += " opacity-40 cursor-not-allowed pointer-events-none";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
function Divider() {
  return <div className="h-6 w-px bg-white/20 mx-1" />;
}

function PageCanvas({
  page,
  elements,
  selectedIds,
  onSelect,
  onUpdate,
  onGroupDrag,
  toolMode,
  brushSize,
  storedMask,
  onMaskChange,
  cropDraft,
  cropApplied,
  onCropDraftChange,
  onDeepScan,
  onVisionDeepScan,
  onExtractObject,
  cleanBg,
  cleanBgImageDataUrl,
  onLockSelected,
  onGroupSelected,
  onDeleteSelected,
  onDuplicateSelected,
  onRemoveBgSelected,
  onCropSelected,
}: {
  page: PageRender;
  elements: EditorElement[];
  /** Every currently-selected id. The *primary* (focal) selection is the
   *  last entry — used to position the floating toolbar. */
  selectedIds: string[];
  /** Single-or-additive select. The optional `e.shiftKey` flag toggles the
   *  id in/out of `selectedIds` instead of replacing the whole selection. */
  onSelect: (
    id: string | null,
    e?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
  ) => void;
  onUpdate: (id: string, patch: Partial<EditorElement>) => void;
  /** Anchor-relative drag delta — the parent uses it to translate every
   *  other element with the same `groupId` by the same (dx, dy). */
  onGroupDrag?: (anchorId: string, dx: number, dy: number) => void;
  toolMode: ToolMode;
  brushSize: number;
  storedMask: ImageData | null;
  onMaskChange: (data: ImageData | null) => void;
  cropDraft: { x: number; y: number; w: number; h: number } | null;
  cropApplied: { x: number; y: number; w: number; h: number } | null;
  onCropDraftChange: (
    r: { x: number; y: number; w: number; h: number } | null,
  ) => void;
  onDeepScan: (region: { x: number; y: number; w: number; h: number }) => void;
  onVisionDeepScan: (region: { x: number; y: number; w: number; h: number }) => void;
  /** Crop the page raster inside the given display-px region and turn it
   *  into a movable / resizable ImageEl (see `runExtractObject` in parent). */
  onExtractObject?: (region: { x: number; y: number; w: number; h: number }) => void;
  /**
   * When true, the original page raster is hidden in the on-screen
   * editor preview so the user sees the same print-clean white
   * background that will appear in the exported PDF. Without this,
   * users would still see the noisy moiré / scan-line raster behind
   * their editable text on screen, making them think Clean BG didn't
   * work even though the export is clean.
   */
  cleanBg: boolean;
  /**
   * Pre-cleaned page image (PNG dataUrl) from `cleanPageBackground()`
   * — bright pixels (paper, moiré, scan halo, screen-photo cream tint)
   * snapped to white, dark pixels (text, table grid lines, QR cells,
   * stamps, signatures) preserved at their original tone. When set
   * alongside `cleanBg=true`, this image is shown as the background
   * instead of a blank white panel — so the editor preview matches
   * the export pixel-for-pixel.
   */
  cleanBgImageDataUrl?: string;
  /** Toggle lock on every selected element (Figma-style: any-unlocked → all-locked). */
  onLockSelected?: () => void;
  /** Group / ungroup the current selection — see groupSelected() in the parent. */
  onGroupSelected?: () => void;
  /** Delete every selected element. */
  onDeleteSelected?: () => void;
  /** Duplicate every selected element with a small offset. */
  onDuplicateSelected?: () => void;
  /** Run @imgly background removal on the focal image (no-op for non-images). */
  onRemoveBgSelected?: () => void;
  /** Quick crop on the focal image — trims a fixed % off each side. */
  onCropSelected?: () => void;
}) {
  const dispW = page.pageMeta.displayWidth;
  const dispH = page.pageMeta.displayHeight;
  const isBrush = toolMode === "erase" || toolMode === "restore";
  const isCrop = toolMode === "crop";
  const isDeepScan = toolMode === "deepScan";
  const isVisionScan = toolMode === "visionScan";
  const isExtractObject = toolMode === "extractObject";
  // All three engines share the same "drag a rectangle" UI; only the
  // dispatcher at pointerUp differs (deep-scan / vision-scan / extract).
  const isAreaScan = isDeepScan || isVisionScan || isExtractObject;

  // Deep-scan area selection: tracked in display-pixel space (same as the
  // canvas overlay), so we can hand the rect straight to extractAreaTextOCR.
  const scanStartRef = useRef<{ x: number; y: number } | null>(null);
  const [scanRect, setScanRect] = useState<
    { x: number; y: number; w: number; h: number } | null
  >(null);

  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Outer fit-wrapper. Holds scaled-down visual size while the inner canvas
  // ref keeps native (dispW × dispH) coordinate space — required so element
  // positions, OCR rects, brush strokes and PDF export math all stay valid
  // while the visual page shrinks to fit a 360 px phone.
  const fitWrapperRef = useRef<HTMLDivElement | null>(null);
  const paintingRef = useRef<{ painting: boolean; lastX: number; lastY: number }>({
    painting: false,
    lastX: 0,
    lastY: 0,
  });
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // Mobile fit-scale: when the container parent (Card body) is narrower than
  // the page's native displayWidth, we apply CSS `transform: scale()` to the
  // page so it visually fits without a horizontal page scrollbar — while
  // preserving the native coordinate space inside (so all element coords,
  // brush strokes, OCR rects and Rnd drag math remain pixel-accurate).
  // Rnd accepts a `scale` prop so its drag deltas are divided by this factor,
  // making touch/mouse drags feel 1:1 with the user's finger.
  // INITIAL fit-scale: don't start at 1 (which would paint the un-scaled
  // 820-px page for a single frame on a 360-px phone — the "flash of
  // overflowing canvas" bug user keeps reporting). Instead, take a best
  // guess from window.innerWidth so the very first paint is already fit.
  const [fitScale, setFitScale] = useState(() => {
    if (typeof window === "undefined") return 1;
    // Approximate available width: viewport minus typical container chrome
    // (page container px-3 = 24, Card body p-3 = 24, breathing buffer = 16).
    const guess = Math.max(1, window.innerWidth - 64);
    return Math.min(1, guess / Math.max(1, dispW));
  });

  // User-controlled zoom multiplier on top of fitScale. 1.0 = fit-to-screen
  // (default), >1 = zoom in (page becomes bigger than the viewport, parent
  // scroll wrapper enables horizontal scroll so the user can pan around to
  // edit small details precisely without resorting to the browser's pinch
  // zoom — which makes touch coordinates inconsistent with our Rnd math).
  const [userZoom, setUserZoom] = useState(1);
  const effectiveScale = fitScale * userZoom;
  const zoomIn = () => setUserZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)));
  const zoomOut = () => setUserZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
  const zoomReset = () => setUserZoom(1);

  // PRECISE first paint: sync-measure the actual parent.clientWidth BEFORE
  // the browser paints, so the user never sees the rough initial guess.
  // useLayoutEffect runs after DOM mutations but before paint commits.
  useLayoutEffect(() => {
    const parent = fitWrapperRef.current?.parentElement;
    if (!parent) return;
    // 16-px buffer = comfortable breathing space (8 px each side) PLUS the
    // canvas `border-2` (2 px each side). Tight 4-px buffer made the right
    // border visually touch the viewport edge on real Android Firefox
    // devices — bumping to 16 gives a clear visual margin.
    const available = Math.max(0, parent.clientWidth - 16);
    if (available > 0) {
      setFitScale(Math.min(1, available / Math.max(1, dispW)));
    }
  }, [dispW]);

  // LIVE updates: ResizeObserver for orientation changes / address-bar
  // hide/show / window resizes. Falls back to window resize/orientation
  // events if ResizeObserver isn't supported (very old browsers).
  useEffect(() => {
    const updateFitScale = () => {
      const parent = fitWrapperRef.current?.parentElement;
      if (!parent) return;
      const available = Math.max(0, parent.clientWidth - 16);
      if (available > 0) {
        setFitScale(Math.min(1, available / Math.max(1, dispW)));
      }
    };
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateFitScale);
      window.addEventListener("orientationchange", updateFitScale);
      return () => {
        window.removeEventListener("resize", updateFitScale);
        window.removeEventListener("orientationchange", updateFitScale);
      };
    }
    const target = fitWrapperRef.current?.parentElement;
    if (!target) return;
    const ro = new ResizeObserver(updateFitScale);
    ro.observe(target);
    return () => ro.disconnect();
  }, [dispW]);

  // Restore stored mask whenever the active page or its dims change.
  useEffect(() => {
    const c = maskCanvasRef.current;
    if (!c) return;
    c.width = dispW;
    c.height = dispH;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (storedMask && storedMask.width === c.width && storedMask.height === c.height) {
      ctx.putImageData(storedMask, 0, 0);
    }
  }, [page.index, dispW, dispH, storedMask]);

  // Convert pointer event to canvas-local coords (account for CSS scaling).
  const toCanvasXY = (e: React.PointerEvent) => {
    const c = maskCanvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  };

  // Brush painter.
  //   Erase  → opaque-white stroke + circle (source-over).
  //   Restore → clear pixels using clip+clearRect at every interpolated point
  //             along the line segment. clearRect ALWAYS sets RGBA to 0, so
  //             this is the most reliable way to erase canvas pixels.
  const drawBrushAt = (x: number, y: number, prevX: number | null, prevY: number | null) => {
    const c = maskCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const r = brushSize / 2;
    const px = prevX ?? x;
    const py = prevY ?? y;

    if (toolMode === "erase") {
      ctx.globalCompositeOperation = "source-over";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = brushSize;
      ctx.strokeStyle = "#ffffff";
      ctx.fillStyle = "#ffffff";
      if (prevX != null && prevY != null && (prevX !== x || prevY !== y)) {
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // RESTORE: stamp clearRect through a circular clip at many points along
    // the segment so we get a smooth, continuous erase swath.
    const dist = Math.hypot(x - px, y - py);
    const stepLen = Math.max(1, r / 2);
    const steps = Math.max(1, Math.ceil(dist / stepLen));
    const pad = 2;
    const size = brushSize + pad * 2;
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const cx = px + (x - px) * t;
      const cy = py + (y - py) * t;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.clearRect(cx - r - pad, cy - r - pad, size, size);
      ctx.restore();
    }
  };

  const onBrushPointerDown = (e: React.PointerEvent) => {
    if (!isBrush) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = toCanvasXY(e);
    drawBrushAt(x, y, null, null);
    paintingRef.current = { painting: true, lastX: x, lastY: y };
  };
  const onBrushPointerMove = (e: React.PointerEvent) => {
    if (!isBrush) return;
    const { x, y } = toCanvasXY(e);
    setCursorPos({ x, y });
    if (!paintingRef.current.painting) return;
    drawBrushAt(x, y, paintingRef.current.lastX, paintingRef.current.lastY);
    paintingRef.current.lastX = x;
    paintingRef.current.lastY = y;
  };
  const onBrushPointerUp = (e: React.PointerEvent) => {
    if (!isBrush) return;
    if (!paintingRef.current.painting) return;
    paintingRef.current.painting = false;
    const c = maskCanvasRef.current!;
    const ctx = c.getContext("2d")!;
    const data = ctx.getImageData(0, 0, c.width, c.height);
    // If the canvas is fully transparent after restore, clear the entry.
    let any = false;
    for (let i = 3; i < data.data.length; i += 4) {
      if (data.data[i] !== 0) {
        any = true;
        break;
      }
    }
    onMaskChange(any ? data : null);
    void e;
  };

  // ── Deep Scan area selection (single drag) ──────────────────────────────
  const onScanPointerDown = (e: React.PointerEvent) => {
    if (!isAreaScan) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = toCanvasXY(e);
    scanStartRef.current = { x, y };
    setScanRect({ x, y, w: 0, h: 0 });
  };
  const onScanPointerMove = (e: React.PointerEvent) => {
    if (!isAreaScan || !scanStartRef.current) return;
    const { x, y } = toCanvasXY(e);
    const s = scanStartRef.current;
    setScanRect({
      x: Math.min(s.x, x),
      y: Math.min(s.y, y),
      w: Math.abs(x - s.x),
      h: Math.abs(y - s.y),
    });
  };
  const onScanPointerUp = (e: React.PointerEvent) => {
    if (!isAreaScan || !scanStartRef.current) return;
    // CRITICAL: compute the final rect directly from the pointer-up event
    // and the captured drag-start ref, NOT from `scanRect` state. State can
    // lag the last pointermove by one render frame on fast drags, which used
    // to produce undersized scan/extract rects (e.g. crop missing the bottom
    // few pixels of the photo the user was selecting).
    const s = scanStartRef.current;
    const { x, y } = toCanvasXY(e);
    const finalRect = {
      x: Math.min(s.x, x),
      y: Math.min(s.y, y),
      w: Math.abs(x - s.x),
      h: Math.abs(y - s.y),
    };
    scanStartRef.current = null;
    setScanRect(null);
    if (finalRect.w > 8 && finalRect.h > 8) {
      // The same drag-rect feeds whichever engine is active.
      if (isExtractObject) onExtractObject?.(finalRect);
      else if (isVisionScan) onVisionDeepScan(finalRect);
      else onDeepScan(finalRect);
    }
  };
  // Fired when the OS interrupts the gesture (touch drift off-screen, system
  // alert, etc.) or the element loses pointer capture mid-drag. Without this
  // handler the drag refs stay dirty and the next pointerdown thinks a drag
  // is still in progress, freezing the brush / scan tool until page reload.
  const onPointerCancel = () => {
    // If a brush stroke was in flight when the OS yanked the gesture away,
    // commit whatever pixels the user already painted. Without this, the
    // stroke shows visually on the canvas but is silently lost on page-
    // switch / export, making erase feel unreliable on touch devices.
    if (paintingRef.current.painting) {
      paintingRef.current.painting = false;
      const c = maskCanvasRef.current;
      if (c) {
        const ctx = c.getContext("2d")!;
        const data = ctx.getImageData(0, 0, c.width, c.height);
        let any = false;
        for (let i = 3; i < data.data.length; i += 4) {
          if (data.data[i] !== 0) {
            any = true;
            break;
          }
        }
        onMaskChange(any ? data : null);
      }
    }
    scanStartRef.current = null;
    setScanRect(null);
    setCursorPos(null);
  };

  return (
    <div className="space-y-2">
    {/* Zoom controls — let the user enlarge the page beyond fit-to-screen
        so they can edit small QRs / dates / signatures precisely without
        triggering the browser's pinch-zoom (which desyncs touch coords
        from our Rnd math). When userZoom > 1, the outer scroll wrapper
        below enables horizontal scrolling so the oversized page can be
        panned around. */}
    <div className="flex items-center justify-end gap-1.5 px-1">
      <button
        type="button"
        onClick={zoomOut}
        disabled={userZoom <= 0.5}
        aria-label="Zoom out"
        className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-white border border-purple-200 text-purple-700 shadow-sm hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={zoomReset}
        aria-label="Fit to screen"
        title={`Zoom: ${Math.round(userZoom * 100)}% (tap to reset)`}
        className="h-8 min-w-[58px] px-2 inline-flex items-center justify-center gap-1 rounded-md bg-white border border-purple-200 text-purple-700 text-xs font-semibold shadow-sm hover:bg-purple-50"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        {Math.round(userZoom * 100)}%
      </button>
      <button
        type="button"
        onClick={zoomIn}
        disabled={userZoom >= 4}
        aria-label="Zoom in"
        className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-white border border-purple-200 text-purple-700 shadow-sm hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ZoomIn className="h-4 w-4" />
      </button>
    </div>
    {/* Outer scroll wrapper. When userZoom > 1, the inner fit-wrapper
        becomes wider than this column → overflow-x:auto kicks in and the
        user can pan horizontally to reach the right edge of the zoomed
        page. Vertical overflow stays visible so the whole page-content
        scrolls naturally inside the parent grid (more familiar on
        mobile than a nested vertical scrollbar). */}
    <div
      className="max-w-full"
      style={{
        overflowX: userZoom > 1 ? "auto" : "hidden",
        overflowY: "visible",
        WebkitOverflowScrolling: "touch",
      }}
    >
    <div
      ref={fitWrapperRef}
      className="mx-auto"
      style={{
        // Math.ceil (not round) so the wrapper is always >= the visual paint;
        // prevents any 1-px hairline clip on devices where the calculation
        // would otherwise round DOWN (e.g. dispW * 0.4385 → 359.6 → 359 px).
        width: Math.ceil(dispW * effectiveScale),
        height: Math.ceil(dispH * effectiveScale),
        // When zoomed in, allow horizontal overflow (parent scroller handles
        // the panning). When at fit, cap at parent width so the page can
        // never push the grid wider than the viewport.
        maxWidth: userZoom > 1 ? "none" : "100%",
        // CRITICAL: CSS `transform: scale()` only scales the inner element
        // VISUALLY — its LAYOUT box still measures the un-scaled dispW
        // (e.g. 820 px). Without `overflow: hidden` here, that 820 px layout
        // box overflows the (e.g.) 280 px wrapper, propagates upward, and
        // creates a horizontal page scroll on a 360 px phone. Clipping at
        // the wrapper kills the overflow at its source.
        overflow: "hidden",
      }}
    >
    <div
      ref={containerRef}
      className="relative rounded-xl overflow-hidden border-2 border-purple-200 shadow-lg bg-white select-none"
      style={{
        width: dispW,
        height: dispH,
        transform: effectiveScale !== 1 ? `scale(${effectiveScale})` : undefined,
        transformOrigin: "top left",
        touchAction: isBrush || isCrop || isAreaScan ? "none" : "auto",
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      {/* Page background — three possible states:
          1. Clean BG ON + cleaned image cached → show the cleaned raster
             (text/tables/QR/borders preserved, noise wiped). This is the
             primary path and matches the exported PDF pixel-for-pixel.
          2. Clean BG ON but no cached image (defensive fallback if the
             threshold pass somehow failed) → blank white panel.
          3. Clean BG OFF → original page raster, untouched. */}
      {cleanBg && cleanBgImageDataUrl ? (
        <img
          src={cleanBgImageDataUrl}
          alt={`Page ${page.index + 1} (cleaned)`}
          className="block w-full h-auto"
          draggable={false}
          onPointerDown={() => onSelect(null)}
        />
      ) : cleanBg ? (
        <div
          aria-label={`Page ${page.index + 1} (clean background)`}
          className="block w-full bg-white"
          style={{ height: dispH }}
          onPointerDown={() => onSelect(null)}
        />
      ) : (
        <img
          src={page.pageDataUrl}
          alt={`Page ${page.index + 1}`}
          className="block w-full h-auto"
          draggable={false}
          onPointerDown={() => onSelect(null)}
        />
      )}
      {/* Mask canvas — sits ABOVE the page image (so erase visually covers
          content) but BELOW interactive elements. When brush mode is active,
          it captures pointer events; otherwise it lets clicks pass through. */}
      <canvas
        ref={maskCanvasRef}
        width={dispW}
        height={dispH}
        className="absolute inset-0 w-full h-full"
        style={{
          pointerEvents: isBrush || isAreaScan ? "auto" : "none",
          cursor: isBrush || isAreaScan ? "crosshair" : "default",
          zIndex: 5,
        }}
        onPointerDown={(e) => {
          onBrushPointerDown(e);
          onScanPointerDown(e);
        }}
        onPointerMove={(e) => {
          onBrushPointerMove(e);
          onScanPointerMove(e);
        }}
        onPointerUp={(e) => {
          onBrushPointerUp(e);
          onScanPointerUp(e);
        }}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
        onPointerLeave={() => setCursorPos(null)}
      />
      {/* Area-scan hint banner: green for in-browser Tesseract Deep Scan,
          amber for cloud Google AI scan so the user knows which engine is
          armed. Both render in display-px space, matching scanRect coords. */}
      {isAreaScan && (
        <div
          className={`absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none rounded-full text-white text-[11px] font-bold px-3 py-1 shadow-lg flex items-center gap-1.5 ${
            isExtractObject
              ? "bg-cyan-600"
              : isVisionScan
              ? "bg-amber-600"
              : "bg-emerald-600"
          }`}
        >
          {isExtractObject ? (
            <Scissors className="h-3 w-3" />
          ) : isVisionScan ? (
            <Sparkles className="h-3 w-3" />
          ) : (
            <ScanSearch className="h-3 w-3" />
          )}
          {isExtractObject
            ? "Drag a box around the QR / photo / table to extract"
            : isVisionScan
            ? "Drag a box for Google AI deep scan"
            : "Drag a box around the text to deep-scan"}
        </div>
      )}
      {isAreaScan && scanRect && scanRect.w > 0 && scanRect.h > 0 && (
        <div
          className={`absolute pointer-events-none border-2 rounded-md shadow-md ${
            isExtractObject
              ? "border-cyan-500 bg-cyan-400/20"
              : isVisionScan
              ? "border-amber-500 bg-amber-400/20"
              : "border-emerald-500 bg-emerald-400/20"
          }`}
          style={{
            left: scanRect.x,
            top: scanRect.y,
            width: scanRect.w,
            height: scanRect.h,
            zIndex: 28,
          }}
        />
      )}
      {/* Brush size cursor preview — uses pixel-space left/top so it tracks
          the real pointer position (% in transform would be wrong here). */}
      {isBrush && cursorPos && (
        <div
          className="absolute pointer-events-none rounded-full border-2 shadow-lg"
          style={{
            left: cursorPos.x - brushSize / 2,
            top: cursorPos.y - brushSize / 2,
            width: brushSize,
            height: brushSize,
            borderColor: toolMode === "erase" ? "#7c3aed" : "#0ea5e9",
            borderStyle: toolMode === "restore" ? "dashed" : "solid",
            background:
              toolMode === "erase"
                ? "rgba(255,255,255,0.55)"
                : "rgba(14,165,233,0.18)",
            zIndex: 30,
          }}
        />
      )}
      {/* Existing elements above the mask (z-index ≥ 10).
          During brush/crop modes, freeze element interaction so the mask
          canvas / crop handles can capture all pointer events. */}
      <div
        className="absolute inset-0"
        style={{ zIndex: 10, pointerEvents: isBrush || isCrop || isAreaScan ? "none" : "auto" }}
      >
        {elements.map((el) => (
          <ElementView
            key={el.id}
            el={el}
            selected={selectedIds.includes(el.id)}
            scale={effectiveScale}
            onSelect={(ev) => onSelect(el.id, ev)}
            onUpdate={(patch) => onUpdate(el.id, patch)}
            onGroupDrag={(dx, dy) => onGroupDrag?.(el.id, dx, dy)}
          />
        ))}
      </div>

      {/* Floating action toolbar — appears above the *primary* (focal)
          selection. Lock / Group / Delete are always visible whenever
          ≥1 element is selected; font-formatting controls only render
          when the focal element is text and exactly one item is selected
          (otherwise they wouldn't apply unambiguously across the group). */}
      {!isBrush && !isCrop && (() => {
        const primaryId = selectedIds[selectedIds.length - 1];
        if (!primaryId) return null;
        const sel = elements.find((e) => e.id === primaryId);
        if (!sel) return null;
        return (
          <FloatingActionToolbar
            el={sel}
            selectionCount={selectedIds.length}
            dispW={dispW}
            dispH={dispH}
            onUpdate={(patch) => onUpdate(sel.id, patch)}
            onLock={() => onLockSelected?.()}
            onGroup={() => onGroupSelected?.()}
            onDelete={() => onDeleteSelected?.()}
            onDuplicate={() => onDuplicateSelected?.()}
            onRemoveBg={() => onRemoveBgSelected?.()}
            onCrop={() => onCropSelected?.()}
          />
        );
      })()}

      {/* Applied crop indicator (faded overlay outside the kept region) */}
      {cropApplied && !isCrop && (
        <CropMaskOverlay rect={cropApplied} dispW={dispW} dispH={dispH} dashed />
      )}

      {/* Crop draft (interactive Rnd to adjust) */}
      {isCrop && cropDraft && (
        <>
          <CropMaskOverlay rect={cropDraft} dispW={dispW} dispH={dispH} dashed={false} />
          <Rnd
            bounds="parent"
            scale={effectiveScale}
            size={{ width: cropDraft.w, height: cropDraft.h }}
            position={{ x: cropDraft.x, y: cropDraft.y }}
            onDragStop={(_e, d) =>
              onCropDraftChange({ x: d.x, y: d.y, w: cropDraft.w, h: cropDraft.h })
            }
            onResizeStop={(_e, _dir, ref, _delta, pos) =>
              onCropDraftChange({
                x: pos.x,
                y: pos.y,
                w: ref.offsetWidth,
                h: ref.offsetHeight,
              })
            }
            style={{ zIndex: 40 }}
            className="ring-2 ring-amber-400 ring-offset-1 ring-offset-purple-100"
          >
            <div className="w-full h-full bg-transparent cursor-move" />
          </Rnd>
        </>
      )}
    </div>
    </div>
    </div>
    </div>
  );
}

/** Renders a faded mask covering everything OUTSIDE the kept rectangle. */
function CropMaskOverlay({
  rect,
  dispW,
  dispH,
  dashed,
}: {
  rect: { x: number; y: number; w: number; h: number };
  dispW: number;
  dispH: number;
  dashed: boolean;
}) {
  // Build a CSS clip-path with even-odd to cut a rectangle out of a full-size box.
  return (
    <>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "rgba(15, 23, 42, 0.45)",
          clipPath: `polygon(
            0 0, ${dispW}px 0, ${dispW}px ${dispH}px, 0 ${dispH}px, 0 0,
            ${rect.x}px ${rect.y}px,
            ${rect.x}px ${rect.y + rect.h}px,
            ${rect.x + rect.w}px ${rect.y + rect.h}px,
            ${rect.x + rect.w}px ${rect.y}px,
            ${rect.x}px ${rect.y}px
          )`,
          zIndex: 35,
        }}
      />
      {dashed && (
        <div
          className="absolute pointer-events-none border-2 border-dashed border-amber-400"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
            zIndex: 36,
          }}
        />
      )}
    </>
  );
}

function ElementView({
  el,
  selected,
  scale = 1,
  onSelect,
  onUpdate,
  onGroupDrag,
}: {
  el: EditorElement;
  selected: boolean;
  /** CSS-transform fit-scale of the parent canvas. Forwarded to Rnd so its
   *  drag/resize math divides client-pixel deltas by this factor — keeps
   *  drags 1:1 with the user's finger when the page is visually shrunk to
   *  fit a phone. Defaults to 1 (no transform). */
  scale?: number;
  /** Pointer / drag origin; pass through `shiftKey` so the parent can do
   *  additive multi-select. Optional for callers that don't have an event. */
  onSelect: (e?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => void;
  onUpdate: (patch: Partial<EditorElement>) => void;
  /** Called on drag-stop with the (dx, dy) delta from the element's last
   *  saved position. Lets the parent move every sibling that shares this
   *  element's `groupId` by the same delta. No-op if the element is not
   *  in a group. */
  onGroupDrag?: (dx: number, dy: number) => void;
}) {
  const isExtracted = el.type === "text" && (el as TextEl).extracted;
  const isLocked = !!el.locked;
  const isGrouped = !!el.groupId;
  const isLineLike = el.type === "line" || el.type === "arrow";
  // Selected = thick amber ring. Locked = subtle slate-blue ring even when
  // not selected, so the user can spot what they've pinned. Grouped = a
  // very subtle dotted purple outline so groups read as a unit visually.
  // Extracted-text resting state stays borderless to keep the preview clean.
  const ringClass = selected
    ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-purple-100"
    : isLocked
    ? "ring-1 ring-slate-500/70"
    : isGrouped
    ? "ring-1 ring-purple-500/40"
    : isExtracted
    ? "hover:ring-1 hover:ring-emerald-500/70"
    : "ring-1 ring-purple-300/30 hover:ring-purple-400/60";
  // Lines/arrows are typically very thin (default height = 0 → bbox is only
  // 8px tall). With Rnd's default 10×10 handles, the top/bottom edges and
  // their corners overlap and become impossible to grab. We override the
  // handle styles so left/right/corner handles extend OUTSIDE the bbox into
  // the surrounding click area — this is the standard fix used by Figma /
  // Excalidraw for thin-stroke geometry. Top/bottom handles are hidden
  // because changing line height directly is non-obvious; users adjust the
  // bottom-right corner instead to make the line diagonal.
  const lineResizeHandleStyles = isLineLike
    ? {
        left: {
          width: "12px",
          height: "32px",
          top: "50%",
          left: "-6px",
          marginTop: "-16px",
          cursor: "ew-resize" as const,
        },
        right: {
          width: "12px",
          height: "32px",
          top: "50%",
          right: "-6px",
          marginTop: "-16px",
          cursor: "ew-resize" as const,
        },
        topLeft: { width: "14px", height: "14px", top: "-7px", left: "-7px" },
        topRight: { width: "14px", height: "14px", top: "-7px", right: "-7px" },
        bottomLeft: {
          width: "14px",
          height: "14px",
          bottom: "-7px",
          left: "-7px",
        },
        bottomRight: {
          width: "14px",
          height: "14px",
          bottom: "-7px",
          right: "-7px",
        },
        top: { display: "none" as const },
        bottom: { display: "none" as const },
      }
    : undefined;
  return (
    <Rnd
      bounds="parent"
      scale={scale}
      size={{ width: el.width, height: Math.max(8, el.height) }}
      position={{ x: el.x, y: el.y }}
      style={{ zIndex: el.z }}
      disableDragging={isLocked}
      enableResizing={!isLocked}
      resizeHandleStyles={lineResizeHandleStyles}
      // For line/arrow, enforce a minimum width so the user can't accidentally
      // resize the line down to zero (which would make it invisible AND
      // unselectable via the hit-test stroke). 24px gives a solid grabbable
      // baseline. Other element types use Rnd's natural defaults.
      minWidth={isLineLike ? 24 : undefined}
      // Selection is handled exclusively by the inner-div `onPointerDown`
      // (below). Forwarding shiftKey from onDragStart / onResizeStart on top
      // of that would call `onSelect` twice in the same gesture — and on
      // Shift-drag the second call would *toggle the element back out* of
      // selectedIds, leaving the user without anything selected mid-drag.
      onDragStop={(_e, d) => {
        const dx = d.x - el.x;
        const dy = d.y - el.y;
        onUpdate({ x: d.x, y: d.y });
        if (isGrouped && (dx !== 0 || dy !== 0) && onGroupDrag) {
          onGroupDrag(dx, dy);
        }
      }}
      onResizeStop={(_e, _dir, ref, _delta, pos) =>
        onUpdate({
          width: ref.offsetWidth,
          height: ref.offsetHeight,
          x: pos.x,
          y: pos.y,
        })
      }
      className={`group ${ringClass} rounded-sm pdf-element`}
    >
      <div
        data-pdf-element="true"
        className={`w-full h-full relative ${isLocked ? "cursor-not-allowed" : "cursor-move"}`}
        onPointerDown={(e) =>
          onSelect({
            shiftKey: e.shiftKey,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
          })
        }
        style={{
          // Only clip when a crop is actually set via the Crop sliders.
          // We deliberately DO NOT use `overflow:hidden` as a backstop —
          // a rotated image needs to extend past the bounding box (a
          // square rotated 45° pokes √2× beyond on each side), and any
          // box-clipping would chop off those corners and look like an
          // unwanted automatic crop. clipPath handles the explicit crop
          // independently of overflow, so we don't need both.
          clipPath: el.crop
            ? `inset(${el.crop.top}px ${el.crop.right}px ${el.crop.bottom}px ${el.crop.left}px)`
            : undefined,
          overflow: el.crop ? "hidden" : "visible",
        }}
      >
        <div
          className="w-full h-full"
          style={{
            transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
            transformOrigin: "center center",
          }}
        >
          {renderElementBody(el, onUpdate, onSelect)}
        </div>
      </div>
    </Rnd>
  );
}

function renderElementBody(
  el: EditorElement,
  onUpdate: (patch: Partial<EditorElement>) => void,
  onSelect: (e?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => void,
) {
  if (el.type === "image" || el.type === "icon" || el.type === "signature") {
    return <img src={el.src} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" />;
  }
  if (el.type === "rect") {
    return (
      <div
        className="w-full h-full"
        style={{
          border: `${el.strokeWidth}px solid ${el.strokeColor}`,
          background: el.fillColor ?? "transparent",
        }}
      />
    );
  }
  if (el.type === "circle") {
    return (
      <div
        className="w-full h-full"
        style={{
          border: `${el.strokeWidth}px solid ${el.strokeColor}`,
          background: el.fillColor ?? "transparent",
          borderRadius: "50%",
        }}
      />
    );
  }
  if (el.type === "arrow" || el.type === "line") {
    const w = el.width;
    const h = Math.max(1, el.height);
    const isArrow = el.type === "arrow";
    // Hit-test stroke width — at least 20px so users can reliably click on
    // the visible line to (re)select it. The visible line is usually only
    // 2-3px wide; without this fat invisible stroke, clicks on the line
    // would often miss the bbox (which is only 8px tall) and hit the page
    // background, deselecting instead. `pointerEvents: "stroke"` lets the
    // transparent path be a click target even though the parent SVG has
    // `pointer-events: none`.
    const hitStroke = Math.max(20, el.strokeWidth + 18);
    return (
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="pointer-events-none overflow-visible"
      >
        {isArrow && (
          <defs>
            <marker
              id={`ah-${el.id}`}
              markerWidth="10"
              markerHeight="10"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L6,3 z" fill={el.strokeColor} />
            </marker>
          </defs>
        )}
        {/* Invisible fat hit-test line — sits underneath the visible stroke
            and captures clicks anywhere within ~10px of the line, so the
            click reliably reaches the parent's pointerdown handler (which
            fires onSelect). Drawn FIRST so the visible line renders on top. */}
        <line
          x1={0}
          y1={0}
          x2={w}
          y2={h}
          stroke="transparent"
          strokeWidth={hitStroke}
          strokeLinecap="round"
          style={{ pointerEvents: "stroke" }}
        />
        <line
          x1={0}
          y1={0}
          x2={w}
          y2={h}
          stroke={el.strokeColor}
          strokeWidth={el.strokeWidth}
          strokeLinecap="round"
          markerEnd={isArrow ? `url(#ah-${el.id})` : undefined}
          style={{ pointerEvents: "none" }}
        />
      </svg>
    );
  }
  if (el.type === "text") {
    return <TextEditableBody el={el} onUpdate={onUpdate} onSelect={onSelect} />;
  }
  return null;
}

/**
 * Editable text body for a {@link TextEl}. Two important behaviours
 * the previous inline implementation lacked:
 *
 * 1. Unlimited typing — the contentEditable's content is managed via
 *    a ref + useEffect (NOT as a JSX child). Rendering `{el.text}` as
 *    a child caused React's reconciler to clobber typed characters on
 *    every parent re-render, which prevented users from extending an
 *    extracted text block. The ref-based sync only writes to the DOM
 *    when the model text differs from what's already there, so the
 *    user's caret position is preserved while typing.
 *
 * 2. Auto-grow height — on every keystroke we measure scrollHeight
 *    and, if the content has overflowed the current Rnd height, push
 *    a height update so the surrounding draggable box expands to fit.
 *    The user can still drag the resize handle to shrink it later.
 */
function TextEditableBody({
  el,
  onUpdate,
  onSelect,
}: {
  el: TextEl;
  onUpdate: (patch: Partial<EditorElement>) => void;
  onSelect: (e?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Sync external text changes (history undo, properties-panel edit)
  // into the DOM. Skip the write when the DOM already matches the
  // model — that's the user's own typing, and re-writing would reset
  // the caret to the start of the field.
  useEffect(() => {
    const node = ref.current;
    if (node && node.innerText !== el.text) {
      node.innerText = el.text;
    }
  }, [el.text]);

  // When the element is locked, we drop contentEditable entirely so the
  // browser shows a normal cursor and refuses keystrokes — and we let the
  // pointerdown bubble up so Rnd / canvas selection still works (instead of
  // being trapped by an editable that the user can't actually edit).
  const locked = !!el.locked;

  return (
    <div
      ref={ref}
      contentEditable={!locked}
      suppressContentEditableWarning
      onInput={(e) => {
        if (locked) return;
        const target = e.currentTarget;
        const newText = target.innerText;
        const patch: Partial<EditorElement> = { text: newText } as Partial<EditorElement>;
        const sh = target.scrollHeight;
        if (sh > el.height + 1) {
          (patch as any).height = sh + 8;
        }
        onUpdate(patch);
      }}
      onPointerDown={(e) => {
        if (locked) return; // bubble up so Rnd select works on locked text
        // Fire selection ourselves BEFORE stopping propagation. The parent
        // `data-pdf-element` div's pointerdown handler is what normally
        // calls onSelect, but contentEditable text needs to swallow the
        // event (otherwise Rnd would steal pointer-moves from caret/text-
        // selection drags inside the editable). Without this explicit call,
        // clicking on Smart-Edit-extracted words leaves the Properties
        // panel and Floating Toolbar empty — a critical regression that
        // made every extracted word un-selectable.
        onSelect({
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
        });
        e.stopPropagation();
      }}
      // NOTE: NO horizontal padding here. The PDF export draws each text line
      // anchored at exactly `xV` (no inset), so any padding in the editor
      // produces a horizontal shift between the editor preview and the
      // exported PDF — most visible on right-aligned text where the rightmost
      // glyph would sit 4 px from the box edge in the editor but flush right
      // in the PDF. Keeping these in lockstep is the only way Smart Text Edit
      // OCR replacements stay pixel-aligned with the original document.
      className="w-full h-full outline-none whitespace-pre-wrap break-words"
      style={{
        fontFamily:
          el.fontFamily === "Times"
            ? "Times, serif"
            : el.fontFamily === "Courier"
            ? "Courier, monospace"
            : "Helvetica, Arial, sans-serif",
        fontSize: el.fontSize,
        color: el.color,
        fontWeight: el.bold ? 700 : 400,
        fontStyle: el.italic ? "italic" : "normal",
        textDecoration: el.underline ? "underline" : "none",
        textAlign: el.align ?? "left",
        background: el.bgColor ?? "transparent",
        lineHeight: 1.2,
      }}
    />
  );
}

function PropertiesPanel({
  element,
  onUpdate,
  onDelete,
  onBringForward,
  onSendBackward,
}: {
  element: EditorElement | null;
  onUpdate: (id: string, patch: Partial<EditorElement>) => void;
  onDelete: (id: string) => void;
  onBringForward: (id: string) => void;
  onSendBackward: (id: string) => void;
}) {
  if (!element) {
    return (
      <div className="rounded-2xl border border-purple-200/60 bg-purple-50/40 p-4 text-xs text-purple-900/80">
        <div className="flex items-center gap-2 font-bold mb-1">
          <Palette className="h-4 w-4" /> Properties
        </div>
        Tap an element on the page to edit its properties.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-amber-300/40 bg-gradient-to-br from-amber-50 to-purple-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wider text-purple-900">
          {element.type}
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onSendBackward(element.id)} title="Send backward">
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onBringForward(element.id)} title="Bring forward">
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-red-600 hover:bg-red-50"
            onClick={() => onDelete(element.id)}
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {element.type === "text" && (
        <>
          <textarea
            value={(element as TextEl).text}
            onChange={(e) => onUpdate(element.id, { text: e.target.value } as any)}
            rows={2}
            className="w-full text-sm rounded-lg border border-purple-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-bold text-purple-900">
              Size
              <input
                type="number"
                value={(element as TextEl).fontSize}
                min={8}
                max={120}
                onChange={(e) => onUpdate(element.id, { fontSize: Number(e.target.value) } as any)}
                className="block w-full mt-1 rounded-md border border-purple-200 px-2 py-1 text-sm"
              />
            </label>
            <label className="text-[11px] font-bold text-purple-900">
              Color
              <input
                type="color"
                value={(element as TextEl).color}
                onChange={(e) => onUpdate(element.id, { color: e.target.value } as any)}
                className="block w-full mt-1 h-8 rounded-md border border-purple-200"
              />
            </label>
          </div>
          <select
            value={(element as TextEl).fontFamily}
            onChange={(e) => onUpdate(element.id, { fontFamily: e.target.value as any } as any)}
            className="w-full text-xs rounded-md border border-purple-200 px-2 py-1.5"
          >
            <option value="Helvetica">Helvetica</option>
            <option value="Times">Times</option>
            <option value="Courier">Courier</option>
          </select>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onUpdate(element.id, { bold: !(element as TextEl).bold } as any)}
              className={`text-xs font-bold rounded-md border px-2 py-1.5 ${
                (element as TextEl).bold ? "bg-purple-700 text-white border-purple-700" : "border-purple-200 text-purple-900"
              }`}
              title="Bold"
            >
              B
            </button>
            <button
              onClick={() => onUpdate(element.id, { italic: !(element as TextEl).italic } as any)}
              className={`text-xs italic rounded-md border px-2 py-1.5 ${
                (element as TextEl).italic ? "bg-purple-700 text-white border-purple-700" : "border-purple-200 text-purple-900"
              }`}
              title="Italic"
            >
              I
            </button>
            <button
              onClick={() => onUpdate(element.id, { underline: !(element as TextEl).underline } as any)}
              className={`text-xs rounded-md border px-2 py-1.5 flex items-center justify-center gap-1 ${
                (element as TextEl).underline ? "bg-purple-700 text-white border-purple-700" : "border-purple-200 text-purple-900"
              }`}
              title="Underline"
            >
              <Underline className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Alignment */}
          <div className="grid grid-cols-3 gap-2">
            {(["left", "center", "right"] as const).map((al) => {
              const cur = (element as TextEl).align ?? "left";
              const Icon = al === "left" ? AlignLeft : al === "center" ? AlignCenter : AlignRight;
              return (
                <button
                  key={al}
                  type="button"
                  onClick={() => onUpdate(element.id, { align: al } as any)}
                  title={`Align ${al}`}
                  className={`text-xs rounded-md border px-2 py-1.5 flex items-center justify-center ${
                    cur === al ? "bg-purple-700 text-white border-purple-700" : "border-purple-200 text-purple-900"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
          {/* Background (white-out) */}
          <label className="text-[11px] font-bold text-purple-900 flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!(element as TextEl).bgColor}
              onChange={(e) =>
                onUpdate(element.id, { bgColor: e.target.checked ? "#ffffff" : null } as any)
              }
            />
            White-out background
            {!!(element as TextEl).bgColor && (
              <input
                type="color"
                value={(element as TextEl).bgColor!}
                onChange={(e) => onUpdate(element.id, { bgColor: e.target.value } as any)}
                className="ml-auto h-7 w-10 rounded-md border border-purple-200"
                title="Background colour behind the text"
              />
            )}
          </label>
        </>
      )}

      {(element.type === "rect" || element.type === "circle") && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-bold text-purple-900">
              Stroke
              <input
                type="color"
                value={(element as ShapeEl).strokeColor}
                onChange={(e) => onUpdate(element.id, { strokeColor: e.target.value } as any)}
                className="block w-full mt-1 h-8 rounded-md border border-purple-200"
              />
            </label>
            <label className="text-[11px] font-bold text-purple-900">
              Width
              <input
                type="number"
                value={(element as ShapeEl).strokeWidth}
                min={0}
                max={20}
                onChange={(e) => onUpdate(element.id, { strokeWidth: Number(e.target.value) } as any)}
                className="block w-full mt-1 rounded-md border border-purple-200 px-2 py-1 text-sm"
              />
            </label>
          </div>
          <label className="text-[11px] font-bold text-purple-900 flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!(element as ShapeEl).fillColor}
              onChange={(e) =>
                onUpdate(element.id, {
                  fillColor: e.target.checked ? "#ffffff" : null,
                } as any)
              }
            />
            Fill
            {!!(element as ShapeEl).fillColor && (
              <input
                type="color"
                value={(element as ShapeEl).fillColor!}
                onChange={(e) => onUpdate(element.id, { fillColor: e.target.value } as any)}
                className="ml-auto h-7 w-10 rounded-md border border-purple-200"
              />
            )}
          </label>
        </>
      )}

      {(element.type === "arrow" || element.type === "line") && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-bold text-purple-900">
            Color
            <input
              type="color"
              value={(element as LineEl).strokeColor}
              onChange={(e) => onUpdate(element.id, { strokeColor: e.target.value } as any)}
              className="block w-full mt-1 h-8 rounded-md border border-purple-200"
            />
          </label>
          <label className="text-[11px] font-bold text-purple-900">
            Thickness
            <input
              type="number"
              value={(element as LineEl).strokeWidth}
              min={1}
              max={12}
              onChange={(e) => onUpdate(element.id, { strokeWidth: Number(e.target.value) } as any)}
              className="block w-full mt-1 rounded-md border border-purple-200 px-2 py-1 text-sm"
            />
          </label>
        </div>
      )}

      {/* ── Rotation (all element types) ───────────────────────────── */}
      <div className="rounded-lg bg-white/70 border border-purple-200 p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-purple-900">
            Rotation
          </span>
          <span className="text-[10px] font-mono text-purple-700">
            {Math.round(element.rotation ?? 0)}°
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={element.rotation ?? 0}
          onChange={(e) =>
            onUpdate(element.id, { rotation: Number(e.target.value) } as any)
          }
          className="w-full accent-purple-600"
        />
        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => onUpdate(element.id, { rotation: 0 } as any)}
            className="text-[10px] font-bold rounded border border-purple-200 hover:bg-purple-100 py-1"
          >
            0°
          </button>
          <button
            type="button"
            onClick={() =>
              onUpdate(element.id, {
                rotation: ((element.rotation ?? 0) + 270) % 360,
              } as any)
            }
            className="text-[10px] font-bold rounded border border-purple-200 hover:bg-purple-100 py-1"
            title="Rotate −90°"
          >
            −90
          </button>
          <button
            type="button"
            onClick={() =>
              onUpdate(element.id, {
                rotation: ((element.rotation ?? 0) + 90) % 360,
              } as any)
            }
            className="text-[10px] font-bold rounded border border-purple-200 hover:bg-purple-100 py-1"
            title="Rotate +90°"
          >
            +90
          </button>
          <button
            type="button"
            onClick={() => onUpdate(element.id, { rotation: 180 } as any)}
            className="text-[10px] font-bold rounded border border-purple-200 hover:bg-purple-100 py-1"
          >
            180°
          </button>
        </div>
      </div>

      {/* ── Crop (all element types) ───────────────────────────────── */}
      <div className="rounded-lg bg-white/70 border border-amber-200 p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
            <CropIcon className="h-3 w-3" /> Crop
          </span>
          {element.crop && (
            <button
              type="button"
              onClick={() => onUpdate(element.id, { crop: undefined } as any)}
              className="text-[10px] font-bold text-red-600 hover:text-red-700 underline"
            >
              Reset
            </button>
          )}
        </div>
        {(["left", "top", "right", "bottom"] as const).map((side) => {
          const max =
            side === "left" || side === "right"
              ? Math.max(0, element.width - (element.crop?.[side === "left" ? "right" : "left"] ?? 0) - 8)
              : Math.max(0, element.height - (element.crop?.[side === "top" ? "bottom" : "top"] ?? 0) - 8);
          const val = element.crop?.[side] ?? 0;
          return (
            <div key={side} className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-amber-900 capitalize w-12">
                {side}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0, Math.floor(max))}
                step={1}
                value={Math.min(val, max)}
                onChange={(e) => {
                  const next = {
                    left: element.crop?.left ?? 0,
                    top: element.crop?.top ?? 0,
                    right: element.crop?.right ?? 0,
                    bottom: element.crop?.bottom ?? 0,
                  };
                  next[side] = Number(e.target.value);
                  onUpdate(element.id, { crop: next } as any);
                }}
                className="flex-1 accent-amber-600"
              />
              <span className="text-[10px] font-mono text-amber-800 w-8 text-right">
                {Math.round(val)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-purple-700/70">
        Position: {Math.round(element.x)}, {Math.round(element.y)} • Size:{" "}
        {Math.round(element.width)}×{Math.round(element.height)} • Layer {element.z}
      </div>
    </div>
  );
}

function LayersPanel({
  elements,
  selectedIds,
  onSelect,
  onDelete,
  onMove,
}: {
  elements: EditorElement[];
  /** Full multi-selection so the panel can highlight every selected layer
   *  and not just the focal one — keeps the panel in sync with shift-click
   *  selection done on the canvas. */
  selectedIds: string[];
  /** Shift-click on a row toggles it in/out of the selection (consistent
   *  with shift-click on the canvas); a plain click replaces the selection
   *  with just the clicked layer. */
  onSelect: (id: string, e?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: 1 | -1) => void;
}) {
  const sorted = [...elements].sort((a, b) => b.z - a.z);
  const selectedSet = new Set(selectedIds);
  return (
    <div className="rounded-2xl border border-purple-200/60 bg-white p-3">
      <div className="text-xs font-bold uppercase tracking-wider text-purple-900 mb-2">
        Layers ({elements.length})
      </div>
      {sorted.length === 0 && (
        <div className="text-xs text-gray-400">Nothing on this page yet.</div>
      )}
      <div className="text-[10px] text-purple-700/60 mb-1.5">
        Top of list = front. Use ↑/↓ to reorder.
      </div>
      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
        {sorted.map((el, idx) => {
          const isTop = idx === 0;
          const isBottom = idx === sorted.length - 1;
          return (
            <div
              key={el.id}
              onClick={(e) =>
                onSelect(el.id, {
                  shiftKey: e.shiftKey,
                  ctrlKey: e.ctrlKey,
                  metaKey: e.metaKey,
                })
              }
              className={`flex items-center gap-1.5 rounded-md p-1.5 cursor-pointer text-xs ${
                selectedSet.has(el.id)
                  ? "bg-amber-100 border border-amber-300"
                  : "hover:bg-purple-50 border border-transparent"
              }`}
            >
              <span className="font-mono text-[10px] text-purple-700 w-6 shrink-0">
                L{el.z}
              </span>
              <span className="flex-1 truncate">
                {el.type}
                {el.type === "text"
                  ? `: ${(el as TextEl).text.slice(0, 18)}`
                  : ""}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(el.id, 1);
                }}
                disabled={isTop}
                title="Move up"
                className="rounded p-0.5 text-purple-700 hover:bg-purple-100 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(el.id, -1);
                }}
                disabled={isBottom}
                title="Move down"
                className="rounded p-0.5 text-purple-700 hover:bg-purple-100 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(el.id);
                }}
                title="Delete"
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}


/**
 * Mini-toolbar that floats above the *primary* selected element.
 *
 * Always shown actions (work on every element in `selectedIds`):
 *   • Lock / Unlock     — freezes drag / resize / text editing
 *   • Group / Ungroup   — link multiple elements so they translate together
 *   • Delete            — remove every selected element
 *
 * Conditional font-formatting controls (only when the focal element is text
 * AND exactly one element is selected — otherwise font controls would be
 * ambiguous across mixed selections):
 *   • Font size, Bold / Italic / Underline, Align, Colour, White-out bg
 */
function FloatingActionToolbar({
  el,
  selectionCount,
  dispW,
  dispH,
  onUpdate,
  onLock,
  onGroup,
  onDelete,
  onDuplicate,
  onRemoveBg,
  onCrop,
}: {
  el: EditorElement;
  selectionCount: number;
  dispW: number;
  dispH: number;
  onUpdate: (patch: Partial<EditorElement>) => void;
  onLock: () => void;
  onGroup: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onRemoveBg?: () => void;
  onCrop?: () => void;
}) {
  // Show full font row only on a *single* text selection — group selections
  // and non-text elements get the compact action-only toolbar.
  const isText = el.type === "text";
  const showText = isText && selectionCount === 1;
  const tEl = showText ? (el as TextEl) : null;

  // Image-only extras (Duplicate / Transparent-bg / Crop) — only meaningful
  // for an extracted photo or any imported image, and only when a single
  // image is the focal selection (mixed selections would make these
  // ambiguous).
  const isImage = el.type === "image";
  const showImageExtras = isImage && selectionCount === 1;

  // Shape (rect / circle) — single selection only so the swatch
  // unambiguously targets one element.
  const isShape = el.type === "rect" || el.type === "circle";
  const showShape = isShape && selectionCount === 1;
  const sEl = showShape ? (el as ShapeEl) : null;

  // Line / Arrow — single selection only.
  const isLine = el.type === "line" || el.type === "arrow";
  const showLine = isLine && selectionCount === 1;
  const lEl = showLine ? (el as LineEl) : null;

  // Width adapts to the rendered control set so the toolbar isn't wider than
  // it needs to be — keeps it from drifting off-page on small elements.
  // MOBILE: clamp the toolbar to the actual canvas width so on a 360-px
  // phone the 460-px text toolbar doesn't shoot past the right edge of
  // the screen. Inner content gets `overflow-x-auto` so all controls stay
  // tappable via a one-finger horizontal swipe inside the toolbar itself.
  const TOOLBAR_W_NATURAL = showText
    ? 460
    : showImageExtras
      ? 230
      : showShape
        ? 220
        : showLine
          ? 170
          : 130;
  const TOOLBAR_W = Math.min(TOOLBAR_W_NATURAL, Math.max(120, dispW - 8));
  const TOOLBAR_H = 36;
  const GAP = 8;
  const placeAbove = el.y >= TOOLBAR_H + GAP;
  const top = placeAbove ? el.y - TOOLBAR_H - GAP : el.y + el.height + GAP;
  let left = el.x + el.width / 2 - TOOLBAR_W / 2;
  left = Math.max(4, Math.min(left, dispW - TOOLBAR_W - 4));
  const clampedTop = Math.max(4, Math.min(top, dispH - TOOLBAR_H - 4));

  const btn =
    "h-7 w-7 inline-flex items-center justify-center rounded-md text-purple-900 hover:bg-purple-100";
  const btnActive = "bg-purple-700 text-white hover:bg-purple-700";

  // Group button state: enabled when (≥2 selected) OR (the focal element is
  // already grouped — in which case the click ungroups). Otherwise dimmed.
  const isGrouped = !!el.groupId;
  const canGroup = selectionCount >= 2 || isGrouped;

  return (
    <div
      data-pdf-mini-toolbar="true"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      // overflow-x-auto + flex-nowrap: when the natural toolbar width
      // exceeds the canvas, the inner controls become a one-finger
      // horizontal-scroll strip instead of getting clipped off-screen.
      className="absolute z-50 flex flex-nowrap items-center gap-1 rounded-lg border border-purple-200 bg-white/95 px-1.5 py-1 shadow-lg backdrop-blur overflow-x-auto"
      style={{ top: clampedTop, left, width: TOOLBAR_W, height: TOOLBAR_H }}
    >
      {showText && tEl && (
        <>
          {/* Font size */}
          <button
            type="button"
            title="Decrease size"
            className={btn}
            onClick={() => onUpdate({ fontSize: Math.max(6, tEl.fontSize - 1) } as any)}
          >
            −
          </button>
          <span className="text-[11px] font-bold text-purple-900 w-7 text-center tabular-nums">
            {Math.round(tEl.fontSize)}
          </span>
          <button
            type="button"
            title="Increase size"
            className={btn}
            onClick={() => onUpdate({ fontSize: Math.min(200, tEl.fontSize + 1) } as any)}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>

          <span className="mx-0.5 h-5 w-px bg-purple-200" />

          {/* Bold / Italic / Underline */}
          <button
            type="button"
            title="Bold"
            className={`${btn} ${tEl.bold ? btnActive : ""} font-bold`}
            onClick={() => onUpdate({ bold: !tEl.bold } as any)}
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Italic"
            className={`${btn} ${tEl.italic ? btnActive : ""}`}
            onClick={() => onUpdate({ italic: !tEl.italic } as any)}
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Underline"
            className={`${btn} ${tEl.underline ? btnActive : ""}`}
            onClick={() => onUpdate({ underline: !tEl.underline } as any)}
          >
            <Underline className="h-3.5 w-3.5" />
          </button>

          <span className="mx-0.5 h-5 w-px bg-purple-200" />

          {/* Alignment */}
          {(["left", "center", "right"] as const).map((al) => {
            const Icon = al === "left" ? AlignLeft : al === "center" ? AlignCenter : AlignRight;
            const cur = tEl.align ?? "left";
            return (
              <button
                key={al}
                type="button"
                title={`Align ${al}`}
                className={`${btn} ${cur === al ? btnActive : ""}`}
                onClick={() => onUpdate({ align: al } as any)}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}

          <span className="mx-0.5 h-5 w-px bg-purple-200" />

          {/* Text colour */}
          <label className={`${btn} cursor-pointer relative`} title="Text colour">
            <Droplet className="h-3.5 w-3.5" style={{ color: tEl.color }} />
            <input
              type="color"
              value={tEl.color}
              onChange={(e) => onUpdate({ color: e.target.value } as any)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>

          {/* White-out background toggle */}
          <button
            type="button"
            title={tEl.bgColor ? "Remove background" : "Add white background"}
            className={`${btn} ${tEl.bgColor ? btnActive : ""}`}
            onClick={() => onUpdate({ bgColor: tEl.bgColor ? null : "#ffffff" } as any)}
          >
            <span
              className="block h-3.5 w-3.5 rounded-sm border border-purple-300"
              style={{ background: tEl.bgColor ?? "transparent" }}
            />
          </button>

          <span className="mx-0.5 h-5 w-px bg-purple-200" />
        </>
      )}

      {/* Shape (Box / Circle) — recolour stroke, recolour/clear fill, and
          adjust stroke width without re-creating the element. */}
      {showShape && sEl && (
        <>
          <label className={`${btn} cursor-pointer relative`} title="Stroke colour">
            <span
              className="block h-3.5 w-3.5 rounded-sm ring-1 ring-purple-300"
              style={{ background: sEl.strokeColor }}
            />
            <input
              type="color"
              value={sEl.strokeColor}
              onChange={(e) => onUpdate({ strokeColor: e.target.value } as any)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              data-testid="shape-stroke-color"
            />
          </label>
          <label className={`${btn} cursor-pointer relative`} title="Fill colour">
            <span
              className="block h-3.5 w-3.5 rounded-sm border border-purple-300"
              style={{
                background: sEl.fillColor ?? "transparent",
                backgroundImage: sEl.fillColor
                  ? undefined
                  : "linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%), linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%)",
                backgroundSize: "6px 6px",
                backgroundPosition: "0 0, 3px 3px",
              }}
            />
            <input
              type="color"
              value={sEl.fillColor ?? "#ffffff"}
              onChange={(e) => onUpdate({ fillColor: e.target.value } as any)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              data-testid="shape-fill-color"
            />
          </label>
          <button
            type="button"
            title={sEl.fillColor ? "Remove fill (outline only)" : "No fill"}
            className={btn}
            onClick={() => onUpdate({ fillColor: null } as any)}
            data-testid="shape-fill-clear"
          >
            <span className="text-[10px] font-bold text-purple-900">∅</span>
          </button>
          <button
            type="button"
            title="Thinner stroke"
            className={btn}
            onClick={() => onUpdate({ strokeWidth: Math.max(1, sEl.strokeWidth - 1) } as any)}
          >
            −
          </button>
          <span className="text-[10px] font-bold text-purple-900 w-4 text-center tabular-nums">
            {sEl.strokeWidth}
          </span>
          <button
            type="button"
            title="Thicker stroke"
            className={btn}
            onClick={() => onUpdate({ strokeWidth: Math.min(20, sEl.strokeWidth + 1) } as any)}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <span className="mx-0.5 h-5 w-px bg-purple-200" />
        </>
      )}

      {/* Line / Arrow — recolour stroke and adjust thickness. */}
      {showLine && lEl && (
        <>
          <label className={`${btn} cursor-pointer relative`} title="Stroke colour">
            <span
              className="block h-3.5 w-3.5 rounded-sm ring-1 ring-purple-300"
              style={{ background: lEl.strokeColor }}
            />
            <input
              type="color"
              value={lEl.strokeColor}
              onChange={(e) => onUpdate({ strokeColor: e.target.value } as any)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              data-testid="line-stroke-color"
            />
          </label>
          <button
            type="button"
            title="Thinner stroke"
            className={btn}
            onClick={() => onUpdate({ strokeWidth: Math.max(1, lEl.strokeWidth - 1) } as any)}
          >
            −
          </button>
          <span className="text-[10px] font-bold text-purple-900 w-4 text-center tabular-nums">
            {lEl.strokeWidth}
          </span>
          <button
            type="button"
            title="Thicker stroke"
            className={btn}
            onClick={() => onUpdate({ strokeWidth: Math.min(20, lEl.strokeWidth + 1) } as any)}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <span className="mx-0.5 h-5 w-px bg-purple-200" />
        </>
      )}

      {/* Image-only quick actions — only render for a single image
          selection so the buttons unambiguously target one photo. */}
      {showImageExtras && (
        <>
          <button
            type="button"
            title="Duplicate"
            className={btn}
            onClick={() => onDuplicate?.()}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Remove background (transparent PNG)"
            className={btn}
            onClick={() => onRemoveBg?.()}
          >
            <WandSparkles className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Crop (trim 10% off each side)"
            className={btn}
            onClick={() => onCrop?.()}
          >
            <CropIcon className="h-3.5 w-3.5" />
          </button>
          <span className="mx-0.5 h-5 w-px bg-purple-200" />
        </>
      )}

      {/* Lock toggle — uses Unlock icon when already locked so the icon
          *previews the action* (click → unlock), not the current state. */}
      <button
        type="button"
        title={el.locked ? "Unlock" : "Lock"}
        className={`${btn} ${el.locked ? btnActive : ""}`}
        onClick={onLock}
      >
        {el.locked ? (
          <Unlock className="h-3.5 w-3.5" />
        ) : (
          <Lock className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Group / Ungroup */}
      <button
        type="button"
        title={isGrouped ? "Ungroup" : "Group selected"}
        disabled={!canGroup}
        className={`${btn} ${isGrouped ? btnActive : ""} disabled:opacity-30 disabled:cursor-not-allowed`}
        onClick={onGroup}
      >
        {isGrouped ? (
          <UngroupIcon className="h-3.5 w-3.5" />
        ) : (
          <GroupIcon className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Delete (red — destructive) */}
      <button
        type="button"
        title={selectionCount > 1 ? `Delete ${selectionCount} items` : "Delete"}
        className={`${btn} text-red-600 hover:bg-red-100 hover:text-red-700`}
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
