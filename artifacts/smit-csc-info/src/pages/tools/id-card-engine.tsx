import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crop as CropIcon,
  Download,
  Loader2,
  Printer,
  Upload,
  Trash2,
  Plus,
  X,
  RotateCcw,
  RotateCw,
  ChevronRight,
  ChevronLeft,
  CreditCard,
  FileText,
  CheckCircle2,
  Lock,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import jsPDF from "jspdf";
import ReactCrop, {
  type Crop as RICCrop,
  type PixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { PrimeToolShell, GoldButton, GoldLoader } from "@/components/tools/prime-tool-shell";
import { getTool } from "@/components/tools/tools-data";
import { loadImage, canvasToBlob, MM_TO_PX_300 } from "@/lib/tools/canvas";
import { warpQuadToRect, sanitizeQuad, quadArea, type Quad, type Corner } from "@/lib/tools/perspective-warp";
import { downloadBlob } from "@/lib/tools/file";
import { usePrimeStatus } from "@/hooks/use-prime";
import { useAuth } from "@/hooks/use-auth";
import { usePrimeDownloadGate } from "@/hooks/use-prime-download-gate";
import { useAutoResumeDownload } from "@/hooks/use-auto-resume-download";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { saveBlob, loadBlob, clearBlob } from "@/lib/blob-store";
import { saveDraft, loadDraft, clearDraft } from "@/lib/draft-store";

// ── Constants ────────────────────────────────────────────────────────
type PageSize = "A4" | "4x6" | "5x7";
type CropTarget = "front" | "back";

// CARD dimensions per ISO/IEC 7810 ID-1 standard (2026-05-08 update):
// 85.6 mm × 54 mm. This is the canonical credit-card / ATM-card size
// used by Government of India for both Aadhaar PVC and the new EPIC
// Voter ID PVC. Earlier 86×56mm produced a NARROWER aspect (1.535)
// than the real card aspect (1.585), so when users cropped their
// scanned card edge-to-edge the locked marquee shaved 3% off the
// left+right edges (visible as the "Issue Date" strip and Aadhaar
// logo getting clipped in the captured thumbnail and printed sheet).
// 1.585:1 marquee now matches the physical card edge-to-edge.
// Used for: marquee aspect lock, captured canvas size
// (≈1011×638 px @ 300 DPI), print-sheet cell size, and PDF cell.
const CARD_W_MM = 85.6;
const CARD_H_MM = 54;
const CARD_ASPECT = CARD_W_MM / CARD_H_MM; // 1.5852…

// Print sheet packing parameters. Tuned so that A4 portrait packs
// exactly 5 horizontal pairs (the "Full" preset count). Reducing
// MARGIN to 4 and inter-pair GAP to 2 lets row 5 fit comfortably.
const SHEET_MARGIN_MM = 4;
const PAIR_GAP_MM = 2; // gap BETWEEN pairs (rows / cols)
const INNER_GAP_MM = 1; // gap INSIDE a pair (between Front and Back)

const PRESET_COPIES = [1, 2, 3, 4, 5] as const;
const MAX_COPIES = 50;

const PAGE_DIMS_MM: Record<PageSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  "4x6": { w: 102, h: 152 },
  "5x7": { w: 127, h: 178 },
};

// ── Types ────────────────────────────────────────────────────────────
interface PdfPageThumb {
  index: number;
  url: string; // blob URL of rendered page (JPEG)
  width: number;
  height: number;
}

interface DraftSource {
  // For images: pdfPages = null, sourceUrl = the image url.
  // For PDFs: pdfPages contains all rendered page blob URLs; the
  // "active" page chosen by the user becomes the cropper's source.
  sourceFile: File;
  pdfPages: PdfPageThumb[] | null;
  activePageIndex: number; // 0 for plain images
  cropperUrl: string; // the URL passed into <Cropper>
}

interface CardEntry {
  id: string;
  // We keep the ORIGINAL source around so the user can reopen the
  // wizard and re-crop either side without re-uploading.
  source: DraftSource;
  frontCanvas: HTMLCanvasElement;
  backCanvas: HTMLCanvasElement;
  frontUrl: string;
  backUrl: string;
  copies: number;
}

interface SheetCell {
  xMm: number;
  yMm: number;
  cardIndex: number; // which CardEntry
  side: "front" | "back";
  rotate: boolean;
}

interface SheetLayout {
  cells: SheetCell[];
  pairsFit: number; // total complete pairs that fit
  cellW: number; // mm — width of one side rendered on sheet
  cellH: number; // mm — height of one side rendered on sheet
  pairOrientation: "horizontal" | "vertical";
  cardRotated: boolean;
}

// ── PDF lazy loader (mirrors UploadsPanel pattern) ───────────────────
// `Map.prototype.getOrInsertComputed`, required by pdfjs-dist 5.6.x but
// not yet shipped in any browser engine, is polyfilled globally at app
// boot via src/lib/polyfills/map-get-or-insert.ts.
let pdfjsCache: any | null = null;
async function getPdfjs() {
  if (pdfjsCache) return pdfjsCache;
  const pdfjs: any = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  pdfjsCache = pdfjs;
  return pdfjs;
}

async function renderPdfPages(file: File): Promise<PdfPageThumb[]> {
  const pdfjs = await getPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pages: PdfPageThumb[] = [];

  // Render scale tuning (REVISED 2026-04-30 after a mobile-Firefox user
  // reported the page "reloading" after PDF upload — the actual cause
  // was Android killing the tab during high-memory PDF rasterisation).
  //
  // Mobile (≤ 900 px viewport): scale 1.25 (~90 DPI) — keeps a single
  //   A4 page canvas under ~5 MB so Firefox doesn't OOM the tab when
  //   it's briefly backgrounded by the file picker.
  // Desktop: scale 1.5 (~108 DPI) — still plenty of pixels for ID-card
  //   crops which max out at 86×56 mm @ 300 DPI = 1016×661 px.
  // Reducing from the original scale 2 (144 DPI) saves ~44% canvas
  // memory and dramatically improves stability on low-RAM phones with
  // no visible loss of cropping quality.
  const isMobile =
    typeof window !== "undefined" && window.innerWidth <= 900;
  const renderScale = isMobile ? 1.25 : 1.5;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
    // Explicitly free the page-level pdf.js internals + zero out the
    // canvas so the browser can GC them BEFORE we render the next
    // page. Without this, multi-page PDFs accumulate memory and
    // mobile tabs get killed before they finish.
    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;
    pages.push({
      index: p - 1,
      url: URL.createObjectURL(blob),
      width: viewport.width,
      height: viewport.height,
    });
  }
  return pages;
}

// ── Sheet packing — pair-adjacent (Front | Back) ─────────────────────
// Returns whichever orientation fits the most pairs. Each pair is
// emitted as TWO cells (one Front, one Back) so the renderer just
// loops cells without caring about pairing logic.
function packSheet(
  pageW: number,
  pageH: number,
  cards: CardEntry[],
): SheetLayout | null {
  if (cards.length === 0) return null;
  const totalPairsNeeded = cards.reduce((s, c) => s + c.copies, 0);
  if (totalPairsNeeded === 0) return null;

  // Each "candidate" describes how a SINGLE pair (one Front + one Back
  // touching) is arranged. cellW/H is the size of ONE side; pairW/H is
  // the bounding box of the whole pair. We try every reasonable combo.
  type Candidate = {
    pairOrientation: "horizontal" | "vertical";
    cardRotated: boolean;
    cellW: number;
    cellH: number;
    pairW: number;
    pairH: number;
  };

  const candidates: Candidate[] = [
    // Card UPRIGHT (86 wide × 56 tall), pair horizontal: F | B
    {
      pairOrientation: "horizontal",
      cardRotated: false,
      cellW: CARD_W_MM,
      cellH: CARD_H_MM,
      pairW: CARD_W_MM * 2 + INNER_GAP_MM,
      pairH: CARD_H_MM,
    },
    // Card UPRIGHT, pair vertical: F over B
    {
      pairOrientation: "vertical",
      cardRotated: false,
      cellW: CARD_W_MM,
      cellH: CARD_H_MM,
      pairW: CARD_W_MM,
      pairH: CARD_H_MM * 2 + INNER_GAP_MM,
    },
    // Card ROTATED 90° (56 wide × 86 tall), pair horizontal
    {
      pairOrientation: "horizontal",
      cardRotated: true,
      cellW: CARD_H_MM,
      cellH: CARD_W_MM,
      pairW: CARD_H_MM * 2 + INNER_GAP_MM,
      pairH: CARD_W_MM,
    },
    // Card ROTATED 90°, pair vertical
    {
      pairOrientation: "vertical",
      cardRotated: true,
      cellW: CARD_H_MM,
      cellH: CARD_W_MM,
      pairW: CARD_H_MM,
      pairH: CARD_W_MM * 2 + INNER_GAP_MM,
    },
  ];

  let best: SheetLayout | null = null;

  const usableW = pageW - SHEET_MARGIN_MM * 2;
  const usableH = pageH - SHEET_MARGIN_MM * 2;

  for (const c of candidates) {
    const cols = Math.max(0, Math.floor((usableW + PAIR_GAP_MM) / (c.pairW + PAIR_GAP_MM)));
    const rows = Math.max(0, Math.floor((usableH + PAIR_GAP_MM) / (c.pairH + PAIR_GAP_MM)));
    const pairCapacity = cols * rows;
    if (pairCapacity === 0) continue;

    // Flatten the per-card copy counts into a stream of pair slots,
    // each tagged with the originating cardIndex. We then place pairs
    // top-left to bottom-right; each pair emits 2 cells (F + B).
    const pairStream: number[] = []; // values = cardIndex
    for (let i = 0; i < cards.length; i++) {
      for (let k = 0; k < cards[i].copies; k++) pairStream.push(i);
    }

    const cells: SheetCell[] = [];
    let placed = 0;
    outer: for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (placed >= pairStream.length) break outer;
        const cardIndex = pairStream[placed++];
        const px = SHEET_MARGIN_MM + col * (c.pairW + PAIR_GAP_MM);
        const py = SHEET_MARGIN_MM + row * (c.pairH + PAIR_GAP_MM);
        if (c.pairOrientation === "horizontal") {
          cells.push({ xMm: px, yMm: py, cardIndex, side: "front", rotate: c.cardRotated });
          cells.push({
            xMm: px + c.cellW + INNER_GAP_MM,
            yMm: py,
            cardIndex,
            side: "back",
            rotate: c.cardRotated,
          });
        } else {
          cells.push({ xMm: px, yMm: py, cardIndex, side: "front", rotate: c.cardRotated });
          cells.push({
            xMm: px,
            yMm: py + c.cellH + INNER_GAP_MM,
            cardIndex,
            side: "back",
            rotate: c.cardRotated,
          });
        }
      }
    }

    // FIX 2026-05-08: Center the entire grid on the sheet. The packer
    // computes positions starting at SHEET_MARGIN_MM in the top-left,
    // which leaves all the leftover slack as white space on the RIGHT
    // and BOTTOM of the page (e.g. on A4 with 1 col × 5 rows of upright
    // pairs, ~29mm of unused width sat on the right). Visually this
    // looked unbalanced — users perceived the cards as being "pushed"
    // off to the left side of the sheet. We compute the actual content
    // bounding box from the placed cells and shift every cell so the
    // group is perfectly centered. This is purely a placement change;
    // pairsFit, cell dimensions, and per-card geometry are untouched,
    // so the printed cards remain exactly 86×56mm.
    if (cells.length > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const cl of cells) {
        if (cl.xMm < minX) minX = cl.xMm;
        if (cl.yMm < minY) minY = cl.yMm;
        if (cl.xMm + c.cellW > maxX) maxX = cl.xMm + c.cellW;
        if (cl.yMm + c.cellH > maxY) maxY = cl.yMm + c.cellH;
      }
      const dx = (pageW - (maxX - minX)) / 2 - minX;
      const dy = (pageH - (maxY - minY)) / 2 - minY;
      for (const cl of cells) {
        cl.xMm += dx;
        cl.yMm += dy;
      }
    }

    const layout: SheetLayout = {
      cells,
      pairsFit: cells.length / 2,
      cellW: c.cellW,
      cellH: c.cellH,
      pairOrientation: c.pairOrientation,
      cardRotated: c.cardRotated,
    };
    if (!best || layout.pairsFit > best.pairsFit) best = layout;
  }

  return best;
}

// Build a 300-DPI canvas (86×56mm = 1016×661px) from a percent-crop on
// the given source URL. Rotation is baked into the source URL upstream
// (see useEffect on rotation in the main component), so this function
// only deals with cropping, never rotation math.
//
// STRETCH-fit semantics (RESTORED 2026-04-29 evening, third iteration):
// The cropper marquee is LOCKED at the canonical 86:56 aspect via
// ReactCrop's `aspect` prop, so the user's crop rectangle is GUARANTEED
// to match the target canvas aspect. drawImage(... 0, 0, targetW, targetH)
// is therefore a 1:1 aspect mapping (no actual stretching).
//
// HISTORY: We briefly experimented with FREE-aspect + contain-fit
// (commit b09c04a) plus 4–8% safety buffers (cc65dd1, 9b8b7be) to
// forgive imprecise mobile touch drawing, but it produced confusing
// captures with white letterbox bands and persistent edge clipping.
// The user explicitly requested the original locked-aspect Photoshop-
// style behavior, where the marquee IS the card frame and what you
// see in the marquee is exactly what you get in the preview / print.
async function buildSideCanvas(
  sourceUrl: string,
  percentCrop: { x: number; y: number; width: number; height: number },
): Promise<HTMLCanvasElement> {
  const img = await loadImage(sourceUrl);
  const targetW = MM_TO_PX_300(CARD_W_MM);
  const targetH = MM_TO_PX_300(CARD_H_MM);

  const sx = (percentCrop.x / 100) * img.width;
  const sy = (percentCrop.y / 100) * img.height;
  const sw = (percentCrop.width / 100) * img.width;
  const sh = (percentCrop.height / 100) * img.height;

  const c = document.createElement("canvas");
  c.width = targetW;
  c.height = targetH;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // DIRECT 1:1 FILL (re-instated 2026-05-08 evening). The ReactCrop
  // marquee is `aspect`-locked at CARD_ASPECT (85.6/54 = 1.5852), so
  // the source rectangle (sw/sh) is GUARANTEED to share the canvas
  // aspect ratio. drawImage(... dx=0, dy=0, dw=targetW, dh=targetH)
  // therefore performs a clean 1:1 aspect mapping with NO stretch,
  // NO white letterbox/pillarbox and NO clipping — the captured card
  // fills the entire 1011×638 canvas edge-to-edge. The print-sheet
  // cell is built from this same canvas, so what's inside the marquee
  // is exactly what's printed.
  if (sw > 0 && sh > 0) {
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
  }
  return c;
}

// ─────────────────────────────────────────────────────────────────────
// 4-POINT PERSPECTIVE-CORRECTED CAPTURE (preferred path, 2026-05-08)
// ─────────────────────────────────────────────────────────────────────
// Replaces the rectangle-only flow with a quad-warp that lets the user
// mark each card CORNER (TL, TR, BR, BL) directly. The captured canvas
// is always exactly 1011 × 638 px (85.6 × 54 mm @ 300 DPI), the marked
// quadrilateral is bilinearly warped into that target rectangle, and
// any perspective skew in the source scan/photo is straightened out.
//
// Result: zero left/right cut, zero top/bottom cut, zero white border —
// because the user defined precisely which 4 image points become the
// 4 corners of the printed card.
//
// `quad` corners are stored as PERCENT of the rotated source image
// (independent of zoom/CSS-display size), so they remain valid across
// rotation, zoom, and re-edit cycles.
const DEFAULT_QUAD: Quad = [
  { x: 5, y: 5 },   // TL
  { x: 95, y: 5 },  // TR
  { x: 95, y: 95 }, // BR
  { x: 5, y: 95 },  // BL
];

async function buildSideCanvasFromQuad(
  sourceUrl: string,
  quadPct: Quad,
): Promise<HTMLCanvasElement> {
  const img = await loadImage(sourceUrl);
  const targetW = MM_TO_PX_300(CARD_W_MM);
  const targetH = MM_TO_PX_300(CARD_H_MM);
  // Sanitize first (re-orders any user-induced bow-tie / self-intersect
  // back to a canonical clockwise TL→TR→BR→BL polygon) THEN convert
  // percent-of-image to source pixels.
  const cleanPct = sanitizeQuad(quadPct);
  const srcQuad: Quad = [
    { x: (cleanPct[0].x / 100) * img.width, y: (cleanPct[0].y / 100) * img.height },
    { x: (cleanPct[1].x / 100) * img.width, y: (cleanPct[1].y / 100) * img.height },
    { x: (cleanPct[2].x / 100) * img.width, y: (cleanPct[2].y / 100) * img.height },
    { x: (cleanPct[3].x / 100) * img.width, y: (cleanPct[3].y / 100) * img.height },
  ];
  // Validity gate: refuse to capture if the user has collapsed the
  // quad below 1% of the source area (e.g. all 4 corners stacked on
  // one spot, or a near-line shape). Producing garbage output silently
  // is worse than asking the user to redraw.
  const area = Math.abs(quadArea(srcQuad));
  const minArea = 0.01 * img.width * img.height;
  if (area < minArea) {
    throw new Error(
      "The 4 corners are too close together. Drag each corner to a card corner so the highlighted area covers the whole card, then try again.",
    );
  }
  return warpQuadToRect(img, srcQuad, targetW, targetH, 24);
}

async function rotateImageUrl(sourceUrl: string, steps: 0 | 1 | 2 | 3): Promise<string> {
  if (steps === 0) return sourceUrl;
  const img = await loadImage(sourceUrl);
  const angle = steps * 90;
  const rad = (angle * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bw = Math.round(cos * img.width + sin * img.height);
  const bh = Math.round(sin * img.width + cos * img.height);
  const c = document.createElement("canvas");
  c.width = bw;
  c.height = bh;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, bw, bh);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(bw / 2, bh / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  const blob = await canvasToBlob(c, "image/jpeg", 0.95);
  return URL.createObjectURL(blob);
}

function freeDraftSource(d: DraftSource | null) {
  if (!d) return;
  if (d.pdfPages) {
    for (const p of d.pdfPages) URL.revokeObjectURL(p.url);
  } else {
    URL.revokeObjectURL(d.cropperUrl);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────
export default function IdCardEnginePage() {
  const tool = getTool("id-card-engine")!;
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { isPrime, resolved: primeResolved } = usePrimeStatus();
  const { requirePrime, modal: primeGateModal } = usePrimeDownloadGate({
    toolId: "id-card-engine",
    toolTitle: tool.title,
    actionLabel: "Download",
  });
  // Suppress unused-warnings for the wouter helper; we still keep
  // useLocation for any future navigations even though the paywall
  // no longer redirects to /membership.
  void setLocation;

  // Auto-resume the PDF download once a freshly-upgraded user lands
  // back on the page (intent stashed by use-prime-download-gate).
  // We re-declare `useAutoResumeDownload` further down so it can see
  // `cards`/`layout`/`handleGeneratePdf` after they're declared.

  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [pageSize, setPageSize] = useState<PageSize>("A4");

  // ── Draft (used only during Step 1 → Step 2) ────────────────────
  const [draftSource, setDraftSource] = useState<DraftSource | null>(null);
  const [draftFront, setDraftFront] = useState<HTMLCanvasElement | null>(null);
  const [draftBack, setDraftBack] = useState<HTMLCanvasElement | null>(null);
  const [draftFrontUrl, setDraftFrontUrl] = useState<string>("");
  const [draftBackUrl, setDraftBackUrl] = useState<string>("");
  const [activeCropTarget, setActiveCropTarget] = useState<CropTarget>("front");
  const [pdfLoading, setPdfLoading] = useState(false);
  // Inline, dismissible error banner shown on the upload step. We
  // surface upload/PDF failures here (in addition to the alert) so
  // mobile users — who may dismiss alerts reflexively — can still
  // see exactly what went wrong and report it.
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── Cropper input state ─────────────────────────────────────────
  // crop / completedCrop come from react-image-crop. We store them as
  // PERCENT crops so they survive image-size changes (zoom, rotation
  // swap, page swap) without needing remap.
  const [crop, setCrop] = useState<RICCrop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<RICCrop | null>(null);
  // ── 4-corner quad (perspective-corrected capture) ──────────────────
  // Stored in PERCENT of the rotated source image (0-100 on each axis).
  // Default = small inset rectangle so handles are visible and not
  // pinned at the very edge. User drags each handle to the actual card
  // corner, then taps Capture → buildSideCanvasFromQuad warps that
  // quad into the exact 85.6 × 54 mm output canvas.
  // null = quad not yet drawn. The user must click 4 corners on the
  // card to materialize it. Initial-rectangle UX was rejected because
  // re-sizing a default 5%/95% quad to a small card-on-A4 took longer
  // than just tapping the 4 actual card corners. Reset & rotation also
  // clear this back to null.
  const [quad, setQuad] = useState<Quad | null>(null);
  // Monotonically-incremented token consumed by `QuadCropper` to clear
  // its local `pendingPoints` (the in-progress 1–3 collected corners
  // before the 4th tap promotes them to a full quad). Plain
  // setQuad(null) won't trigger that clear because `quad` is already
  // null in collector mode — the effect below has no value change to
  // observe. Bumping this token gives us a real prop change.
  const [collectorResetToken, setCollectorResetToken] = useState(0);
  const resetQuad = useCallback(() => {
    setQuad(null);
    setCollectorResetToken((n) => n + 1);
  }, []);
  // zoom = pure DISPLAY scale (CSS) so user can zoom in to see details
  // without affecting the crop rectangle (per user request — Page 2
  // zoom should NOT change the crop, only magnify the view).
  const [zoom, setZoom] = useState(1);
  // 90° rotation steps, baked into a derived rotatedUrl below.
  const [rotation, setRotation] = useState<0 | 1 | 2 | 3>(0);
  // The actual URL fed to <ReactCrop>. Equals draftSource.cropperUrl
  // when rotation = 0; otherwise a freshly-rotated blob URL.
  const [rotatedUrl, setRotatedUrl] = useState<string>("");
  const rotatedUrlRef = useRef<string>("");

  // ── Aspect-snap state ───────────────────────────────────────────
  // We enforce the 86:56 aspect lock on every emitted crop because
  // ReactCrop's own `aspect` prop has proven unreliable in this layout
  // (per 2026-05-02 bug report, the user's mouse-drawn marquee was
  // emerging at ~2.7:1). The snap operates in DISPLAY-PIXEL SPACE
  // using the cropper image's live getBoundingClientRect(), so we
  // never depend on naturalWidth/Height being captured ahead of time
  // (which can fail silently when the image is browser-cached and
  // onLoad doesn't fire on the new <img> element).
  //
  // prevCropPxRef tracks the previously-emitted crop in display pixels
  // so we can detect which dimension the user is currently dragging
  // (the one with the larger delta wins) and anchor our snap on that
  // one — mirroring the standard aspect-locked drag UX where the
  // dragged edge stays under the cursor.
  const prevCropPxRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // ── Persisted cards (Step 3 sheet) ──────────────────────────────
  const [cards, setCards] = useState<CardEntry[]>([]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  // editingCardId !== null means we entered Step 1/2 to RE-CROP an
  // existing card rather than build a new one. On finish we replace
  // that card's F/B canvases instead of pushing a new entry.
  const [editingCardId, setEditingCardId] = useState<string | null>(null);

  // Per-card custom-copies UI (mirrors passport-engine)
  const [customMode, setCustomMode] = useState<Record<string, boolean>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Remember the latest rotatedUrl in a ref so the unmount cleanup
  // and rotation-effect can revoke it without stale-closure issues.
  useEffect(() => {
    rotatedUrlRef.current = rotatedUrl;
  }, [rotatedUrl]);

  // ── Derive rotatedUrl whenever (source, rotation) changes ─────
  // The original source URL is preserved untouched; we only generate
  // a fresh blob URL when rotation != 0. We also revoke any previously-
  // generated rotated URL we owned (never the original cropperUrl).
  // Helper: revoke prev rotated URL iff it's a blob WE generated
  // (i.e. it's not the current cropperUrl and it's not the new url).
  useEffect(() => {
    if (!draftSource) {
      const prev = rotatedUrlRef.current;
      if (prev && prev.startsWith("blob:")) {
        URL.revokeObjectURL(prev);
      }
      setRotatedUrl("");
      return;
    }
    const currentSourceUrl = draftSource.cropperUrl;
    let cancelled = false;
    (async () => {
      const url = await rotateImageUrl(currentSourceUrl, rotation);
      if (cancelled) {
        if (url !== currentSourceUrl) URL.revokeObjectURL(url);
        return;
      }
      const prev = rotatedUrlRef.current;
      if (prev && prev !== currentSourceUrl && prev !== url && prev.startsWith("blob:")) {
        URL.revokeObjectURL(prev);
      }
      setRotatedUrl(url);
      // Reset the active crop so the user gets a clean centered crop on
      // the freshly-rotated image (the previous crop coords would no
      // longer make geometric sense).
      setCrop(undefined);
      setCompletedCrop(null);
      // Reset the 4-corner quad to its default inset so the user can
      // re-mark card corners against the freshly-rotated image.
      setQuad(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [draftSource, rotation]);

  // Image loads with NO pre-drawn crop rectangle. Per user request
  // (2026-05-02), the marquee is NEVER auto-populated — the user must
  // click-and-drag a fresh aspect-locked (86:56) rectangle themselves.
  // What they draw is exactly what the preview box shows (no cut-off,
  // no extra background). Kept as a no-op to preserve the prop interface;
  // enforceAspect() (below) reads dimensions live from the DOM, so we
  // don't need to cache anything on load.
  const onImageLoad = useCallback((_e: React.SyntheticEvent<HTMLImageElement>) => {
    /* intentionally empty — manual crop only */
  }, []);

  // ── Aspect snap (the bulletproof layer) ─────────────────────────
  // Takes whatever percent-crop ReactCrop emits and snaps it to exact
  // 86:56 in DISPLAY-PIXEL space using the cropper <img>'s live
  // getBoundingClientRect(). Working in display pixels (rather than
  // image-natural pixels) means:
  //
  //   1. We don't depend on naturalWidth/Height being captured ahead
  //      of time — there's a known browser quirk where onLoad doesn't
  //      fire on a fresh <img> if the source URL is already cached,
  //      which can leave naturals at 0 and silently disable any
  //      snap that requires them.
  //   2. The marquee the user SEES on screen is guaranteed to render
  //      at exactly 86:56 visually. Since our image CSS preserves
  //      natural aspect (width/height: auto, maxWidth/Height: 100%),
  //      the wrapper aspect equals the natural aspect, so a percent
  //      crop computed from a 86:56 display rectangle also produces
  //      a 86:56 rectangle when re-applied to the natural dimensions
  //      inside buildSideCanvas — no preview stretch, no cut-off.
  //
  // We anchor the snap on whichever dimension the user is actively
  // dragging (the one with the larger delta vs the previous emitted
  // crop) so corner/edge drags feel natural and the dragged edge
  // stays under the cursor. The opposite dimension is recomputed to
  // satisfy the aspect ratio, then both x/y and width/height are
  // clamped to the image's display bounds.
  const enforceAspect = useCallback((raw: RICCrop): RICCrop => {
    if (raw.unit !== "%" || !raw.width || !raw.height) {
      return raw;
    }
    // Live DOM lookup. Critically, the marquee (`.ReactCrop__crop-selection`)
    // is positioned absolutely against the **outer** `.ReactCrop` div
    // (its nearest positioned ancestor). ReactCrop internally computes
    // percent crops against the inner `.ReactCrop__child-wrapper`
    // (`mediaRef.current.getBoundingClientRect()`), so when the two have
    // different bounding rects — which happens whenever the surrounding
    // flex/zoom container stretches the outer past the image's display
    // size — the on-screen marquee aspect does NOT match the percent
    // crop's aspect. To make the visible marquee bulletproof at 86:56,
    // we snap percent values against the same element the marquee
    // actually renders against: the outer `.ReactCrop` div.
    const stage = document.querySelector<HTMLElement>(
      '[data-testid="crop-stage"]',
    );
    if (!stage) return raw;
    const measured =
      stage.querySelector<HTMLElement>(".ReactCrop") ??
      stage.querySelector<HTMLImageElement>("img");
    if (!measured) return raw;

    const rect = measured.getBoundingClientRect();
    const dispW = rect.width;
    const dispH = rect.height;
    if (!dispW || !dispH) return raw;

    // Convert the percent crop into the image's display-pixel space.
    let pxW = (raw.width / 100) * dispW;
    let pxH = (raw.height / 100) * dispH;
    let pxX = (raw.x / 100) * dispW;
    let pxY = (raw.y / 100) * dispH;

    const target = CARD_ASPECT;
    const cur = pxW / pxH;

    // Already aspect-correct → just remember the size and exit.
    if (Math.abs(cur - target) < 0.005) {
      prevCropPxRef.current = { w: pxW, h: pxH };
      return raw;
    }

    // Decide which dimension drove this change. Bigger delta wins so
    // the edge under the cursor stays anchored during a drag.
    const prev = prevCropPxRef.current;
    const dw = Math.abs(pxW - prev.w);
    const dh = Math.abs(pxH - prev.h);
    const widthDriven = dw >= dh;
    if (widthDriven) {
      pxH = pxW / target;
    } else {
      pxW = pxH * target;
    }

    // Clamp to image display bounds. If a width-anchored snap would
    // spill past the right edge, shrink width to fit and recompute
    // height; same for height-overflow on the bottom edge.
    if (pxX + pxW > dispW) {
      pxW = dispW - pxX;
      pxH = pxW / target;
    }
    if (pxY + pxH > dispH) {
      pxH = dispH - pxY;
      pxW = pxH * target;
      // Re-check x in case width grew on the swap.
      if (pxX + pxW > dispW) {
        pxW = dispW - pxX;
        pxH = pxW / target;
      }
    }

    // Final guard against degenerate sizes from edge cases.
    if (!isFinite(pxW) || !isFinite(pxH) || pxW <= 0 || pxH <= 0) {
      return raw;
    }

    prevCropPxRef.current = { w: pxW, h: pxH };

    return {
      unit: "%",
      x: (pxX / dispW) * 100,
      y: (pxY / dispH) * 100,
      width: (pxW / dispW) * 100,
      height: (pxH / dispH) * 100,
    };
  }, []);

  // FIX 2026-05-08: Removed enforceAspect from these callbacks. The
  // snap function measured pixels against the OUTER `.ReactCrop`
  // wrapper, but the wrapper's bounding rect can differ from the
  // inner <img> when the centering flex container leaves blank
  // space around the image. ReactCrop emits percent crops measured
  // against the IMAGE, and buildSideCanvas applies those percents
  // to the IMAGE's natural dimensions. Passing snap-adjusted percents
  // (which were calculated against the wrapper) into buildSideCanvas
  // meant the captured area was offset and shrunk inwards, silently
  // chopping the LEFT vertical "Issue Date" strip and the RIGHT
  // Aadhaar logo / barcode column off every captured card.
  //
  // ReactCrop already enforces the 86:56 ratio via its `aspect` prop
  // (line ~1865), so the marquee is guaranteed correct without our
  // redundant snap. We now pass the percent crop straight through.
  // _enforceAspect is kept in scope (prefixed underscore) so future
  // refactors can revisit the wrapper-vs-image measurement story
  // without resurrecting it from git history.
  void enforceAspect;
  const handleCropChange = useCallback(
    (c: RICCrop) => setCrop(c),
    [],
  );
  const handleCompletedCropChange = useCallback(
    (c: RICCrop) => setCompletedCrop(c),
    [],
  );

  // ── Latest-state refs so the unmount cleanup sees the CURRENT
  // collection of blob URLs / sources (not the empty initial closure).
  const cardsRef = useRef(cards);
  const draftSourceRef = useRef(draftSource);
  const draftFrontUrlRef = useRef(draftFrontUrl);
  const draftBackUrlRef = useRef(draftBackUrl);
  const editingCardIdRef = useRef(editingCardId);
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);
  useEffect(() => {
    draftSourceRef.current = draftSource;
  }, [draftSource]);
  useEffect(() => {
    draftFrontUrlRef.current = draftFrontUrl;
  }, [draftFrontUrl]);
  useEffect(() => {
    draftBackUrlRef.current = draftBackUrl;
  }, [draftBackUrl]);
  useEffect(() => {
    editingCardIdRef.current = editingCardId;
  }, [editingCardId]);

  // Upload-race token: each handleFile() call increments this; stale
  // resolutions check myToken === current and bail out.
  const uploadTokenRef = useRef(0);

  // Cleanup blob URLs on unmount — uses refs to read the LATEST values.
  useEffect(() => {
    return () => {
      const seen = new Set<DraftSource>();
      cardsRef.current.forEach((c) => {
        URL.revokeObjectURL(c.frontUrl);
        URL.revokeObjectURL(c.backUrl);
        if (!seen.has(c.source)) {
          freeDraftSource(c.source);
          seen.add(c.source);
        }
      });
      // Skip freeing draftSource if it's the same object as a saved
      // card's source (would double-revoke already-revoked URLs).
      if (draftSourceRef.current && !seen.has(draftSourceRef.current)) {
        freeDraftSource(draftSourceRef.current);
      }
      if (draftFrontUrlRef.current) URL.revokeObjectURL(draftFrontUrlRef.current);
      if (draftBackUrlRef.current) URL.revokeObjectURL(draftBackUrlRef.current);
      // The rotated source URL is a blob we own (when rotation != 0).
      // Revoke unless it's pointing to a cropperUrl that's already been
      // freed by freeDraftSource above (in which case it's already gone).
      const ru = rotatedUrlRef.current;
      if (ru && ru.startsWith("blob:")) {
        // Only revoke if it's NOT one of the source URLs we already freed.
        let alreadyFreed = false;
        if (draftSourceRef.current && ru === draftSourceRef.current.cropperUrl) {
          alreadyFreed = true;
        }
        for (const c of cardsRef.current) {
          if (ru === c.source.cropperUrl) {
            alreadyFreed = true;
            break;
          }
        }
        if (!alreadyFreed) URL.revokeObjectURL(ru);
      }
    };
  }, []);

  // ─── Restore persisted source on mount ────────────────────────
  // Pairs with the saveBlob/saveDraft inside handleFile so a tab kill
  // during PDF rasterisation doesn't force the user to re-pick the file.
  // We always re-run handleFile (idempotent — saves the same blob back),
  // which re-renders PDF pages and lands the user on Step 2 just as if
  // they'd freshly uploaded.
  const sourceRestoredRef = useRef(false);
  useEffect(() => {
    if (sourceRestoredRef.current) return;
    sourceRestoredRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const meta = loadDraft<{ name: string; type: string }>("id-card:source-meta");
        const blob = await loadBlob("id-card:source");
        if (cancelled || !blob || !meta) return;
        const restored = new File([blob], meta.name, { type: meta.type });
        await handleFile(restored);
      } catch {
        // Best-effort restore — silent failure leaves the user on Step 1.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Step 1 → Step 2: handle file upload ──────────────────────
  async function handleFile(file: File | null) {
    if (!file) return;
    // Persist the uploaded source so a mobile-browser refresh during the
    // PDF rasterise step (Android Chrome will kill a tab using >150 MB
    // of canvas memory) doesn't lose the user's chosen file.
    void saveBlob("id-card:source", file);
    saveDraft("id-card:source-meta", { name: file.name, type: file.type });
    const myToken = ++uploadTokenRef.current;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    setPdfLoading(isPdf);
    try {
      let source: DraftSource;
      if (isPdf) {
        const pages = await renderPdfPages(file);
        if (myToken !== uploadTokenRef.current) {
          // A newer upload superseded us — discard everything we built.
          for (const p of pages) URL.revokeObjectURL(p.url);
          return;
        }
        if (pages.length === 0) throw new Error("PDF has no pages");
        source = {
          sourceFile: file,
          pdfPages: pages,
          activePageIndex: 0,
          cropperUrl: pages[0].url,
        };
      } else {
        const url = URL.createObjectURL(file);
        if (myToken !== uploadTokenRef.current) {
          URL.revokeObjectURL(url);
          return;
        }
        source = {
          sourceFile: file,
          pdfPages: null,
          activePageIndex: 0,
          cropperUrl: url,
        };
      }
      // Throw away the previous DRAFT, but never free a source still
      // owned by a saved CardEntry (re-crop reuses card.source).
      const prevDraft = draftSource;
      const prevOwnedByCard =
        editingCardId && prevDraft && cards.some((c) => c.source === prevDraft);
      if (prevDraft && !prevOwnedByCard) freeDraftSource(prevDraft);
      if (draftFrontUrl) URL.revokeObjectURL(draftFrontUrl);
      if (draftBackUrl) URL.revokeObjectURL(draftBackUrl);
      setDraftSource(source);
      setDraftFront(null);
      setDraftBack(null);
      setDraftFrontUrl("");
      setDraftBackUrl("");
      setActiveCropTarget("front");
      setCrop(undefined);
      setCompletedCrop(null);
      setZoom(1);
      setRotation(0);
      setEditingCardId(null);
      setWizardStep(2);
    } catch (err) {
      if (myToken !== uploadTokenRef.current) return;
      console.error("File handling failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(msg);
    } finally {
      if (myToken === uploadTokenRef.current) setPdfLoading(false);
      // Reset the file input AFTER the read pipeline has fully run
      // (success or failure). Doing this earlier — e.g. inside the
      // input's own onChange — caused mobile Firefox to invalidate
      // the picked File before `arrayBuffer()` could read it, which
      // surfaced as the page "refreshing back to step 1" on every
      // upload. The ref may point at an unmounted node by the time
      // we get here (Step1Upload unmounts when wizardStep becomes
      // 2), so guard with a simple try/catch.
      try {
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch {
        /* unmounted — safe to ignore */
      }
    }
  }

  function selectPdfPage(pageIndex: number) {
    if (!draftSource?.pdfPages) return;
    const page = draftSource.pdfPages[pageIndex];
    if (!page) return;
    setDraftSource({
      ...draftSource,
      activePageIndex: pageIndex,
      cropperUrl: page.url,
    });
    // Reset cropper interactions when switching page
    setCrop(undefined);
    setCompletedCrop(null);
    setZoom(1);
    setRotation(0);
  }

  function rotateBy(delta: 1 | -1) {
    setRotation((r) => {
      const next = (((r + delta) % 4) + 4) % 4;
      return next as 0 | 1 | 2 | 3;
    });
  }

  // ─── Step 2: capture current crop into Front or Back box ──────
  // Reads completedCrop (a percent-unit Crop from react-image-crop)
  // and converts it against the rotated source URL to a 300-DPI canvas.
  // Marquee is aspect-locked to 86:56, so we pass the user's crop
  // straight through with NO buffer — the marquee IS the card frame.
  //
  // ROBUSTNESS (2026-05-08): on mobile Firefox/Chrome, ReactCrop's
  // `onComplete` callback occasionally fails to fire on touch-end
  // (notably when the user lifts their finger outside the canvas, or
  // when the OS interrupts the touch sequence with a scroll gesture).
  // The marquee is still drawn and `crop` is up to date, but
  // `completedCrop` is stale or null — so the user clicks Capture and
  // nothing happens. Falling back to `crop` matches the marquee the
  // user actually sees and removes that intermittent dead-tap class
  // of bug. We also surface failures (silent NaN/CORS/decode errors)
  // via an alert so users know to retry instead of being stuck.
  async function captureCrop(target: CropTarget) {
    if (!rotatedUrl) {
      window.alert("Image is not loaded yet. Please wait a moment and try again.");
      return;
    }
    // ── 4-CORNER QUAD CAPTURE (preferred, 2026-05-08) ────────────────
    // The user marks the 4 actual card corners on the source image and
    // we perspective-warp that quad into the exact 85.6 × 54 mm canvas.
    // Guarantees zero cut + zero white border regardless of how the
    // card is photographed (skew, tilt, perspective). The legacy
    // ReactCrop rectangle code path below is kept disabled (dead) so
    // this turn's diff stays minimal — it can be removed in a follow-up.
    if (!quad) {
      window.alert("Please tap the 4 corners of the card first.");
      return;
    }
    try {
      const c = await buildSideCanvasFromQuad(rotatedUrl, quad);
      const blob = await canvasToBlob(c, "image/jpeg", 0.95);
      const url = URL.createObjectURL(blob);
      if (target === "front") {
        if (draftFrontUrl) URL.revokeObjectURL(draftFrontUrl);
        setDraftFront(c);
        setDraftFrontUrl(url);
        setActiveCropTarget("back");
      } else {
        if (draftBackUrl) URL.revokeObjectURL(draftBackUrl);
        setDraftBack(c);
        setDraftBackUrl(url);
      }
      requestAnimationFrame(() => {
        const el = document.querySelector(
          `[data-testid="box-${target}"]`,
        ) as HTMLElement | null;
        if (el && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      return;
    } catch (err) {
      console.error("captureCrop (quad) failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`Capture failed: ${msg}\n\nPlease try adjusting the corners and capture again.`);
      return;
    }
    // eslint-disable-next-line no-unreachable
    /* legacy rectangle path (unreachable, kept temporarily for diff size):
    // Prefer the LIVE `crop` (the marquee user is currently looking at) —
    // it updates on every onChange call. `completedCrop` only updates on
    // touch-end, which on mobile Firefox/Chrome can be missed entirely
    // (finger lifted outside canvas, scroll interrupt). If we preferred
    // completedCrop we would silently capture the user's PREVIOUS marquee
    // — visible as "the captured card has its left strip cut off because
    // an older, smaller marquee was used". Only fall back to completedCrop
    // when there's no live crop at all.
    const isValid = (c: { unit?: string; x?: number; y?: number; width?: number; height?: number } | null | undefined) =>
      !!c && typeof c.width === "number" && typeof c.height === "number" &&
      typeof c.x === "number" && typeof c.y === "number" &&
      c.width > 0 && c.height > 0 &&
      Number.isFinite(c.width) && Number.isFinite(c.height) &&
      Number.isFinite(c.x) && Number.isFinite(c.y) &&
      // Guard against a percent-unit assumption being violated. We only
      // accept percent crops here — buildSideCanvas divides by 100.
      // ReactCrop's onChange/onComplete second arg is always PercentCrop
      // (`unit: "%"`), so this should always pass; the check exists so
      // future code that calls setCrop directly with a px-unit value
      // can't silently feed broken numbers into the capture canvas.
      c.unit === "%";
    const source: RICCrop | null | undefined = isValid(crop)
      ? crop
      : isValid(completedCrop)
        ? completedCrop
        : null;
    if (!source) {
      window.alert("Please draw a crop rectangle on the image first, then tap Capture.");
      return;
    }
    try {
      const c = await buildSideCanvas(rotatedUrl, {
        x: source.x,
        y: source.y,
        width: source.width,
        height: source.height,
      });
      const blob = await canvasToBlob(c, "image/jpeg", 0.95);
      const url = URL.createObjectURL(blob);
      if (target === "front") {
        if (draftFrontUrl) URL.revokeObjectURL(draftFrontUrl);
        setDraftFront(c);
        setDraftFrontUrl(url);
        // Auto-advance the active target so the next crop lands in Back.
        setActiveCropTarget("back");
      } else {
        if (draftBackUrl) URL.revokeObjectURL(draftBackUrl);
        setDraftBack(c);
        setDraftBackUrl(url);
      }
      // ── UX: scroll the just-captured preview into view ──────────────
      // On large desktop viewports (e.g. 1280×720) the cropper canvas
      // is tall enough that the Front/Back preview grid sits *below*
      // the fold. After clicking Capture, users naturally look at the
      // cropper area and don't realise the new preview thumbnail has
      // appeared further down. Multiple users have reported this as
      // "the preview is not showing on desktop" even though the image
      // renders correctly — they simply never scrolled to see it.
      // We schedule a smooth scroll AFTER React has painted the new
      // <img>, so the box is already populated when it slides into
      // view. `block: 'center'` keeps it nicely framed regardless of
      // current scroll position; `behavior: 'smooth'` makes the motion
      // discoverable so the user notices what just happened.
      requestAnimationFrame(() => {
        const el = document.querySelector(
          `[data-testid="box-${target}"]`,
        ) as HTMLElement | null;
        if (el && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    } catch (err) {
      console.error("captureCrop failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      // Surface the error so the user isn't left wondering why nothing
      // happened. Common causes: blob URL revoked, image decode failure
      // on huge mobile uploads, or zero-area crop after a stray tap.
      window.alert(`Capture failed: ${msg}\n\nPlease try drawing the crop again.`);
    }
    */
  }

  // NOTE: Step 2's Enter-key shortcut is registered INSIDE Step2Crop so
  // it can read the enlarge-overlay state and skip while a modal is open
  // (otherwise Enter would silently mutate crop state behind the modal).

  function clearSide(target: CropTarget) {
    if (target === "front") {
      if (draftFrontUrl) URL.revokeObjectURL(draftFrontUrl);
      setDraftFront(null);
      setDraftFrontUrl("");
      setActiveCropTarget("front");
    } else {
      if (draftBackUrl) URL.revokeObjectURL(draftBackUrl);
      setDraftBack(null);
      setDraftBackUrl("");
      setActiveCropTarget("back");
    }
  }

  // ─── Step 2 → Step 3: commit the draft as a card ──────────────
  function proceedToSheet() {
    if (!draftSource || !draftFront || !draftBack || !draftFrontUrl || !draftBackUrl) return;

    if (editingCardId) {
      // Replacing an existing card's crops + (optionally) source.
      setCards((prev) =>
        prev.map((c) => {
          if (c.id !== editingCardId) return c;
          // Free the previous F/B blob URLs (the canvases get GC'd).
          URL.revokeObjectURL(c.frontUrl);
          URL.revokeObjectURL(c.backUrl);
          // If user re-uploaded a different source while editing, swap
          // the source too. Otherwise keep the original to save memory.
          const sourceChanged = c.source !== draftSource;
          if (sourceChanged) freeDraftSource(c.source);
          return {
            ...c,
            source: draftSource,
            frontCanvas: draftFront,
            backCanvas: draftBack,
            frontUrl: draftFrontUrl,
            backUrl: draftBackUrl,
          };
        }),
      );
    } else {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newEntry: CardEntry = {
        id,
        source: draftSource,
        frontCanvas: draftFront,
        backCanvas: draftBack,
        frontUrl: draftFrontUrl,
        backUrl: draftBackUrl,
        // First card defaults to 5 (= "Full A4"); subsequent cards
        // start at 1 since the user is mixing different IDs and likely
        // wants fewer of each.
        copies: cards.length === 0 ? 5 : 1,
      };
      setCards((prev) => [...prev, newEntry]);
      setActiveCardId(id);
    }

    // Reset draft pointers WITHOUT freeing — the canvases & URLs are
    // now owned by the new/updated CardEntry.
    setDraftSource(null);
    setDraftFront(null);
    setDraftBack(null);
    setDraftFrontUrl("");
    setDraftBackUrl("");
    setEditingCardId(null);
    setWizardStep(3);
  }

  // ─── Step 3: card management ─────────────────────────────────
  function addAnotherCard() {
    // Drop any in-progress draft, restart the wizard.
    freeDraftSource(draftSource);
    if (draftFrontUrl) URL.revokeObjectURL(draftFrontUrl);
    if (draftBackUrl) URL.revokeObjectURL(draftBackUrl);
    setDraftSource(null);
    setDraftFront(null);
    setDraftBack(null);
    setDraftFrontUrl("");
    setDraftBackUrl("");
    setEditingCardId(null);
    setActiveCropTarget("front");
    setCrop(undefined);
    setCompletedCrop(null);
    setZoom(1);
    setRotation(0);
    setWizardStep(1);
  }

  function recropCard(cardId: string) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    // Open Step 2 with this card's existing source + its current crops
    // pre-loaded so the user can change either side independently.
    setDraftSource(card.source);
    setDraftFront(card.frontCanvas);
    setDraftBack(card.backCanvas);
    // Re-create blob URLs for the existing canvases so the preview
    // boxes stay alive even if user cancels (we never revoke originals).
    canvasToBlob(card.frontCanvas, "image/jpeg", 0.95).then((b) =>
      setDraftFrontUrl(URL.createObjectURL(b)),
    );
    canvasToBlob(card.backCanvas, "image/jpeg", 0.95).then((b) =>
      setDraftBackUrl(URL.createObjectURL(b)),
    );
    setEditingCardId(cardId);
    setActiveCropTarget("front");
    setCrop(undefined);
    setCompletedCrop(null);
    setZoom(1);
    setRotation(0);
    setWizardStep(2);
  }

  function deleteCard(cardId: string) {
    setCards((prev) => {
      const target = prev.find((c) => c.id === cardId);
      if (target) {
        URL.revokeObjectURL(target.frontUrl);
        URL.revokeObjectURL(target.backUrl);
        freeDraftSource(target.source);
      }
      const remaining = prev.filter((c) => c.id !== cardId);
      if (activeCardId === cardId) {
        const removedIdx = prev.findIndex((c) => c.id === cardId);
        const next =
          remaining[removedIdx] ?? remaining[removedIdx - 1] ?? remaining[0] ?? null;
        setActiveCardId(next ? next.id : null);
      }
      // If the user removed the LAST card, kick them back to Step 1.
      if (remaining.length === 0) {
        setWizardStep(1);
      }
      return remaining;
    });
    setCustomMode((m) => {
      const { [cardId]: _drop, ...rest } = m;
      return rest;
    });
    setCustomInputs((m) => {
      const { [cardId]: _drop, ...rest } = m;
      return rest;
    });
  }

  function setCardCopies(cardId: string, copies: number) {
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, copies: Math.max(1, Math.min(MAX_COPIES, copies)) } : c)),
    );
  }

  function clearAll() {
    cards.forEach((c) => {
      URL.revokeObjectURL(c.frontUrl);
      URL.revokeObjectURL(c.backUrl);
      freeDraftSource(c.source);
    });
    freeDraftSource(draftSource);
    if (draftFrontUrl) URL.revokeObjectURL(draftFrontUrl);
    if (draftBackUrl) URL.revokeObjectURL(draftBackUrl);
    setCards([]);
    setActiveCardId(null);
    setDraftSource(null);
    setDraftFront(null);
    setDraftBack(null);
    setDraftFrontUrl("");
    setDraftBackUrl("");
    setEditingCardId(null);
    setCustomMode({});
    setCustomInputs({});
    setWizardStep(1);
  }

  // ── Sheet layout (Step 3) ─────────────────────────────────────
  const layout = useMemo(() => {
    const { w, h } = PAGE_DIMS_MM[pageSize];
    return packSheet(w, h, cards);
  }, [pageSize, cards]);

  const totalPairsRequested = useMemo(
    () => cards.reduce((s, c) => s + c.copies, 0),
    [cards],
  );

  // ── Download gate (download requires Prime) ───────────────────
  // Delegates to the shared usePrimeDownloadGate hook so the modal,
  // pending-intent persistence, and post-payment auto-resume all use
  // the same code path as every other Prime tool. Kept as a thin
  // wrapper so the existing `requirePrimeOrPaywall(action)` call
  // sites below don't have to change.
  void user; void primeResolved; void isPrime;
  function requirePrimeOrPaywall(action: () => void) {
    requirePrime(action);
  }

  async function handleGeneratePdf() {
    requirePrimeOrPaywall(async () => {
      if (cards.length === 0 || !layout || layout.cells.length === 0) return;
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

      // Pre-build a JPEG data URL per (card, side, rotated) tuple so the
      // inner cell loop is just addImage. Rotation is bound to layout
      // cells, not per-card, so a single layout-rotation flag works.
      const cache = new Map<string, string>();
      const dataFor = (cardIndex: number, side: "front" | "back", rotate: boolean): string => {
        const key = `${cardIndex}:${side}:${rotate ? 1 : 0}`;
        const hit = cache.get(key);
        if (hit) return hit;
        const c = side === "front" ? cards[cardIndex].frontCanvas : cards[cardIndex].backCanvas;
        let data: string;
        if (rotate) {
          const r = document.createElement("canvas");
          r.width = c.height;
          r.height = c.width;
          const ctx = r.getContext("2d")!;
          ctx.translate(r.width / 2, r.height / 2);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(c, -c.width / 2, -c.height / 2);
          data = r.toDataURL("image/jpeg", 0.95);
        } else {
          data = c.toDataURL("image/jpeg", 0.95);
        }
        cache.set(key, data);
        return data;
      };

      setPdfProgress(25);
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.0847); // 1 px @ 300 DPI

      const total = layout.cells.length;
      for (let i = 0; i < total; i++) {
        const cell = layout.cells[i];
        const data = dataFor(cell.cardIndex, cell.side, cell.rotate);
        pdf.addImage(data, "JPEG", cell.xMm, cell.yMm, layout.cellW, layout.cellH, undefined, "FAST");
        pdf.rect(cell.xMm, cell.yMm, layout.cellW, layout.cellH, "S");
        setPdfProgress(25 + Math.round(((i + 1) / total) * 70));
        if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
      }

      setPdfProgress(98);
      const blob = pdf.output("blob");
      const cardSuffix = cards.length > 1 ? `-${cards.length}cards` : "";
      downloadBlob(blob, `id-card-sheet-${pageSize}-${totalPairsRequested}pairs${cardSuffix}.pdf`);
      setPdfProgress(100);
      setTimeout(() => {
        setPdfBusy(false);
        setPdfProgress(0);
      }, 600);
    });
  }

  // After Prime upgrade, re-trigger the PDF generator. Since
  // `requirePrimeOrPaywall` falls through synchronously when the
  // user is now Prime, calling handleGeneratePdf() is safe — it
  // won't re-open the modal.
  useAutoResumeDownload({
    toolId: "id-card-engine",
    ready: cards.length > 0 && !!layout && layout.cells.length > 0,
    run: () => { void handleGeneratePdf(); },
  });

  async function handleSingleJpg() {
    requirePrimeOrPaywall(async () => {
      const card = cards.find((c) => c.id === activeCardId) ?? cards[0];
      if (!card) return;
      // Compose F + B side-by-side at 300 DPI on a single JPG so the
      // user gets the same physical layout they see on the sheet.
      const cw = MM_TO_PX_300(CARD_W_MM);
      const ch = MM_TO_PX_300(CARD_H_MM);
      const gap = MM_TO_PX_300(INNER_GAP_MM);
      const out = document.createElement("canvas");
      out.width = cw * 2 + gap;
      out.height = ch;
      const ctx = out.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(card.frontCanvas, 0, 0);
      ctx.drawImage(card.backCanvas, cw + gap, 0);
      const blob = await canvasToBlob(out, "image/jpeg", 0.95);
      downloadBlob(blob, `id-card-${CARD_W_MM}x${CARD_H_MM}mm-pair.jpg`);
    });
  }

  // Visual scale for the live sheet preview: cap at ~440px wide.
  const previewScale = useMemo(() => {
    const target = 440;
    return target / PAGE_DIMS_MM[pageSize].w;
  }, [pageSize]);

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <PrimeToolShell tool={tool}>
      {/* Step indicator */}
      <StepIndicator step={wizardStep} />

      {wizardStep === 1 && (
        <Step1Upload
          pageSize={pageSize}
          onPageSize={setPageSize}
          onFile={(f) => {
            setUploadError(null);
            handleFile(f);
          }}
          fileInputRef={fileInputRef}
          loading={pdfLoading}
          hasExistingCards={cards.length > 0}
          onBackToSheet={() => setWizardStep(3)}
          error={uploadError}
          onDismissError={() => setUploadError(null)}
        />
      )}

      {wizardStep === 2 && draftSource && (
        <Step2Crop
          draftSource={draftSource}
          onSelectPage={selectPdfPage}
          rotatedUrl={rotatedUrl}
          crop={crop}
          completedCrop={completedCrop}
          quad={quad}
          onQuadChange={setQuad}
          onResetQuad={resetQuad}
          collectorResetToken={collectorResetToken}
          zoom={zoom}
          rotation={rotation}
          onCropChange={handleCropChange}
          onCompletedCropChange={handleCompletedCropChange}
          onZoomChange={setZoom}
          onRotateBy={rotateBy}
          onImageLoad={onImageLoad}
          activeTarget={activeCropTarget}
          onActiveTargetChange={setActiveCropTarget}
          frontUrl={draftFrontUrl}
          backUrl={draftBackUrl}
          onCapture={captureCrop}
          onClearSide={clearSide}
          onProceed={proceedToSheet}
          onBackToUpload={() => {
            // Drop the draft and let the user pick a different file.
            // CRITICAL: when re-cropping an existing card, draftSource
            // is the SAME object as that card's source — freeing it
            // would revoke blob URLs the card still needs. Skip free
            // in that case (or whenever any saved card owns it).
            const ownedByCard = cards.some((c) => c.source === draftSource);
            if (draftSource && !ownedByCard) freeDraftSource(draftSource);
            if (draftFrontUrl) URL.revokeObjectURL(draftFrontUrl);
            if (draftBackUrl) URL.revokeObjectURL(draftBackUrl);
            setDraftSource(null);
            setDraftFront(null);
            setDraftBack(null);
            setDraftFrontUrl("");
            setDraftBackUrl("");
            setEditingCardId(null);
            setWizardStep(1);
          }}
          isEditing={!!editingCardId}
        />
      )}

      {wizardStep === 3 && cards.length > 0 && (
        <Step3Sheet
          cards={cards}
          activeCardId={activeCardId}
          onSelectActive={setActiveCardId}
          onAddAnother={addAnotherCard}
          onRecrop={recropCard}
          onDelete={deleteCard}
          onSetCopies={setCardCopies}
          customMode={customMode}
          customInputs={customInputs}
          onCustomMode={setCustomMode}
          onCustomInputs={setCustomInputs}
          pageSize={pageSize}
          onPageSize={setPageSize}
          layout={layout}
          previewScale={previewScale}
          totalPairsRequested={totalPairsRequested}
          pdfBusy={pdfBusy}
          pdfProgress={pdfProgress}
          onGeneratePdf={handleGeneratePdf}
          onSingleJpg={handleSingleJpg}
          onClearAll={clearAll}
          isPrime={isPrime}
        />
      )}

      {/* Shared Prime paywall (gold gradient, in-modal PhonePe checkout). */}
      {primeGateModal}
    </PrimeToolShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step indicator
// ─────────────────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Upload" },
    { n: 2, label: "Crop F & B" },
    { n: 3, label: "Print Sheet" },
  ];
  return (
    <div className="flex items-center justify-center gap-2 mb-5" data-testid="step-indicator">
      {steps.map((s, i) => {
        const active = s.n === step;
        const done = s.n < step;
        return (
          <div key={s.n} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                active
                  ? "bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 shadow"
                  : done
                    ? "bg-amber-300/20 text-amber-200 border border-amber-300/40"
                    : "bg-white/5 text-purple-200/60 border border-white/10"
              }`}
            >
              {done ? <CheckCircle2 className="h-3 w-3" /> : <span>{s.n}</span>}
              <span>{s.label}</span>
            </div>
            {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-amber-300/40" />}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 1 — Upload + initial page-size choice
// ─────────────────────────────────────────────────────────────────────
function Step1Upload({
  pageSize,
  onPageSize,
  onFile,
  fileInputRef,
  loading,
  hasExistingCards,
  onBackToSheet,
  error,
  onDismissError,
}: {
  pageSize: PageSize;
  onPageSize: (p: PageSize) => void;
  onFile: (f: File | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  loading: boolean;
  hasExistingCards: boolean;
  onBackToSheet: () => void;
  error: string | null;
  onDismissError: () => void;
}) {
  // We use a stable id so the <label htmlFor=…> linkage is rock-solid
  // across re-renders. This MATTERS on mobile Firefox: relying on a
  // wrapper <div onClick> that programmatically calls input.click()
  // produced flaky behavior (sometimes a tap closed the picker
  // immediately, sometimes the page appeared to "refresh"). Using
  // the native <label> binding lets the browser handle the picker
  // open natively, which is rock-solid on every mobile browser.
  const inputId = "id-card-file-input";
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">
      <div>
        {/* Hidden input lives OUTSIDE the drop zone so its mount is
            independent of any layout / drag state, and so the label
            click is dispatched directly by the browser without any
            React-synthetic indirection. */}
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            // IMPORTANT: do NOT reset e.target.value here. On
            // Android Firefox the picked File is backed by a
            // temporary OS URI that the system releases as soon as
            // the input is reset — clearing it synchronously caused
            // the in-flight `file.arrayBuffer()` read to throw,
            // which the user perceived as the page "refreshing".
            // The parent's `handleFile` resets the input in its
            // `finally` block once the bytes are safely in memory.
            onFile(e.currentTarget.files?.[0] ?? null);
          }}
        />
        <label
          htmlFor={loading ? undefined : inputId}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!loading) onFile(e.dataTransfer.files?.[0] ?? null);
          }}
          className={`relative block rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
            loading
              ? "border-amber-300/40 bg-amber-300/5 cursor-wait"
              : "border-amber-300/40 bg-white/5 hover:bg-white/10 hover:border-amber-300/70 cursor-pointer"
          }`}
          data-testid="id-card-drop"
        >
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-300 to-yellow-500 flex items-center justify-center shadow-lg mb-4">
            {loading ? (
              <Loader2 className="h-8 w-8 text-purple-950 animate-spin" />
            ) : (
              <Upload className="h-8 w-8 text-purple-950" />
            )}
          </div>
          <div className="font-bold text-amber-100 text-lg">
            {loading ? "Rendering PDF…" : "Upload ID card"}
          </div>
          <div className="text-sm text-purple-100/70 mt-1">
            JPG · PNG · PDF supported · Aadhaar, PAN, Voter ID, Ayushman, School ID — all
          </div>
          <div className="text-[11px] text-amber-300/70 mt-2 font-semibold">
            Card size: 85.6 × 54 mm (ISO ID-1 — Aadhaar / Voter ID PVC)
          </div>
        </label>

        {error && (
          <div
            className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100"
            data-testid="upload-error"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-red-200 mb-1">
                  Failed to load file
                </div>
                <div className="break-words font-mono text-[12px] text-red-100/90">
                  {error}
                </div>
                <div className="mt-2 text-[11px] text-red-100/70">
                  Please try another file. If this error keeps happening,
                  send a screenshot of this message to support.
                </div>
              </div>
              <button
                type="button"
                onClick={onDismissError}
                className="shrink-0 rounded-md p-1 text-red-200 hover:bg-red-500/20"
                aria-label="Dismiss error"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {hasExistingCards && (
          <button
            onClick={onBackToSheet}
            className="mt-4 inline-flex items-center gap-1 text-xs text-amber-200 hover:text-amber-100 px-3 py-1.5 rounded-lg border border-amber-300/30 bg-white/5 hover:bg-white/10"
            data-testid="btn-back-to-sheet"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back to Sheet
          </button>
        )}
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-200 mb-3">
            Page size (initial)
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["A4", "4x6", "5x7"] as PageSize[]).map((p) => (
              <button
                key={p}
                onClick={() => onPageSize(p)}
                className={`rounded-xl py-2 font-bold text-sm transition-all ${
                  pageSize === p
                    ? "bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 shadow-lg"
                    : "bg-white/5 text-amber-100 hover:bg-white/10 border border-amber-300/20"
                }`}
                data-testid={`btn-init-page-${p}`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-purple-100/60">
You can also change it at the Sheet step.
          </div>
        </div>

        <div className="rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-400/15 to-purple-600/10 p-4 text-xs text-purple-100/85 leading-relaxed">
          <div className="flex items-center gap-1.5 text-amber-200 font-bold mb-1">
            <CreditCard className="h-3.5 w-3.5" /> ID Card Engine
          </div>
          Upload a PDF / image → crop Front & Back separately → print as F-B
          pairs on A4, then cut and laminate.
        </div>
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// QuadCropper — 4-corner perspective marquee overlay.
//
// Renders the source image with an SVG quadrilateral overlay and 4
// draggable corner handles (TL, TR, BR, BL). Corner positions are
// stored in PERCENT of the displayed image (which equals percent of
// the natural image since CSS preserves aspect), so they remain valid
// across zoom and rotation. Each handle is draggable via pointer
// events (mouse + touch), with the cursor coordinate clamped to the
// image bounds and converted to % via the image's getBoundingClientRect().
//
// Why an SVG polygon and not 4 lines? A single <polygon> with
// preserveAspectRatio="none" + viewBox="0 0 100 100" automatically
// scales to whatever size the image is rendered at — no per-pixel
// arithmetic needed in the React tree.
// ─────────────────────────────────────────────────────────────────────
function QuadCropper({
  src,
  quad,
  onQuadChange,
  onImageLoad,
  resetToken,
}: {
  src: string;
  quad: Quad | null;
  onQuadChange: (q: Quad | null) => void;
  onImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  /** Bumped by the parent when the Reset button is clicked. We
   *  observe it to clear `pendingPoints` even when `quad` is already
   *  null (in which case the [quad] effect is a no-op). */
  resetToken: number;
}) {
  // ── Click-to-collect-corners mode ─────────────────────────────────
  // When `quad` is null we are NOT showing the marquee. Instead, the
  // user clicks the 4 actual card corners on the image. After the 4th
  // click we sanitize (atan2-around-centroid → canonical TL/TR/BR/BL)
  // and lift the result to the parent via onQuadChange — at which
  // point the standard mask + handles + drag UI takes over. This
  // skips the slow "shrink the default 5%/95% quad" gesture that the
  // user complained about for small cards on a large A4.
  const [pendingPoints, setPendingPoints] = useState<Corner[]>([]);
  // Clear pending click markers as soon as the parent quad becomes
  // non-null (i.e. the 4 collected corners have been promoted to a
  // real quad). Uses functional-set with reference equality bail-out
  // so the effect, which re-runs on EVERY quad change (including each
  // drag tick), is a no-op once `pendingPoints` is already empty.
  // This avoids the per-pointermove render thrash flagged in review.
  useEffect(() => {
    if (!quad) return;
    setPendingPoints((p) => (p.length === 0 ? p : []));
  }, [quad]);
  // Clear pending clicks on a new source (rotation produces a new
  // blob URL even though `quad` is already null, so the [quad] effect
  // above can't catch it).
  useEffect(() => { setPendingPoints([]); }, [src]);
  // Clear pending clicks when the parent's Reset button fires. Uses a
  // monotonically-incremented token instead of relying on `quad`
  // transitioning to null (which doesn't change when already null).
  useEffect(() => {
    if (resetToken === 0) return;
    setPendingPoints([]);
  }, [resetToken]);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  // Whole-quad translate ("group move") — when the user pointer-downs
  // INSIDE the polygon (not on a corner handle), they grab the whole
  // shape and slide it across the image. Useful for placing the quad
  // on the back-side card after capturing the front: instead of
  // re-positioning each corner, drag the whole rectangle and only
  // fine-tune corners afterwards.
  const [isTranslating, setIsTranslating] = useState(false);
  const translateRef = useRef<{ startX: number; startY: number; orig: Quad } | null>(null);
  // Bounding rect of the displayed image RELATIVE to the wrapper. The
  // SVG mask + corner handles are absolutely positioned and sized to
  // exactly match this rect, so they always overlay the image edges
  // regardless of how the image is laid out (centered with letterbox
  // padding inside the flex container, etc). Without this measure-and-
  // overlay pattern, an inline-block wrapper would inherit the natural
  // image size and overflow the cropper canvas — handles end up off-
  // screen and the dim mask fails to align with the image edges.
  const [imgRect, setImgRect] = useState<{
    left: number; top: number; width: number; height: number;
  } | null>(null);

  // Latest quad in a ref so the document-level pointermove handler
  // doesn't need to be re-attached on every drag tick (state update).
  // Holds null when the user is still in collect-corners mode; drag
  // handlers below early-return if the ref is null.
  const quadRef = useRef<Quad | null>(quad);
  useEffect(() => { quadRef.current = quad; }, [quad]);

  // Re-measure the image's on-screen rect whenever it loads, the
  // wrapper resizes (zoom in/out), or the document layout changes
  // (font load, scrollbar appearance). ResizeObserver covers the zoom
  // case; the explicit window resize listener covers viewport rotates.
  const measure = useCallback(() => {
    const img = imgRef.current;
    const wrap = wrapperRef.current;
    if (!img || !wrap) return;
    const ir = img.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    if (ir.width <= 0 || ir.height <= 0) return;
    setImgRect({
      left: ir.left - wr.left,
      top: ir.top - wr.top,
      width: ir.width,
      height: ir.height,
    });
  }, []);

  useEffect(() => {
    measure();
    const wrap = wrapperRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrap);
    const onWinResize = () => measure();
    window.addEventListener("resize", onWinResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWinResize);
    };
  }, [measure, src]);

  useEffect(() => {
    if (dragIdx == null) return;
    const onMove = (e: PointerEvent) => {
      const img = imgRef.current;
      if (!img) return;
      const r = img.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
      if (!quadRef.current) return;
      const next = [...quadRef.current] as Quad;
      next[dragIdx] = { x, y };
      onQuadChange(next);
    };
    const onUp = () => setDragIdx(null);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [dragIdx, onQuadChange]);

  // ── Whole-quad translate (group move) ──────────────────────────────
  // Mirror of the corner-drag effect, but moves all 4 corners by the
  // same delta. The translation vector is clamped against the image
  // bounds so the rectangle never overflows the source — the user can
  // push it against an edge but it stops there.
  useEffect(() => {
    if (!isTranslating) return;
    const onMove = (e: PointerEvent) => {
      const t = translateRef.current;
      const img = imgRef.current;
      if (!t || !img) return;
      const r = img.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const dxPct = ((e.clientX - t.startX) / r.width) * 100;
      const dyPct = ((e.clientY - t.startY) / r.height) * 100;
      const xs = t.orig.map((p) => p.x);
      const ys = t.orig.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const cdx = Math.max(-minX, Math.min(100 - maxX, dxPct));
      const cdy = Math.max(-minY, Math.min(100 - maxY, dyPct));
      const next = t.orig.map((p) => ({ x: p.x + cdx, y: p.y + cdy })) as Quad;
      onQuadChange(next);
    };
    const onUp = () => {
      translateRef.current = null;
      setIsTranslating(false);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [isTranslating, onQuadChange]);

  const cornerLabels = ["TL", "TR", "BR", "BL"] as const;
  // Polygon points must be in the order TL, TR, BR, BL so the outline
  // closes cleanly (no self-intersection). Same order as the Quad type.
  const polygonPoints = quad ? quad.map((c) => `${c.x},${c.y}`).join(" ") : "";

  return (
    <div
      ref={wrapperRef}
      className="flex items-center justify-center"
      style={{ position: "relative", width: "100%", height: "100%" }}
      data-testid="quad-cropper"
    >
      <img
        ref={imgRef}
        src={src}
        alt="Source for cropping"
        onLoad={(e) => {
          onImageLoad(e);
          // Image dimensions become known here. Defer to the next
          // animation frame so the browser has finished laying out
          // the new size before we measure.
          requestAnimationFrame(measure);
        }}
        draggable={false}
        style={{
          display: "block",
          maxWidth: "100%",
          maxHeight: "100%",
          width: "auto",
          height: "auto",
          userSelect: "none",
          pointerEvents: "none",
        }}
        data-testid="img-source-quad"
      />
      {/* COLLECT-CORNERS OVERLAY — shown ONLY when quad is null.
          A transparent click target sized to the image; each tap
          records a corner. Visual feedback: small numbered markers
          appear at each clicked point + helper banner with progress.
          After the 4th click we sanitize → onQuadChange → next render
          the standard mask/handles/loupe UI mounts. */}
      {imgRect && !quad && (
        <div
          style={{
            position: "absolute",
            left: imgRect.left,
            top: imgRect.top,
            width: imgRect.width,
            height: imgRect.height,
            cursor: "crosshair",
          }}
          data-testid="quad-collector"
          onPointerDown={(e) => {
            e.preventDefault();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return;
            const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
            const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
            const next = [...pendingPoints, { x, y }];
            if (next.length >= 4) {
              const cleaned = sanitizeQuad([
                next[0], next[1], next[2], next[3],
              ] as Quad);
              setPendingPoints([]);
              onQuadChange(cleaned);
            } else {
              setPendingPoints(next);
            }
          }}
        >
          {/* Connecting polyline between consecutive collected
              corners. Lives inside the collector overlay so its 0–100
              viewBox lines up with the image's pixel space (the
              overlay is sized to imgRect). Drawn ABOVE the image but
              BELOW the numbered point chips. */}
          {pendingPoints.length >= 2 && (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
              aria-hidden
            >
              <polyline
                points={pendingPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#fbbf24"
                strokeWidth="2"
                strokeDasharray="4 3"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
          {/* Drawn pending markers */}
          {pendingPoints.map((p, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: 26,
                height: 26,
                transform: "translate(-50%, -50%)",
                background: "#fbbf24",
                color: "#3b1f00",
                border: "2px solid #fff",
                borderRadius: "50%",
                fontSize: 13,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                pointerEvents: "none",
              }}
            >
              {i + 1}
            </div>
          ))}
        </div>
      )}
      {imgRect && quad && (
        <div
          style={{
            position: "absolute",
            left: imgRect.left,
            top: imgRect.top,
            width: imgRect.width,
            height: imgRect.height,
            pointerEvents: "none",
          }}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              // Re-enable pointer events on the SVG so the interactive
              // polygon below can catch the group-drag gesture; the
              // dim-mask path opts back out via its own attribute.
              pointerEvents: "auto",
            }}
            aria-hidden
          >
            {/* Dim mask: full-image rect with the quad punched out so
                the non-card area is darkened. Single <path> combining
                outer rect + inner polygon with even-odd fill rule.
                pointerEvents="none" so clicks on the dim area don't
                trigger group-drag (would be unintuitive — user would
                expect a click on the dim area to do nothing). */}
            <path
              d={`M0,0 L100,0 L100,100 L0,100 Z M${polygonPoints.replace(/ /g, " L")} Z`}
              fill="rgba(0,0,0,0.55)"
              fillRule="evenodd"
              pointerEvents="none"
            />
            {/* Interactive polygon — invisible-fill catcher for the
                group-drag gesture. Near-zero alpha keeps the area
                visually empty (image shows through) while still
                receiving pointer events thanks to pointerEvents="all".
                Drawn ABOVE the dim mask so clicks inside the quad land
                here, not on the mask. */}
            <polygon
              points={polygonPoints}
              fill="rgba(0,0,0,0.001)"
              stroke="#fbbf24"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              pointerEvents="all"
              style={{ cursor: isTranslating ? "grabbing" : "move" }}
              onPointerDown={(e) => {
                // Don't hijack pointer events that started on a corner
                // handle (they bubble up from the handle button).
                if ((e.target as Element).tagName !== "polygon") return;
                if (!quadRef.current) return;
                e.preventDefault();
                (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                translateRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  orig: [...quadRef.current] as Quad,
                };
                setIsTranslating(true);
              }}
              data-testid="quad-polygon"
            />
          </svg>
          {quad!.map((c, i) => (
            <button
              key={i}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                setDragIdx(i);
              }}
              aria-label={`Card corner ${cornerLabels[i]}`}
              data-testid={`quad-corner-${cornerLabels[i].toLowerCase()}`}
              style={{
                position: "absolute",
                left: `${c.x}%`,
                top: `${c.y}%`,
                width: 32,
                height: 32,
                transform: "translate(-50%, -50%)",
                background: dragIdx === i ? "#fbbf24" : "rgba(255,255,255,0.95)",
                border: "3px solid #fbbf24",
                borderRadius: "50%",
                cursor: dragIdx === i ? "grabbing" : "grab",
                touchAction: "none",
                padding: 0,
                boxShadow: "0 2px 10px rgba(0,0,0,0.6)",
                zIndex: 10,
                pointerEvents: "auto",
              }}
            />
          ))}
          {/* MAGNIFIER LOUPE — Pixel-precise corner placement.
              When the user is actively dragging a corner, show a small
              circular panel near (but never under) that corner with a
              4× zoomed view of the same source image, centered on the
              corner pixel and crosshair-marked. This lets the user see
              EXACTLY which pixel they're snapping to, even on a dense
              card scan. The panel is positioned in the overlay's
              coordinate space (which already matches the displayed
              image rect 1:1) and clamped so it never escapes the
              image bounds. */}
          {dragIdx != null && (() => {
            const PANEL = 140;
            const ZOOM = 4;
            const OFFSET = 24;
            const c = quad![dragIdx];
            const cornerX = (c.x / 100) * imgRect.width;
            const cornerY = (c.y / 100) * imgRect.height;
            // Default placement: top-right of the cursor. If that
            // overflows the image edge, flip to the opposite side.
            let panelLeft = cornerX + OFFSET;
            let panelTop = cornerY - PANEL - OFFSET;
            if (panelLeft + PANEL > imgRect.width) {
              panelLeft = cornerX - PANEL - OFFSET;
            }
            if (panelTop < 0) {
              panelTop = cornerY + OFFSET;
            }
            // Final hard-clamp to keep the loupe fully on-image.
            panelLeft = Math.max(
              0,
              Math.min(imgRect.width - PANEL, panelLeft),
            );
            panelTop = Math.max(
              0,
              Math.min(imgRect.height - PANEL, panelTop),
            );
            // Inner image transform: scale(ZOOM) around the top-left
            // origin, then translate so the corner pixel lands at the
            // centre of the panel (PANEL/2, PANEL/2). Order in CSS
            // transform string is right-to-left in application:
            // scale runs first, then translate by the resulting pixel
            // delta. tx = PANEL/2 - ZOOM * cornerX, ty similarly.
            const tx = PANEL / 2 - ZOOM * cornerX;
            const ty = PANEL / 2 - ZOOM * cornerY;
            return (
              <div
                aria-hidden
                data-testid="quad-magnifier"
                style={{
                  position: "absolute",
                  left: panelLeft,
                  top: panelTop,
                  width: PANEL,
                  height: PANEL,
                  border: "3px solid #fbbf24",
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: "#000",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.7)",
                  pointerEvents: "none",
                  zIndex: 20,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: imgRect.width,
                    height: imgRect.height,
                    transform: `translate(${tx}px, ${ty}px) scale(${ZOOM})`,
                    transformOrigin: "0 0",
                  }}
                >
                  <img
                    src={src}
                    alt=""
                    draggable={false}
                    style={{
                      display: "block",
                      width: "100%",
                      height: "100%",
                      pointerEvents: "none",
                    }}
                  />
                </div>
                {/* Crosshair — vertical + horizontal hairline at panel
                    centre to mark the exact pixel the corner is on. */}
                <div
                  style={{
                    position: "absolute",
                    left: PANEL / 2 - 1,
                    top: 0,
                    width: 2,
                    height: PANEL,
                    background: "#fbbf24",
                    opacity: 0.85,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: PANEL / 2 - 1,
                    width: PANEL,
                    height: 2,
                    background: "#fbbf24",
                    opacity: 0.85,
                  }}
                />
                {/* Centre dot for sub-pixel feedback */}
                <div
                  style={{
                    position: "absolute",
                    left: PANEL / 2 - 4,
                    top: PANEL / 2 - 4,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    border: "2px solid #fbbf24",
                    background: "rgba(255,255,255,0.4)",
                  }}
                />
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 2 — Crop both sides
// ─────────────────────────────────────────────────────────────────────
function Step2Crop({
  draftSource,
  onSelectPage,
  rotatedUrl,
  crop,
  completedCrop,
  quad,
  onQuadChange,
  onResetQuad,
  collectorResetToken,
  zoom,
  rotation,
  onCropChange,
  onCompletedCropChange,
  onZoomChange,
  onRotateBy,
  onImageLoad,
  activeTarget,
  onActiveTargetChange,
  frontUrl,
  backUrl,
  onCapture,
  onClearSide,
  onProceed,
  onBackToUpload,
  isEditing,
}: {
  draftSource: DraftSource;
  onSelectPage: (i: number) => void;
  rotatedUrl: string;
  crop: RICCrop | undefined;
  completedCrop: RICCrop | null;
  quad: Quad | null;
  onQuadChange: (q: Quad | null) => void;
  onResetQuad: () => void;
  collectorResetToken: number;
  zoom: number;
  rotation: 0 | 1 | 2 | 3;
  onCropChange: (c: RICCrop) => void;
  onCompletedCropChange: (c: RICCrop) => void;
  onZoomChange: (z: number) => void;
  onRotateBy: (delta: 1 | -1) => void;
  onImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  activeTarget: CropTarget;
  onActiveTargetChange: (t: CropTarget) => void;
  frontUrl: string;
  backUrl: string;
  onCapture: (target: CropTarget) => void;
  onClearSide: (target: CropTarget) => void;
  onProceed: () => void;
  onBackToUpload: () => void;
  isEditing: boolean;
}) {
  const bothDone = !!frontUrl && !!backUrl;
  // Enable the Capture button as soon as ANY usable rectangle exists —
  // either the finalised completedCrop (preferred) OR the live `crop`
  // marquee. On mobile, ReactCrop's onComplete sometimes fails to fire
  // on touch-end, so locking the button to completedCrop alone leaves
  // it grey-disabled even though the user clearly sees a marquee on
  // the image. captureCrop() applies the same fallback.
  const cropHasArea = (c: { width?: number; height?: number } | null | undefined) =>
    !!c && typeof c.width === "number" && typeof c.height === "number" &&
    c.width > 0 && c.height > 0;
  // With the 4-corner quad capture, a usable shape ALWAYS exists once
  // an image is loaded — the quad is initialised to a small inset and
  // user-draggable from there. Capture is therefore enabled whenever
  // we have a source image to warp from.
  // Reference legacy crop state to silence unused-var lints during the
  // migration window (will be removed when ReactCrop code is purged).
  void crop; void completedCrop; void cropHasArea;
  // Capture is only enabled once the user has marked all 4 corners
  // (quad becomes non-null). Before that there's literally nothing
  // to warp from — the user is in click-to-collect-corners mode.
  const hasCrop = !!rotatedUrl && !!quad;
  const activeLabel = activeTarget === "front" ? "Front" : "Back";

  // ── Crop-mode toggle (per user request 2026-04-29) ──────────────────
  // When OFF (initial state on enter Step 2), the canvas shows the
  // image PLAIN (no marquee overlay) — letting the user zoom around
  // freely with mouse wheel + keyboard to inspect the source. They
  // explicitly click "Crop" to enable the marquee tool, draw a
  // rectangle, then click "Capture". Re-clicking "Crop" turns the
  // marquee off again. The previously-drawn `completedCrop` is kept
  // so the user can capture again without re-drawing if they wish.
  // Default ON — the 4-corner quad is the primary capture interaction
  // (perspective-corrected; replaces the legacy aspect-locked rectangle
  // marquee). User can still toggle it off to view the source plainly
  // for inspection.
  const [cropMode, setCropMode] = useState(true);

  // ── Image-load callback (no auto-seeding) ───────────────────────────
  // Per user request (2026-05-02): the marquee is NEVER auto-populated.
  // The user MUST draw their own rectangle in crop mode — only the
  // manually-cropped region is what appears in the preview box. Since
  // the marquee is aspect-locked at 86:56 and the capture canvas is
  // also 86:56, what they draw is exactly what they get (no cut-off,
  // no extra background).
  //
  // We still forward the load event to the parent so it can track
  // image dimensions if needed.
  const seedInitialCropOnLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      onImageLoad(e);
    },
    [onImageLoad],
  );

  // Min/max zoom range — must mirror the toolbar slider's bounds so
  // mouse-wheel + keyboard zoom feels continuous with slider drag.
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 5;
  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

  // ── Keep the cropper view CENTERED across zoom changes. Without this,
  // zooming in scrolls to the top-left of the enlarged content (the
  // browser's default scroll origin) — extremely disorienting. We pin
  // the scroll position to the geometric middle of the scrollable area
  // every time `zoom` changes, so the user always feels like they're
  // zooming around the center of the image.
  const stageRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    el.scrollTo({
      left: Math.max(0, (el.scrollWidth - el.clientWidth) / 2),
      top: Math.max(0, (el.scrollHeight - el.clientHeight) / 2),
      behavior: "auto",
    });
  }, [zoom, rotatedUrl]);

  // Enlarge-preview modal state. When set, shows the captured Front/Back
  // canvas at near-full screen size so the user can verify whether the
  // crop matched the actual card content (the small thumbnails in the
  // right column are designed for layout density, not detailed
  // verification — this lets users zoom in without recropping).
  const [enlargeTarget, setEnlargeTarget] = useState<CropTarget | null>(null);
  const enlargeUrl = enlargeTarget === "front" ? frontUrl : enlargeTarget === "back" ? backUrl : "";

  // ── Enter-key shortcut: capture into the active side. Registered in
  // Step2Crop (not the page) so we can defer to the enlarge modal: when
  // a modal is open Enter must NOT mutate crop state behind it.
  // Skipped ONLY when focus is in a TEXT-typing element so users can
  // still type. Range sliders, buttons, checkboxes are NOT skipped —
  // pressing Enter after using the zoom slider must still capture.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Modal is open → all global shortcuts are owned by the modal.
      if (enlargeTarget) return;
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName || "").toLowerCase();
      const inputType = tag === "input" ? ((t as HTMLInputElement).type || "text").toLowerCase() : "";
      const isTextTypingElement =
        tag === "textarea" ||
        (t != null && (t as HTMLElement).isContentEditable) ||
        (tag === "input" && /^(text|password|email|number|search|tel|url|date|datetime-local|month|time|week)$/.test(inputType));
      if (isTextTypingElement) return;

      // Keyboard zoom (per user request 2026-04-29): +/= zoom in, - zoom
      // out, 0 reset. Step matches the slider's 0.05 increments × 4 so
      // each press feels significant (≈20% per key).
      if (rotatedUrl && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        onZoomChange(clampZoom(zoom + 0.2));
        return;
      }
      if (rotatedUrl && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        onZoomChange(clampZoom(zoom - 0.2));
        return;
      }
      if (rotatedUrl && e.key === "0") {
        e.preventDefault();
        onZoomChange(1);
        return;
      }

      // Enter → capture. Requires both crop-mode-was-used (we have a
      // completedCrop) AND an image loaded.
      if (e.key === "Enter" && rotatedUrl) {
        e.preventDefault();
        onCapture(activeTarget);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enlargeTarget, rotatedUrl, activeTarget, onCapture, zoom, onZoomChange]);

  // ── Enlarge modal: ESC-to-close, plus initial focus to the close
  // button and focus restoration on dismiss (a11y dialog pattern).
  const enlargeCloseBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedBeforeEnlargeRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!enlargeTarget) return;
    lastFocusedBeforeEnlargeRef.current = document.activeElement as HTMLElement | null;
    // Focus the close button on open so ESC/Enter target the modal.
    const t = window.setTimeout(() => enlargeCloseBtnRef.current?.focus(), 0);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setEnlargeTarget(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      // Restore focus to the previously focused element.
      const prev = lastFocusedBeforeEnlargeRef.current;
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [enlargeTarget]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBackToUpload}
          className="inline-flex items-center gap-1 text-xs text-amber-200 hover:text-amber-100 px-2 py-1 rounded-md hover:bg-white/5"
          data-testid="btn-back-upload"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Upload another file
        </button>
        <div className="text-[11px] text-amber-300/80 font-semibold">
          {isEditing ? "Re-crop the card" : "Mark the 4 card corners on the image"}
        </div>
      </div>

      {/* Step-by-step instruction card — sits ABOVE the canvas so the
          canvas surface itself stays clean (no in-image banners). */}
      <div className="rounded-xl border border-amber-300/30 bg-gradient-to-br from-amber-500/10 via-amber-400/5 to-transparent backdrop-blur-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-6 w-6 rounded-md bg-amber-400 text-amber-950 flex items-center justify-center text-[11px] font-black shadow-sm">
            i
          </div>
          <div className="text-xs font-bold text-amber-100 uppercase tracking-wide">
            How to crop the card
          </div>
        </div>
        <ol className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          {[
            { n: 1, t: "Pick a side", d: "Select Front or Back below the canvas." },
            { n: 2, t: "Tap 4 corners", d: "Click the 4 corners of the card on the image." },
            { n: 3, t: "Fine-tune", d: "Drag corners or the whole quad to align." },
            { n: 4, t: "Capture", d: "Hit Capture, then repeat for the other side." },
          ].map((s) => (
            <li
              key={s.n}
              className="rounded-lg border border-amber-300/20 bg-white/5 p-2 flex items-start gap-2"
            >
              <span className="shrink-0 h-5 w-5 rounded-full bg-amber-400 text-amber-950 text-[10px] font-black flex items-center justify-center">
                {s.n}
              </span>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-amber-100 leading-tight">
                  {s.t}
                </div>
                <div className="text-[10px] text-amber-200/70 leading-snug mt-0.5">
                  {s.d}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* PDF page picker */}
      {draftSource.pdfPages && draftSource.pdfPages.length > 1 && (
        <div className="rounded-xl border border-amber-300/30 bg-white/5 backdrop-blur-xl p-3">
          <div className="text-[10px] uppercase tracking-wider text-amber-200/80 font-bold mb-2 flex items-center gap-1">
            <FileText className="h-3 w-3" /> PDF pages — pick the page that contains the ID card
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {draftSource.pdfPages.map((p) => {
              const active = p.index === draftSource.activePageIndex;
              return (
                <button
                  key={p.index}
                  onClick={() => onSelectPage(p.index)}
                  className={`shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                    active
                      ? "border-amber-300 ring-2 ring-amber-300/40 shadow-lg"
                      : "border-amber-300/30 hover:border-amber-300/60 opacity-80 hover:opacity-100"
                  }`}
                  style={{ width: 60, height: 80 }}
                  data-testid={`pdf-page-${p.index}`}
                >
                  <img src={p.url} alt="" className="w-full h-full object-contain bg-white" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Cropper toolbar — display zoom (image only) + 90° rotate */}
      <div className="rounded-xl border border-amber-300/30 bg-white/5 backdrop-blur-xl p-2.5 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <ZoomOut className="h-3.5 w-3.5 text-amber-200/70" />
          <input
            type="range"
            min={1}
            max={5}
            step={0.05}
            value={zoom}
            onChange={(e) => onZoomChange(parseFloat(e.target.value))}
            className="flex-1 accent-amber-400"
            data-testid="crop-zoom"
            aria-label="Image display zoom"
          />
          <ZoomIn className="h-3.5 w-3.5 text-amber-200/70" />
          <span className="text-xs font-bold text-amber-100 w-12 text-right tabular-nums">
            {zoom.toFixed(2)}×
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onZoomChange(1)}
            className="rounded-lg border border-amber-300/30 bg-white/5 hover:bg-white/10 px-2 py-1 text-[10px] font-bold text-amber-100"
            data-testid="btn-zoom-reset"
            title="Reset zoom"
          >
            Fit
          </button>
          <div className="w-px h-5 bg-amber-300/20 mx-1" />
          <button
            type="button"
            onClick={() => onRotateBy(-1)}
            className="flex items-center gap-1 rounded-lg border border-amber-300/30 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-[11px] font-bold text-amber-100"
            data-testid="btn-rotate-left"
            title="Rotate 90° left"
          >
            <RotateCcw className="h-3 w-3" /> 90°
          </button>
          <button
            type="button"
            onClick={() => onRotateBy(1)}
            className="flex items-center gap-1 rounded-lg border border-amber-300/30 bg-white/5 hover:bg-white/10 px-2.5 py-1 text-[11px] font-bold text-amber-100"
            data-testid="btn-rotate-right"
            title="Rotate 90° right"
          >
            <RotateCw className="h-3 w-3" /> 90°
          </button>
        </div>
      </div>

      {/* VERTICAL layout (per user request 2026-04-29):
            ROW 1 — Toolbar (zoom + rotate)            ← already rendered ABOVE
            ROW 2 — Cropper canvas (FULL width)
            ROW 3 — [ Crop toggle ] + [ Capture ]      ← buttons RIGHT under canvas
            ROW 4 — Front + Back medium preview grids  ← below the buttons

          Rationale: the user wants the action buttons IMMEDIATELY under
          the canvas (where their attention is) and the captured-card
          previews further down for confirmation. Previews are MEDIUM
          (max-w-2xl ≈672 px → each ≈320 px wide) — bigger than thumbnails
          for clear at-a-glance confirmation but still compact.

          Workflow:
            • On entering Step 2, the canvas shows the image PLAIN with
              NO marquee. User can mouse-wheel or +/- keys to zoom in
              and inspect details.
            • Clicking "Crop" enables the marquee tool — user draws a
              rectangle around the card area (FREE aspect, no aspect
              lock — they can hug the card tightly).
            • Clicking "Capture" snapshots the marqueed area and saves
              it to the active side. The captured pixels are placed
              inside an 86:56 white canvas using contain-fit, so the
              full card always shows in print with at most a small
              white margin (NEVER cropped). */}
      <>
        {/* Cropper — view mode (plain image) OR crop mode (ReactCrop marquee).

            Sizing model:
              • At zoom=1 the image is fully fitted (object-contain) into the
                stage so the WHOLE source is always visible.
              • At zoom>1 the inner wrapper grows to `zoom*100%` of the stage
                in BOTH dimensions, the stage scrolls, and the image fills
                the wrapper while preserving aspect ratio.

            Wheel zoom: in BOTH modes a mouse-wheel scroll over the canvas
            zooms in/out (preventDefault stops page scroll). The
            useLayoutEffect below recenters the scroll position whenever
            `zoom` changes — so zoom always focuses on the visual center.

            FREE aspect crop (no aspect lock): the user can draw any
            rectangle hugging the card exactly. The captured marquee is
            then contain-fit into the 86:56 print canvas, so no part of
            their crop is ever cut off. */}
        <div
          ref={stageRef}
          className="id-card-cropper relative rounded-2xl overflow-auto bg-black/60 border border-amber-300/30 p-2"
          style={{ height: 460 }}
          data-testid="crop-stage"
          onWheel={(e) => {
            if (!rotatedUrl) return;
            // Zoom in/out with the mouse wheel. preventDefault on a
            // passive listener is a no-op; React attaches non-passive
            // wheel handlers so this works as expected.
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.15 : 0.15;
            onZoomChange(clampZoom(zoom + delta));
          }}
        >
          {rotatedUrl ? (
            <div
              className="flex items-center justify-center"
              style={{
                width: `${zoom * 100}%`,
                height: `${zoom * 100}%`,
                minWidth: "100%",
                minHeight: "100%",
              }}
            >
              {cropMode ? (
                <QuadCropper
                  src={rotatedUrl}
                  quad={quad}
                  onQuadChange={onQuadChange}
                  onImageLoad={seedInitialCropOnLoad}
                  resetToken={collectorResetToken}
                />
              ) : (
                <img
                  src={rotatedUrl}
                  alt="Source preview"
                  onLoad={onImageLoad}
                  draggable={false}
                  style={{
                    display: "block",
                    maxWidth: "100%",
                    maxHeight: "100%",
                    width: "auto",
                    height: "auto",
                    userSelect: "none",
                  }}
                  data-testid="img-source-plain"
                />
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-amber-200/70 text-sm">
              Loading image…
            </div>
          )}
        </div>

        {/* ROW 3 — Crop toggle + Capture buttons, positioned IMMEDIATELY
            under the canvas per user request. Crop toggle has two visible
            states (highlighted when active) so the user always knows
            whether the marquee is on. Capture is disabled until they've
            drawn a rectangle. */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setCropMode((m) => !m)}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold tracking-wide transition-all border
              ${cropMode
                ? "bg-amber-300/20 border-amber-300 text-amber-100 shadow-inner"
                : "bg-white/5 border-amber-300/30 text-amber-200 hover:bg-white/10 hover:text-amber-100"
              }`}
            data-testid="btn-crop-toggle"
            aria-pressed={cropMode}
            aria-label={cropMode ? "Exit crop mode" : "Enter crop mode"}
          >
            <CropIcon className="h-4 w-4" />
            {cropMode ? "Hide corners" : "Show 4 corners"}
          </button>
          <button
            type="button"
            onClick={onResetQuad}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold tracking-wide transition-all border bg-white/5 border-amber-300/30 text-amber-200 hover:bg-white/10 hover:text-amber-100"
            data-testid="btn-quad-reset"
            aria-label="Reset corners"
            title="Reset corners"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onCapture(activeTarget)}
            disabled={!hasCrop}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold tracking-wide transition-all
              ${hasCrop
                ? "bg-gradient-to-r from-amber-400 to-amber-500 text-purple-950 shadow-lg shadow-amber-500/30 hover:from-amber-300 hover:to-amber-400 active:scale-[0.98]"
                : "bg-white/5 text-amber-200/40 border border-amber-300/20 cursor-not-allowed"
              }`}
            data-testid="btn-capture-active"
          >
            <CheckCircle2 className="h-4 w-4" />
            Capture {activeLabel} side
            <kbd className="ml-1 hidden sm:inline-flex items-center rounded border border-purple-950/30 bg-purple-950/20 px-1.5 py-0.5 text-[10px] font-mono">
              Enter
            </kbd>
          </button>
        </div>

        {/* ROW 4 — Front + Back preview grid below the buttons.
            Responsive sizing model:
              • mobile  (<640 px): single column, full content width
              • tablet  (sm)     : two columns, ≈320 px each
              • desktop (lg+)    : two columns, ≈500 px each (capped
                by max-w-5xl regardless of viewport size beyond xl)
            `mx-auto` centers the grid inside the wider PrimeToolShell
            content area (max-w-6xl ≈1152 px). Each cell carries
            `min-w-0` so flex/grid intrinsic min-content can never push
            the box wider than its column on narrow viewports. The
            inner card slot is locked to aspect 86:56 (CSS aspect-ratio)
            and the captured image uses object-contain, so the FULL
            captured 86×56 mm canvas is always visible — with a small
            white letterbox/pillarbox if the marquee aspect ever drifts.
            Click any preview to enlarge to full screen. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-6 max-w-5xl mx-auto w-full">
          <div className="min-w-0">
            <SidePreviewBox
              label="Front side"
              imageUrl={frontUrl}
              isActiveTarget={activeTarget === "front"}
              onClear={() => onClearSide("front")}
              onMakeActive={() => onActiveTargetChange("front")}
              onEnlarge={() => setEnlargeTarget("front")}
              testIdRoot="front"
            />
          </div>
          <div className="min-w-0">
            <SidePreviewBox
              label="Back side"
              imageUrl={backUrl}
              isActiveTarget={activeTarget === "back"}
              onClear={() => onClearSide("back")}
              onMakeActive={() => onActiveTargetChange("back")}
              onEnlarge={() => setEnlargeTarget("back")}
              testIdRoot="back"
            />
          </div>
        </div>
      </>

      <div className="flex items-center gap-2">
        <div className="text-[11px] text-purple-100/70 flex-1">
          {bothDone
            ? "Both sides ready — proceed."
            : `${frontUrl ? "✓" : "○"} Front  ${backUrl ? "✓" : "○"} Back  — Crop → tap 4 corners → press Capture. (Use Wheel / + / - / 0 keys to zoom)`}
        </div>
        <GoldButton onClick={onProceed} disabled={!bothDone} testId="btn-proceed-sheet">
          {isEditing ? "Save & Back to Sheet" : "Go to Sheet"}
          <ChevronRight className="h-4 w-4" />
        </GoldButton>
      </div>

      {/* Enlarge-preview dialog: shows the captured Front/Back image at
          near-full screen so users can verify the crop content is correct.
          Uses object-contain to show the full canvas with no cropping.
          Implements an accessible dialog: role="dialog" + aria-modal,
          initial focus on close button, focus restoration on dismiss. */}
      <AnimatePresence>
        {enlargeTarget && enlargeUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-8"
            onClick={() => setEnlargeTarget(null)}
            data-testid="enlarge-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="enlarge-dialog-title"
          >
            <div className="flex items-center justify-between w-full max-w-5xl mb-3">
              <div
                id="enlarge-dialog-title"
                className="text-amber-200 text-sm font-bold uppercase tracking-wider"
              >
                {enlargeTarget === "front" ? "Front side" : "Back side"} — captured (85.6×54 mm)
              </div>
              <button
                ref={enlargeCloseBtnRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEnlargeTarget(null);
                }}
                className="inline-flex items-center justify-center rounded-md border border-amber-300/40 bg-white/10 hover:bg-white/20 text-amber-100 px-3 py-1.5 text-xs font-bold gap-1 focus:outline-none focus:ring-2 focus:ring-amber-300"
                data-testid="btn-close-enlarge"
                aria-label="Close enlarged preview"
              >
                <X className="h-4 w-4" /> Close (Esc)
              </button>
            </div>
            <div
              className="bg-white rounded-lg shadow-2xl overflow-hidden w-full max-w-5xl"
              style={{ aspectRatio: `${CARD_W_MM} / ${CARD_H_MM}` }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={enlargeUrl}
                alt="Enlarged capture"
                className="w-full h-full object-fill"
                data-testid={`img-enlarge-${enlargeTarget}`}
              />
            </div>
            <div className="text-amber-100/70 text-[11px] mt-3 text-center max-w-2xl">
              If the card content doesn't look right, close the overlay and click the preview box to re-crop.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidePreviewBox({
  label,
  imageUrl,
  isActiveTarget,
  onClear,
  onMakeActive,
  onEnlarge,
  testIdRoot,
}: {
  label: string;
  imageUrl: string;
  isActiveTarget: boolean;
  onClear: () => void;
  onMakeActive: () => void;
  onEnlarge: () => void;
  testIdRoot: string;
}) {
  return (
    <div
      onClick={onMakeActive}
      className={`rounded-xl border-2 p-2 transition-all cursor-pointer ${
        isActiveTarget
          ? "border-amber-300 bg-amber-300/10 shadow-lg"
          : "border-white/10 bg-white/[0.04] hover:border-amber-300/40"
      }`}
      data-testid={`box-${testIdRoot}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200">{label}</span>
        <div className="flex items-center gap-1">
          <span className={`text-[9px] px-1.5 py-0.5 rounded ${
            isActiveTarget ? "bg-amber-300 text-purple-950 font-bold" : "bg-white/10 text-amber-200/70"
          }`}>
            {isActiveTarget ? "ACTIVE" : "Click to focus"}
          </span>
          {imageUrl && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEnlarge();
                }}
                className="inline-flex items-center justify-center rounded-md border border-amber-300/30 bg-white/5 hover:bg-white/10 text-amber-200 hover:text-amber-100 min-w-[24px] min-h-[24px]"
                data-testid={`btn-enlarge-${testIdRoot}`}
                aria-label={`Enlarge ${label}`}
                title="Enlarge to verify"
              >
                <Maximize2 className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                className="inline-flex items-center justify-center rounded-md border border-amber-300/30 bg-white/5 hover:bg-white/10 text-rose-300 hover:text-rose-200 min-w-[24px] min-h-[24px]"
                data-testid={`btn-clear-${testIdRoot}`}
                aria-label={`Clear ${label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </div>
      {/* Card slot: container locked to 85.6:54. Captured canvas is also
          85.6:54 (marquee is aspect-locked), so the image fills the slot
          edge-to-edge with no white letterbox AND no clipping. We use
          `object-fill` (not `contain`) since the aspects match exactly —
          this prevents sub-pixel rounding from leaving a 1-px white seam.
          Click-to-enlarge so the user can verify the full card content
          without recropping. */}
      <div
        className="relative rounded-md overflow-hidden bg-white border border-amber-300/20"
        style={{ aspectRatio: `${CARD_W_MM} / ${CARD_H_MM}` }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={label}
            className="w-full h-full object-fill cursor-zoom-in"
            data-testid={`img-${testIdRoot}`}
            onClick={(e) => {
              e.stopPropagation();
              onEnlarge();
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-purple-300/50 text-[11px] px-2 text-center">
            {isActiveTarget ? "Tap 4 corners on the image" : "Click this box first"}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 3 — Sheet builder
// ─────────────────────────────────────────────────────────────────────
function Step3Sheet({
  cards,
  activeCardId,
  onSelectActive,
  onAddAnother,
  onRecrop,
  onDelete,
  onSetCopies,
  customMode,
  customInputs,
  onCustomMode,
  onCustomInputs,
  pageSize,
  onPageSize,
  layout,
  previewScale,
  totalPairsRequested,
  pdfBusy,
  pdfProgress,
  onGeneratePdf,
  onSingleJpg,
  onClearAll,
  isPrime,
}: {
  cards: CardEntry[];
  activeCardId: string | null;
  onSelectActive: (id: string) => void;
  onAddAnother: () => void;
  onRecrop: (id: string) => void;
  onDelete: (id: string) => void;
  onSetCopies: (id: string, copies: number) => void;
  customMode: Record<string, boolean>;
  customInputs: Record<string, string>;
  onCustomMode: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onCustomInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  pageSize: PageSize;
  onPageSize: (p: PageSize) => void;
  layout: SheetLayout | null;
  previewScale: number;
  totalPairsRequested: number;
  pdfBusy: boolean;
  pdfProgress: number;
  onGeneratePdf: () => void;
  onSingleJpg: () => void;
  onClearAll: () => void;
  isPrime: boolean;
}) {
  const activeCard = cards.find((c) => c.id === activeCardId) ?? cards[0];
  const activeIdx = cards.findIndex((c) => c.id === activeCard.id);
  const inCustom = !!customMode[activeCard.id];
  const isPresetCount = (PRESET_COPIES as readonly number[]).includes(activeCard.copies);
  const pairsForActive = layout?.cells.filter(
    (c) => c.cardIndex === activeIdx && c.side === "front",
  ).length ?? 0;

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">
      <div className="space-y-4">
        <div
          className="rounded-2xl border border-amber-300/30 bg-gradient-to-br from-purple-900/40 to-indigo-950/40 backdrop-blur-xl p-3 sm:p-4"
          data-testid="cards-panel"
        >
          {/* Card thumbnails strip */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {cards.map((c, idx) => {
              const isActive = c.id === activeCard.id;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelectActive(c.id)}
                  className={`relative shrink-0 rounded-lg overflow-hidden border-2 transition-all bg-white ${
                    isActive
                      ? "border-amber-300 ring-2 ring-amber-300/40 shadow-lg"
                      : "border-amber-300/30 hover:border-amber-300/60 opacity-85 hover:opacity-100"
                  }`}
                  // Width is computed from height so each side keeps the
                  // exact 86:56 card aspect ratio. Tailwind's `border-2`
                  // uses border-box sizing, so the *inner* content
                  // height is `outerH - 2*borderPx`; we account for that
                  // when sizing the outer width.
                  // The OLD fixed `width: 130` produced ~64.5×50 cells
                  // (≈1.29:1), forcing object-cover to crop the left/
                  // right edges of every captured card — the "cut
                  // preview" the user saw on desktop. Mobile thumbnails
                  // had the same bug but were physically tiny, so the
                  // clipping went unnoticed there.
                  style={(() => {
                    const outerH = 50;
                    const borderPx = 2;
                    const gapPx = 1;
                    const innerH = outerH - 2 * borderPx;
                    const sideW = innerH * (CARD_W_MM / CARD_H_MM);
                    const outerW = 2 * sideW + gapPx + 2 * borderPx;
                    return { height: outerH, width: outerW };
                  })()}
                  data-testid={`card-thumb-${idx}`}
                  aria-label={`Select card ${idx + 1}`}
                >
                  <div className="flex h-full">
                    <img
                      src={c.frontUrl}
                      alt=""
                      className="w-1/2 h-full object-contain bg-white"
                    />
                    <div className="w-px bg-amber-300/40 h-full" />
                    <img
                      src={c.backUrl}
                      alt=""
                      className="w-1/2 h-full object-contain bg-white"
                    />
                  </div>
                  <div className="absolute top-0.5 left-0.5 px-1 rounded bg-black/65 text-amber-200 text-[9px] font-bold leading-none py-0.5">
                    C{idx + 1}
                  </div>
                  <div className="absolute bottom-0.5 right-0.5 px-1 rounded bg-amber-300/95 text-purple-950 text-[9px] font-bold leading-none py-0.5">
                    ×{c.copies}
                  </div>
                </button>
              );
            })}
            <button
              onClick={onAddAnother}
              className="shrink-0 rounded-lg border-2 border-dashed border-amber-300/40 hover:border-amber-300/80 bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center text-amber-200 hover:text-amber-100"
              style={{ width: 130, height: 50 }}
              data-testid="btn-add-card"
              aria-label="Add another card"
            >
              <Plus className="h-4 w-4" />
              <div className="text-[9px] font-bold mt-0.5">Add card</div>
            </button>
          </div>

          {/* Active card header */}
          <div className="flex items-center gap-2 mt-3 mb-3">
            <span className="inline-flex items-center justify-center h-6 px-2 rounded-md bg-amber-300/20 text-amber-200 text-[11px] font-bold">
              Card {activeIdx + 1}
            </span>
            <div className="text-[11px] text-purple-100/60 truncate">
              {activeCard.copies} requested · {pairsForActive} pairs on sheet
            </div>
            <button
              onClick={() => onRecrop(activeCard.id)}
              className="ml-auto inline-flex items-center gap-1 rounded-md bg-amber-400/15 hover:bg-amber-400/25 border border-amber-300/40 px-2 py-1 text-[11px] font-bold text-amber-100"
              data-testid="btn-recrop-active"
            >
              <CropIcon className="h-3 w-3" /> Re-crop
            </button>
            <button
              onClick={() => onDelete(activeCard.id)}
              className="inline-flex items-center gap-1 text-[11px] text-rose-300 hover:text-rose-200 px-2 py-1 rounded-md hover:bg-rose-500/10"
              data-testid="btn-delete-active"
              aria-label="Delete this card"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Copies controls */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-amber-200/80 font-bold mb-1.5">
              Copies (1 = Front + Back pair)
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {PRESET_COPIES.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    onSetCopies(activeCard.id, c);
                    onCustomMode((m) => ({ ...m, [activeCard.id]: false }));
                  }}
                  className={`rounded-lg py-1.5 font-bold text-xs transition-all ${
                    activeCard.copies === c && !inCustom
                      ? "bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 shadow"
                      : "bg-white/5 text-amber-100 hover:bg-white/10 border border-amber-300/20"
                  }`}
                  data-testid={`btn-copies-${c}`}
                >
                  {c === 5 ? "5 (Full)" : c}
                </button>
              ))}
            </div>
            <div className="mt-1.5">
              {!inCustom && !isPresetCount && (
                <button
                  onClick={() => onCustomMode((m) => ({ ...m, [activeCard.id]: true }))}
                  className="w-full rounded-lg py-1.5 font-bold text-xs bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 shadow"
                  data-testid="btn-custom-active"
                >
                  Custom: {activeCard.copies}
                </button>
              )}
              {!inCustom && isPresetCount && (
                <button
                  onClick={() => {
                    onCustomMode((m) => ({ ...m, [activeCard.id]: true }));
                    onCustomInputs((m) => ({ ...m, [activeCard.id]: String(activeCard.copies) }));
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
                    placeholder="e.g. 8"
                    value={customInputs[activeCard.id] ?? ""}
                    onChange={(e) =>
                      onCustomInputs((m) => ({ ...m, [activeCard.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const n = parseInt(customInputs[activeCard.id] ?? "", 10);
                        if (Number.isFinite(n) && n >= 1) {
                          onSetCopies(activeCard.id, n);
                          onCustomMode((m) => ({ ...m, [activeCard.id]: false }));
                        }
                      } else if (e.key === "Escape") {
                        onCustomMode((m) => ({ ...m, [activeCard.id]: false }));
                      }
                    }}
                    className="flex-1 min-w-0 rounded-lg bg-white/10 border border-amber-300/40 text-amber-100 placeholder-amber-200/40 px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-400"
                    data-testid="input-custom"
                  />
                  <button
                    onClick={() => {
                      const n = parseInt(customInputs[activeCard.id] ?? "", 10);
                      if (Number.isFinite(n) && n >= 1) {
                        onSetCopies(activeCard.id, n);
                        onCustomMode((m) => ({ ...m, [activeCard.id]: false }));
                      }
                    }}
                    disabled={
                      !customInputs[activeCard.id] ||
                      parseInt(customInputs[activeCard.id] ?? "", 10) < 1
                    }
                    className="rounded-lg px-2.5 py-1.5 text-xs font-bold bg-gradient-to-br from-amber-300 to-yellow-500 text-purple-950 shadow disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid="btn-custom-apply"
                  >
                    Set
                  </button>
                  <button
                    onClick={() => onCustomMode((m) => ({ ...m, [activeCard.id]: false }))}
                    className="rounded-lg px-2 py-1.5 text-xs font-bold bg-white/5 text-amber-100 hover:bg-white/10 border border-amber-300/20"
                    data-testid="btn-custom-cancel"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sheet preview */}
        {layout && layout.cells.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-amber-200 font-bold mb-1.5">
              Sheet preview ({pageSize}, {layout.pairsFit}{" "}
              {layout.pairsFit === 1 ? "pair" : "pairs"} · {cards.length}{" "}
              {cards.length === 1 ? "card" : "cards"})
            </div>
            <div
              className="relative bg-white rounded-md shadow-2xl mx-auto overflow-hidden"
              style={{
                width: PAGE_DIMS_MM[pageSize].w * previewScale,
                height: PAGE_DIMS_MM[pageSize].h * previewScale,
              }}
            >
              {layout.cells.map((cell, i) => {
                const card = cards[cell.cardIndex];
                if (!card) return null;
                const url = cell.side === "front" ? card.frontUrl : card.backUrl;
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
                      className="w-full h-full object-contain"
                      style={{
                        // FIX 2026-05-08: switched object-cover → object-contain.
                        // object-cover was silently CROPPING the captured card's
                        // left/right edges whenever the captured canvas's aspect
                        // drifted by even a fraction from the cell's 86:56 (which
                        // happens because the snap-to-aspect function measures
                        // against the outer .ReactCrop wrapper, not the inner
                        // <img>, so the percent crop can produce a source area
                        // that's slightly off-aspect even though the target
                        // canvas is forced to 86:56). object-contain shows the
                        // FULL captured image without further cropping —
                        // matching the PDF (which uses addImage stretch-fit).
                        // Math check for rotated case: 86:56 image in 56:86
                        // cell with contain → scaled to (56 × 36.47). After
                        // rotate(90deg) scale(86/56) → fills 56 × 86 exactly.
                        transform: cell.rotate ? `rotate(90deg) scale(${CARD_ASPECT})` : undefined,
                        transformOrigin: "center",
                      }}
                    />
                  </div>
                );
              })}
            </div>
            {totalPairsRequested > layout.pairsFit && (
              <div className="mt-2 text-[11px] text-amber-300/80">
                All pairs don't fit on one page — use a larger paper size or reduce copies.
                ({layout.pairsFit}/{totalPairsRequested})
              </div>
            )}
          </div>
        )}

        <AnimatePresence>
          {pdfBusy && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <GoldLoader progress={pdfProgress} label="Building 300 DPI PDF…" />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-wrap gap-3">
          <GoldButton
            onClick={onGeneratePdf}
            disabled={pdfBusy || !layout || layout.cells.length === 0}
            testId="btn-generate-pdf"
          >
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {pdfBusy ? "Building PDF…" : "One-Click Print PDF"}
            {!isPrime && <Lock className="h-3 w-3 ml-1" />}
          </GoldButton>
          <button
            onClick={onSingleJpg}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-300/40 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm font-semibold text-amber-100"
            data-testid="btn-download-single"
          >
            <Download className="h-4 w-4" /> Single JPG
            {!isPrime && <Lock className="h-3 w-3 ml-1 opacity-70" />}
          </button>
          <button
            onClick={onClearAll}
            className="ml-auto inline-flex items-center gap-1.5 text-xs text-purple-200/70 hover:text-amber-200"
            data-testid="btn-reset-all"
          >
            <Trash2 className="h-3.5 w-3.5" /> Reset all
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-200 mb-3">
            Page size
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["A4", "4x6", "5x7"] as PageSize[]).map((p) => (
              <button
                key={p}
                onClick={() => onPageSize(p)}
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

        <div className="rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-400/10 to-purple-600/10 p-4 text-xs text-purple-100/85 leading-relaxed">
          <div className="flex items-center gap-1.5 text-amber-200 font-bold mb-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
            Sheet summary
          </div>
          <div>
            <strong className="text-amber-100">{cards.length}</strong> cards ·{" "}
            <strong className="text-amber-100">{totalPairsRequested}</strong> pairs requested ·{" "}
            <strong className="text-amber-100">{layout?.pairsFit ?? 0}</strong> fit on {pageSize}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-400/15 to-purple-600/10 p-4 text-xs text-purple-100/85 leading-relaxed">
          <div className="flex items-center gap-1.5 text-amber-200 font-bold mb-1">
            <CreditCard className="h-3.5 w-3.5" /> Pair-Adjacent Layout
          </div>
          Each card's Back sits right next to its Front. Cut and laminate.
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs text-purple-100/80 leading-relaxed">
          Output is a print-ready <strong className="text-amber-100">PDF @ 300 DPI</strong> with
          a <strong className="text-amber-100">1px black cut border</strong> around each side —
          professional studio quality.
        </div>

        {!isPrime && (
          <div className="rounded-2xl border border-amber-300/40 bg-gradient-to-br from-amber-500/15 to-amber-300/5 p-4 text-xs text-amber-100 leading-relaxed">
            <div className="flex items-center gap-1.5 text-amber-200 font-bold mb-1">
              <Lock className="h-3.5 w-3.5" /> Download Prime-only
            </div>
            The tool is free — but PDF/JPG downloads require Prime membership.
          </div>
        )}
      </aside>
    </div>
  );
}
