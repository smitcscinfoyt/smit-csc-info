/**
 * Floating toolbar that appears above the currently-selected element(s).
 * Shows controls relevant to the element type — colour for shapes, font
 * for text, BG-remove + flip + filter for images. Also includes the
 * always-on Lock / Duplicate / Delete trio.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Square,
  Droplet,
  Maximize2,
  RotateCw,
  Play,
  Crop as CropIcon,
  Check,
  X as XIcon,
  Wrench,
  Eraser,
  Baseline,
  Blend,
  Spline,
  Frame,
  LetterText,
  LayoutGrid,
  Pipette,
  Brush,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
} from "lucide-react";
import { useStudio, useActivePage } from "../store";
import type { CircleElement, ElementData, IconElement, ImageElement, LineElement, RectElement, TextElement } from "../types";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { FontPicker } from "../fonts/FontPicker";

interface ContextualToolbarProps {
  /** The overflow:hidden stage container; we use it to clamp the
   *  floating toolbar so it never escapes off-screen left/right at
   *  extreme pan/zoom or when the selected element is near a page
   *  edge. Optional — without it the toolbar still renders but is not
   *  clamped horizontally. */
  containerRef?: React.RefObject<HTMLDivElement>;
}

export function ContextualToolbar({ containerRef }: ContextualToolbarProps = {}) {
  const selectedIds = useStudio((s) => s.selectedIds);
  // Toolbar buttons are user-initiated edits → use the committing variant
  // so every change is undoable.
  const updateElement = useStudio((s) => s.commitUpdateElement);
  const deleteElements = useStudio((s) => s.deleteElements);
  const duplicateElements = useStudio((s) => s.duplicateElements);
  const reorderElement = useStudio((s) => s.reorderElement);
  const cropMode = useStudio((s) => s.cropMode);
  const setCropMode = useStudio((s) => s.setCropMode);
  const eraseMode = useStudio((s) => s.eraseMode);
  const setEraseMode = useStudio((s) => s.setEraseMode);
  const eraseBrushSize = useStudio((s) => s.eraseBrushSize);
  const setEraseBrushSize = useStudio((s) => s.setEraseBrushSize);
  const zoom = useStudio((s) => s.zoom);
  const pan = useStudio((s) => s.pan);
  const page = useActivePage();
  const setSidebarTab = useStudio((s) => s.setSidebarTab);

  const selected = useMemo(
    () => (page?.elements.filter((e) => selectedIds.includes(e.id)) ?? []),
    [page, selectedIds],
  );

  // ── Toolbar anchor: FIXED on the canvas VIEWPORT centre ───────────
  // With the new infinite-canvas layout (Stage.tsx) the page is ALWAYS
  // re-centred in the viewport on every zoom change, so anchoring the
  // toolbar to the viewport centre keeps it visually pinned over the
  // page AND guarantees its position never changes when the user
  // zooms in or out — exactly what the user asked for. We intentionally
  // do NOT subscribe to `pan` or `zoom` here so re-renders triggered
  // by those values cannot move the toolbar.
  void zoom; void pan; // explicitly unused — keep imports for other call-sites

  // ── Measure the toolbar so we can clamp it inside the container.
  // We re-measure after layout via a useLayoutEffect-like pattern using
  // a ref + ResizeObserver. Initial render uses 0 → the toolbar
  // positions itself off the model first paint, then immediately
  // re-positions on the next frame once we know its real width. Visual
  // result is indistinguishable from a one-shot layout because both
  // happen inside the same paint cycle.
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [toolbarSize, setToolbarSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setToolbarSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Track the stage container's live size as REACTIVE STATE.
  // Reading `containerRef.current?.clientWidth` directly during render
  // (as we used to) gives the value AT the moment React commits — but
  // React doesn't re-render when the container resizes (refs don't
  // trigger re-renders), so the toolbar's left/clamp math went stale
  // the moment the user resized the window or the LeftSidebar opened
  // a different panel. We subscribe via ResizeObserver so the toolbar
  // ALWAYS knows the current viewport width and re-centres on every
  // size change.
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [containerRef]);

  // ── Crop-mode toolbar ───────────────────────────────────────────────
  // While the user is interactively cropping an image, replace the
  // entire toolbar with a focused Done / Cancel bar. The CropOverlay
  // publishes a window-level commit() that returns the geometry patch.
  if (cropMode) {
    // Resolve the cropping element across ALL pages — multi-page
    // rendering means the user can switch active page mid-crop and we
    // still need Done to apply the patch to the right element on the
    // page that originated the crop. `cropMode` is the element id.
    const allPages = useStudio.getState().pages;
    let cropEl: ElementData | undefined;
    for (const p of allPages) {
      const found = p.elements.find((e) => e.id === cropMode);
      if (found) {
        cropEl = found;
        break;
      }
    }
    const doneCrop = () => {
      const fn = (window as any).__primeStudioCropCommit as
        | (() => Partial<ImageElement> | null)
        | undefined;
      const patch = fn?.();
      if (patch && cropEl) {
        updateElement(cropEl.id, patch as Partial<ElementData>);
      }
      setCropMode(null);
    };
    const cancelCrop = () => setCropMode(null);
    return (
      <div className="flex items-center gap-2 bg-white/95 backdrop-blur rounded-lg shadow-lg ring-1 ring-purple-200 px-3 py-1.5">
        <CropIcon className="h-4 w-4 text-purple-700" />
        <span className="text-sm font-semibold text-purple-900">Crop image</span>
        <span className="text-xs text-purple-600 hidden sm:inline">
          • Drag a corner / edge
        </span>
        <div className="w-px h-5 bg-purple-200 mx-1" />
        <button
          onClick={cancelCrop}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded text-purple-700 hover:bg-purple-50"
          data-testid="btn-crop-cancel"
        >
          <XIcon className="h-3.5 w-3.5" /> Cancel
        </button>
        <button
          onClick={doneCrop}
          className="flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded bg-amber-400 text-purple-900 hover:bg-amber-300"
          data-testid="btn-crop-done"
        >
          <Check className="h-3.5 w-3.5" /> Done
        </button>
      </div>
    );
  }

  // ── Erase-mode toolbar ────────────────────────────────────────────
  // Same focus-bar pattern as crop: while erasing, the rest of the
  // toolbar is suppressed. User gets brush size + Clear + Done /
  // Cancel. The EraseOverlay paints into an offscreen mask canvas;
  // Done reads it via window.__primeStudioEraseCommit and writes the
  // resulting data-URL into el.eraseMask via commitUpdateElement so
  // the action is undoable.
  if (eraseMode) {
    const allPages = useStudio.getState().pages;
    let eraseEl: ElementData | undefined;
    for (const p of allPages) {
      const found = p.elements.find((e) => e.id === eraseMode);
      if (found) {
        eraseEl = found;
        break;
      }
    }
    const doneErase = () => {
      const fn = (window as any).__primeStudioEraseCommit as
        | (() => Partial<ImageElement> | null)
        | undefined;
      const patch = fn?.();
      if (patch && eraseEl) {
        updateElement(eraseEl.id, patch as Partial<ElementData>);
      }
      setEraseMode(null);
    };
    const cancelErase = () => setEraseMode(null);
    const clearErase = () => {
      const fn = (window as any).__primeStudioEraseClear as (() => void) | undefined;
      fn?.();
    };
    return (
      <div className="flex items-center gap-2 bg-white/95 backdrop-blur rounded-lg shadow-lg ring-1 ring-purple-200 px-3 py-1.5">
        <Eraser className="h-4 w-4 text-purple-700" />
        <span className="text-sm font-semibold text-purple-900">Erase</span>
        <span className="text-xs text-purple-600 hidden sm:inline">
          • Paint to remove pixels
        </span>
        <div className="w-px h-5 bg-purple-200 mx-1" />
        <label className="flex items-center gap-1.5 text-xs text-purple-800">
          <span className="font-semibold">Brush</span>
          <input
            type="range"
            min={6}
            max={200}
            value={eraseBrushSize}
            onChange={(e) => setEraseBrushSize(+e.target.value)}
            className="w-24 accent-purple-600"
            data-testid="slider-erase-brush"
          />
          <span className="w-8 text-right tabular-nums">{eraseBrushSize}</span>
        </label>
        <div className="w-px h-5 bg-purple-200 mx-1" />
        <button
          onClick={clearErase}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded text-purple-700 hover:bg-purple-50"
          title="Clear all paint strokes"
          data-testid="btn-erase-clear"
        >
          <XIcon className="h-3.5 w-3.5" /> Clear
        </button>
        <button
          onClick={cancelErase}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded text-purple-700 hover:bg-purple-50"
          data-testid="btn-erase-cancel"
        >
          Cancel
        </button>
        <button
          onClick={doneErase}
          className="flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded bg-amber-400 text-purple-900 hover:bg-amber-300"
          data-testid="btn-erase-done"
        >
          <Check className="h-3.5 w-3.5" /> Done
        </button>
      </div>
    );
  }

  if (!selected.length) return null;
  const focal = selected[selected.length - 1];
  const isText = focal.type === "text";
  const isShape = focal.type === "rect" || focal.type === "circle";
  const isLine = focal.type === "line";
  const isIcon = focal.type === "icon";
  const isImage = focal.type === "image";

  const tEl = isText ? (focal as TextElement) : null;
  const sEl = isShape ? (focal as RectElement) : null;
  const lEl = isLine ? (focal as LineElement) : null;
  const icEl = isIcon ? (focal as IconElement) : null;
  const iEl = isImage ? (focal as ImageElement) : null;

  // BG Remove + AI Enhance now live INSIDE the Tools side panel — the
  // floating toolbar simply has a "Tools" button that opens the panel.

  // Position the toolbar just above the current PAGE rectangle,
  // horizontally centred on the page. We use `transform: translateX(-50%)`
  // for centring instead of doing the math ourselves — that way the
  // toolbar is centred PIXEL-PERFECT on the viewport centre regardless of how
  // wide the toolbar grows (different element types show wildly
  // different toolbar widths: shape toolbar can be 600+px while the
  // image trio is ~250px). We also constrain the toolbar's max-width
  // to the live container width minus padding so it can never overflow
  // the canvas viewport — `overflow-x-auto` then handles horizontal
  // scrolling for very narrow screens.
  const containerW = containerSize.w;
  const PADDING = 12;
  // Toolbar is FIXED at the top-centre of the canvas viewport. Both
  // `top` and `left` are pure functions of the container's own size,
  // so zooming / scrolling cannot move it.
  const toolbarTop = PADDING;
  const toolbarCenterX = containerW > 0 ? containerW / 2 : 0;
  const floatStyle: React.CSSProperties = {
    top: `${toolbarTop}px`,
    left: `${toolbarCenterX}px`,
    transform: "translateX(-50%)",
    // Cap toolbar width so it can never poke past the container.
    maxWidth: containerW > 0 ? `${containerW - PADDING * 2}px` : undefined,
  };
  // Suppress unused-warning — kept around for potential future clamp.
  void toolbarSize;

  return (
    <div
      ref={toolbarRef}
      style={floatStyle}
      className="absolute z-30 bg-white rounded-lg shadow-xl border border-purple-200 px-2 py-1.5 flex items-center gap-1 max-w-[95vw] overflow-x-auto pointer-events-auto"
    >
      {/* TEXT controls */}
      {tEl && selected.length === 1 && (
        <>
          <FontPicker
            value={tEl.fontFamily}
            onChange={(family) => updateElement(tEl.id, { fontFamily: family } as any)}
          />
          <button
            onClick={() => updateElement(tEl.id, { fontSize: Math.max(6, tEl.fontSize - 4) } as any)}
            className="px-1.5 hover:bg-purple-100 rounded text-purple-900"
          >−</button>
          <span className="text-xs font-bold w-8 text-center tabular-nums">{Math.round(tEl.fontSize)}</span>
          <button
            onClick={() => updateElement(tEl.id, { fontSize: tEl.fontSize + 4 } as any)}
            className="px-1.5 hover:bg-purple-100 rounded text-purple-900"
          >+</button>
          <Sep />
          <ToggleBtn
            on={tEl.fontStyle.includes("bold")}
            onClick={() => updateElement(tEl.id, {
              fontStyle: tEl.fontStyle.includes("bold")
                ? tEl.fontStyle.replace("bold", "").trim() || "normal"
                : (tEl.fontStyle === "normal" ? "bold" : `${tEl.fontStyle} bold`),
            } as any)}
            icon={<Bold className="h-3.5 w-3.5" />}
            title="Bold"
          />
          <ToggleBtn
            on={tEl.fontStyle.includes("italic")}
            onClick={() => updateElement(tEl.id, {
              fontStyle: tEl.fontStyle.includes("italic")
                ? tEl.fontStyle.replace("italic", "").trim() || "normal"
                : (tEl.fontStyle === "normal" ? "italic" : `italic ${tEl.fontStyle}`),
            } as any)}
            icon={<Italic className="h-3.5 w-3.5" />}
            title="Italic"
          />
          <ToggleBtn
            on={tEl.textDecoration === "underline"}
            onClick={() => updateElement(tEl.id, {
              textDecoration: tEl.textDecoration === "underline" ? "" : "underline",
            } as any)}
            icon={<Underline className="h-3.5 w-3.5" />}
            title="Underline"
          />
          <Sep />
          {(["left", "center", "right"] as const).map((a) => (
            <ToggleBtn
              key={a}
              on={tEl.align === a}
              onClick={() => updateElement(tEl.id, { align: a } as any)}
              icon={a === "left" ? <AlignLeft className="h-3.5 w-3.5" /> : a === "right" ? <AlignRight className="h-3.5 w-3.5" /> : <AlignCenter className="h-3.5 w-3.5" />}
              title={a}
            />
          ))}
          <Sep />
          {/* Text colour — uses the unique `Baseline` icon (a "T" with a
              coloured underline) so it never collides visually with the
              shape Fill colour or the Transparency popover. */}
          <ColorBtn
            label="Text colour"
            color={tEl.fill}
            onChange={(c) => updateElement(tEl.id, { fill: c } as any)}
            iconOverride={
              <Baseline className="h-3.5 w-3.5" style={{ color: tEl.fill }} />
            }
          />
          <Sep />
          {/* Letter / line spacing + text-case popover */}
          <TextSpacingPopover el={tEl} />
          <Sep />
        </>
      )}

      {/* SHAPE controls */}
      {sEl && selected.length === 1 && (
        <>
          <ColorBtn
            label="Fill"
            color={sEl.fill === "transparent" ? "#ffffff" : sEl.fill}
            onChange={(c) => updateElement(sEl.id, { fill: c } as any)}
          />
          <button
            onClick={() => updateElement(sEl.id, { fill: "transparent" } as any)}
            className="px-2 py-1 text-[10px] font-bold hover:bg-purple-100 rounded"
            title="No fill"
          >∅</button>
          <Sep />
          <ColorBtn
            label="Stroke"
            color={sEl.stroke === "transparent" ? "#7c3aed" : sEl.stroke}
            onChange={(c) => updateElement(sEl.id, { stroke: c, strokeWidth: sEl.strokeWidth || 2 } as any)}
            iconOverride={<Square className="h-3 w-3" style={{ color: sEl.stroke }} />}
          />
          {/* Stroke style (width + dash pattern) + corner rounding all in
              one popover so the toolbar stays compact. */}
          <StrokeStylePopover el={sEl} />
          <Sep />
        </>
      )}

      {/* LINE / ARROW / TRIANGLE controls — these are all `type: "line"`
          (triangle is a closed polyline). They use stroke-only paint, so we
          show a single colour swatch driving `stroke` plus the existing
          stroke-style popover (width + dash). */}
      {lEl && selected.length === 1 && (
        <>
          <ColorBtn
            label={lEl.arrow ? "Arrow colour" : "Stroke"}
            color={lEl.stroke === "transparent" ? "#0f172a" : lEl.stroke}
            onChange={(c) => updateElement(lEl.id, { stroke: c, strokeWidth: lEl.strokeWidth || 2 } as any)}
            iconOverride={<Square className="h-3 w-3" style={{ color: lEl.stroke }} />}
          />
          <StrokeStylePopover el={lEl as unknown as RectElement} />
          <Sep />
        </>
      )}

      {/* ICON controls — single colour swatch drives the `color` field;
          IconNode re-rasterises the SVG when colour changes. */}
      {icEl && selected.length === 1 && (
        <>
          <ColorBtn
            label="Icon colour"
            color={icEl.color}
            onChange={(c) => updateElement(icEl.id, { color: c } as any)}
          />
          <Sep />
        </>
      )}

      {/* IMAGE controls */}
      {iEl && selected.length === 1 && (
        <>
          <button
            onClick={() => setSidebarTab("tools")}
            className="flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-fuchsia-100 to-amber-100 text-purple-900 hover:from-fuchsia-200 hover:to-amber-200 rounded text-xs font-semibold border border-purple-200"
            title="Open AI Tools (BG Remove, Enhance) in the side panel"
            data-testid="btn-open-tools"
          >
            <Wrench className="h-3.5 w-3.5" />
            Tools
          </button>
          <Sep />
          <button
            onClick={() => setCropMode(iEl.id)}
            className="flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-800 hover:bg-purple-100 rounded text-xs font-semibold"
            title="Crop image (drag any edge or corner)"
            data-testid="btn-crop"
          >
            <CropIcon className="h-3.5 w-3.5" /> Crop
          </button>
          {/* Eraser — paint-to-erase image pixels. Opens the focused
              EraseOverlay; the toolbar swaps to a brush-size + Done /
              Cancel bar while the user paints. */}
          <button
            onClick={() => setEraseMode(iEl.id)}
            className="flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-800 hover:bg-purple-100 rounded text-xs font-semibold"
            title="Eraser — paint over the image to remove pixels"
            data-testid="btn-eraser"
          >
            <Eraser className="h-3.5 w-3.5" /> Eraser
          </button>
          {/* Stroke (image outline) + corner rounding. Single popover
              keeps the bar compact; both fields reuse existing
              ImageElement props (imageOutline, cornerRadius). */}
          <ImageStrokeRadiusPopover el={iEl} />
          {/* Filter dropdown ("Adjust") and Effects (drop-shadow) are
              now exclusively hosted inside the Tools side-panel — they
              were removed from this floating bar to avoid duplicate UI
              and keep the contextual toolbar focused on the most
              frequent style edits. */}
          <Sep />
        </>
      )}

      {/* Opacity slider — applies to every element type. Uses the
          unique `Blend` icon (overlapping circles) so it is no longer
          confused with the Droplet still used for shape Fill. */}
      {selected.length === 1 && (
        <>
          <OpacityPopover el={focal} />
          <Sep />
        </>
      )}

      {/* Animate — picks animation preset and previews live on the canvas */}
      {selected.length === 1 && (
        <>
          <AnimatePopover el={focal} />
          <Sep />
        </>
      )}

      {/* Position (align-to-page shortcuts). Distinct from the
          Size & Position popover (exact pixel inputs) — this one is
          one-click alignment, very common in Canva-style workflows. */}
      {selected.length === 1 && (
        <>
          <PositionPopover el={focal} />
          <Sep />
        </>
      )}

      {/* Size & Position editor — exact pixel inputs */}
      {selected.length === 1 && (
        <>
          <SizePositionPopover el={focal} />
          <Sep />
        </>
      )}

      {/* Format-painter — Pipette copies the focal element's styling
          props into the store, Brush pastes them onto the current
          selection. Brush is only enabled when there is a copied
          style waiting to be applied. */}
      {selected.length === 1 && (
        <>
          <CopyStyleButtons focalId={focal.id} selectedIds={selectedIds} />
        </>
      )}

      {/* Lock / Group / Duplicate / Forward / Backward / Position /
          Delete are now hosted in the floating ElementActionBar that
          sits BELOW the selection (Canva-style). They were removed
          from this top toolbar so each action lives in exactly one
          place: this bar = formatting/style, the action bar =
          object lifecycle. */}
    </div>
  );
}

/** Slider popover for the element's overall opacity (0–100 %). Uses
 *  the unique `Blend` icon (overlapping circles) instead of the
 *  generic Droplet that already represents shape Fill — this
 *  eliminates the icon-collision the user reported. */
function OpacityPopover({ el }: { el: ElementData }) {
  const updateElement = useStudio((s) => s.commitUpdateElement);
  const pct = Math.round((el.opacity ?? 1) * 100);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="p-1.5 hover:bg-purple-100 rounded text-purple-800 inline-flex items-center gap-1"
          title="Transparency"
          data-testid="btn-opacity"
        >
          <Blend className="h-3.5 w-3.5" />
          <span className="text-[10px] font-bold tabular-nums">{pct}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end" side="bottom">
        <h4 className="text-sm font-bold text-purple-950 mb-2">Transparency</h4>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) =>
              updateElement(el.id, { opacity: +e.target.value / 100 } as Partial<ElementData>)
            }
            className="flex-1 accent-purple-600"
            data-testid="slider-opacity"
          />
          <span className="w-10 text-right text-sm font-semibold tabular-nums">{pct}%</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Drop-shadow / Effects popover removed from this toolbar in Phase 2.4 —
// the Effects panel now lives exclusively inside the Tools side-panel
// (see LeftSidebar → Tools tab). Removing the duplicate keeps each
// control rooted in exactly one place.

const ANIMATIONS = [
  { key: "none", label: "None" },
  { key: "fade", label: "Fade in" },
  { key: "slide-left", label: "Slide ←" },
  { key: "slide-right", label: "Slide →" },
  { key: "zoom", label: "Zoom" },
  { key: "pulse", label: "Pulse" },
  { key: "bounce", label: "Bounce" },
] as const;

/** Animation-preset picker. Saving an entry replays it on the canvas. */
function AnimatePopover({ el }: { el: ElementData }) {
  const playAnimation = useStudio((s) => s.playAnimation);
  const updateElement = useStudio((s) => s.commitUpdateElement);
  const current = el.animation ?? "none";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="px-2 py-1 hover:bg-purple-100 rounded text-purple-800 text-xs font-semibold inline-flex items-center gap-1"
          title="Animate"
          data-testid="btn-animate"
        >
          <Play className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Animate</span>
          {current !== "none" && current && (
            <span className="ml-0.5 inline-block w-1.5 h-1.5 rounded-full bg-fuchsia-500" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end" side="bottom">
        <h4 className="text-sm font-bold text-purple-950 mb-1">Animate</h4>
        <p className="text-[11px] text-purple-700 mb-3">
          Pick a preset to preview it on the canvas. Saved with the design.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {ANIMATIONS.map((a) => {
            const active = current === a.key;
            return (
              <button
                key={a.key}
                onClick={() => {
                  if (a.key === "none") {
                    updateElement(el.id, { animation: null } as Partial<ElementData>);
                  } else {
                    playAnimation(el.id, a.key as NonNullable<ElementData["animation"]>);
                  }
                }}
                className={`px-2 py-2 rounded text-xs font-semibold border transition-colors ${
                  active
                    ? "bg-purple-600 text-white border-purple-700"
                    : "bg-white border-purple-200 hover:bg-purple-50 text-purple-800"
                }`}
                data-testid={`anim-${a.key}`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
        {current && current !== "none" && (
          <button
            onClick={() => playAnimation(el.id, current as NonNullable<ElementData["animation"]>)}
            className="mt-3 w-full py-1.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-800 text-xs font-bold"
          >
            ▶ Play again
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// MoreMenu was hoisted into the new ElementActionBar (lifecycle bar
// below the selection). Removed from this top-toolbar to avoid
// duplicate UI.

function SliderRow({
  label,
  min,
  max,
  value,
  onChange,
  suffix,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold text-purple-700">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(+e.target.value)}
          className="flex-1 accent-purple-600"
        />
        <span className="w-12 text-right text-xs tabular-nums">
          {value}
          {suffix ?? ""}
        </span>
      </div>
    </label>
  );
}

function Sep() {
  return <span className="mx-0.5 h-5 w-px bg-purple-200" />;
}

/**
 * Popover with W × H × X × Y × Rotation inputs so users can dial in exact
 * pixel sizes for any selected element. Optional aspect-ratio lock keeps
 * width/height in sync when toggled.
 */
function SizePositionPopover({ el }: { el: ElementData }) {
  const updateElement = useStudio((s) => s.commitUpdateElement);
  const [lock, setLock] = useState(false);

  // Effective on-canvas dimensions take into account the element's scaleX/Y
  // so the inputs match what the user visually sees.
  const dispW = Math.round(el.width * (el.scaleX ?? 1));
  const dispH = Math.round(el.height * (el.scaleY ?? 1));

  const setW = (n: number) => {
    if (!supportsSize) return;
    const newW = Math.max(1, n);
    if (lock && dispH) {
      const ratio = newW / Math.max(1, dispW);
      const newH = Math.max(1, Math.round(dispH * ratio));
      updateElement(el.id, { width: newW, height: newH, scaleX: 1, scaleY: 1 } as Partial<ElementData>);
    } else {
      updateElement(el.id, { width: newW, scaleX: 1 } as Partial<ElementData>);
    }
  };
  const setH = (n: number) => {
    if (!supportsSize) return;
    const newH = Math.max(1, n);
    if (lock && dispW) {
      const ratio = newH / Math.max(1, dispH);
      const newW = Math.max(1, Math.round(dispW * ratio));
      updateElement(el.id, { width: newW, height: newH, scaleX: 1, scaleY: 1 } as Partial<ElementData>);
    } else {
      updateElement(el.id, { height: newH, scaleY: 1 } as Partial<ElementData>);
    }
  };

  // Lines/arrows are drawn from `points`, not width/height — the popover's
  // W/H inputs would not correspond to anything visible, so hide them.
  const supportsSize = el.type !== "line";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="p-1.5 hover:bg-purple-100 rounded text-purple-800"
          title="Size & position"
          data-testid="btn-size"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end" side="bottom">
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-purple-950">Size & position</h4>

          {supportsSize && (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <NumField
                  label="Width"
                  value={dispW}
                  onChange={setW}
                  testId="inp-width"
                />
                <button
                  type="button"
                  onClick={() => setLock((v) => !v)}
                  className={`mb-1 h-8 px-2 rounded text-xs font-bold ${
                    lock ? "bg-purple-200 text-purple-900" : "bg-purple-50 hover:bg-purple-100 text-purple-700"
                  }`}
                  title="Lock aspect ratio"
                  data-testid="btn-aspect-lock"
                >
                  {lock ? "🔒" : "🔓"}
                </button>
                <NumField
                  label="Height"
                  value={dispH}
                  onChange={setH}
                  testId="inp-height"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="X"
              value={Math.round(el.x)}
              onChange={(n) => updateElement(el.id, { x: n } as Partial<ElementData>)}
              testId="inp-x"
            />
            <NumField
              label="Y"
              value={Math.round(el.y)}
              onChange={(n) => updateElement(el.id, { y: n } as Partial<ElementData>)}
              testId="inp-y"
            />
          </div>

          <div className="flex items-center gap-2">
            <RotateCw className="h-3.5 w-3.5 text-purple-700 shrink-0" />
            <input
              type="range"
              min={-180}
              max={180}
              value={Math.round(el.rotation ?? 0)}
              onChange={(e) =>
                updateElement(el.id, { rotation: +e.target.value } as Partial<ElementData>)
              }
              className="flex-1 accent-purple-600"
            />
            <input
              type="number"
              min={-180}
              max={180}
              value={Math.round(el.rotation ?? 0)}
              onChange={(e) =>
                updateElement(el.id, { rotation: +e.target.value || 0 } as Partial<ElementData>)
              }
              className="w-14 border border-purple-200 rounded px-1 py-1 text-xs text-right tabular-nums"
              data-testid="inp-rotation"
            />
            <span className="text-[10px] text-purple-600">°</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Scrubbable number input — drag the label horizontally with mouse or
 * finger to change the value (Figma / Photoshop style). Standard typing
 * still works in the inline `<input>`. Uses pointer events so a single
 * implementation covers desktop, tablet, and mobile.
 */
function NumField({
  label,
  value,
  onChange,
  testId,
  min = 1,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  testId?: string;
  min?: number;
  step?: number;
}) {
  const dragRef = useRef<{ startX: number; startVal: number; pid: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    // Allow normal text-selection inside the <input>; only the label scrubs.
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startVal: value, pid: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!dragRef.current || dragRef.current.pid !== e.pointerId) return;
    const dx = e.clientX - dragRef.current.startX;
    // Hold Shift for fine (0.25×) control, default 1px = `step` units.
    const sensitivity = e.shiftKey ? 0.25 : 1;
    const next = Math.max(min, Math.round(dragRef.current.startVal + dx * step * sensitivity));
    if (next !== value) onChange(next);
  };
  const endDrag = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (dragRef.current?.pid === e.pointerId) {
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      dragRef.current = null;
    }
  };

  return (
    <label className="block">
      <span
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-700 cursor-ew-resize select-none touch-none px-1 py-0.5 rounded hover:bg-purple-100 active:bg-purple-200"
        title="Drag left/right to change. Hold Shift for fine control."
        data-testid={testId ? `${testId}-scrub` : undefined}
      >
        ⇄ {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(+e.target.value || 0)}
        inputMode="numeric"
        className="mt-1 w-full border border-purple-200 rounded px-2 py-1 text-sm font-normal tabular-nums"
        data-testid={testId}
      />
    </label>
  );
}

function ToggleBtn({ on, onClick, icon, title }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string }) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 rounded ${on ? "bg-purple-200 text-purple-900" : "hover:bg-purple-100 text-purple-800"}`}
      title={title}
    >
      {icon}
    </button>
  );
}

function ColorBtn({ label, color, onChange, iconOverride }: { label: string; color: string; onChange: (c: string) => void; iconOverride?: React.ReactNode }) {
  return (
    <label className="relative cursor-pointer flex items-center gap-1 px-1.5 py-1 hover:bg-purple-100 rounded" title={label}>
      {iconOverride ?? <Droplet className="h-3.5 w-3.5" style={{ color }} />}
      <span className="block h-3.5 w-3.5 rounded ring-1 ring-purple-300" style={{ background: color }} />
      <input
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
    </label>
  );
}

// ────────────────────────────────────────────────────────────────────
// Phase 2.4 — new popovers
// ────────────────────────────────────────────────────────────────────

/** Stroke style + width + corner-rounding (rect only) all in one
 *  popover. Lives behind the `Spline` icon next to the stroke colour
 *  swatch. Keeps the toolbar compact while exposing every shape-stroke
 *  control the user might want.
 *
 *  Dash patterns are stored as a Konva-compatible `number[]` on the
 *  element itself (already in `types.ts`). `null` / `undefined` /
 *  empty array all mean "solid". */
const STROKE_STYLES: { key: "solid" | "dashed" | "dotted"; label: string; dash: number[] | null }[] = [
  { key: "solid", label: "Solid", dash: null },
  { key: "dashed", label: "Dashed", dash: [10, 6] },
  { key: "dotted", label: "Dotted", dash: [2, 4] },
];
function dashKey(dash: number[] | null | undefined): "solid" | "dashed" | "dotted" {
  if (!dash || dash.length === 0) return "solid";
  // Heuristic: short first segment (≤3) → dotted, else dashed.
  return dash[0] <= 3 ? "dotted" : "dashed";
}

function StrokeStylePopover({ el }: { el: RectElement | CircleElement }) {
  const updateElement = useStudio((s) => s.commitUpdateElement);
  const current = dashKey(el.dash);
  const supportsRadius = el.type === "rect";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="p-1.5 hover:bg-purple-100 rounded text-purple-800 inline-flex items-center gap-1"
          title="Stroke style & corner rounding"
          data-testid="btn-stroke-style"
        >
          <Spline className="h-3.5 w-3.5" />
          <span className="text-[10px] font-bold tabular-nums">{el.strokeWidth}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end" side="bottom">
        <h4 className="text-sm font-bold text-purple-950 mb-3">Stroke & corners</h4>

        {/* Width */}
        <div className="mb-3">
          <span className="text-[10px] font-semibold text-purple-700">Stroke width</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={40}
              value={el.strokeWidth ?? 0}
              onChange={(e) => updateElement(el.id, { strokeWidth: +e.target.value } as Partial<ElementData>)}
              className="flex-1 accent-purple-600"
              data-testid="slider-stroke-width"
            />
            <span className="w-10 text-right text-xs tabular-nums">{el.strokeWidth ?? 0}px</span>
          </div>
        </div>

        {/* Dash style — visual previews so the choice is obvious */}
        <div className="mb-3">
          <span className="text-[10px] font-semibold text-purple-700">Style</span>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {STROKE_STYLES.map((s) => {
              const active = current === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => updateElement(el.id, { dash: s.dash } as Partial<ElementData>)}
                  className={`px-2 py-2 rounded border text-[10px] font-bold ${
                    active
                      ? "bg-purple-600 text-white border-purple-700"
                      : "bg-white border-purple-200 hover:bg-purple-50 text-purple-800"
                  }`}
                  data-testid={`stroke-style-${s.key}`}
                  title={s.label}
                >
                  <svg viewBox="0 0 60 12" className="w-full h-3 mb-1">
                    <line
                      x1="2" y1="6" x2="58" y2="6"
                      stroke={active ? "#fff" : "#7c3aed"}
                      strokeWidth="2"
                      strokeDasharray={s.dash ? s.dash.join(" ") : undefined}
                      strokeLinecap="round"
                    />
                  </svg>
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Corner rounding (rect only) */}
        {supportsRadius && (
          <div>
            <span className="text-[10px] font-semibold text-purple-700 inline-flex items-center gap-1">
              <Frame className="h-3 w-3" /> Corner radius
            </span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={120}
                value={(el as RectElement).cornerRadius ?? 0}
                onChange={(e) => updateElement(el.id, { cornerRadius: +e.target.value } as Partial<ElementData>)}
                className="flex-1 accent-purple-600"
                data-testid="slider-corner-radius"
              />
              <span className="w-10 text-right text-xs tabular-nums">
                {(el as RectElement).cornerRadius ?? 0}px
              </span>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** IMAGE-variant of stroke style + corner rounding. Backed by the
 *  existing `imageOutline` field (Konva's image stroke is enabled
 *  inside `applyImageEffects` whenever `imageShadowPreset === "outline"`)
 *  and `cornerRadius` (rendered via clipFunc on the image's wrapping
 *  Group inside ImageNode). Both fields already exist on the
 *  ImageElement type — this popover is the user-facing surface.
 *
 *  Toggling "Outline" off via the slider going to 0 also flips
 *  imageShadowPreset back to null so the underlying Konva stroke is
 *  cleanly disabled (otherwise a 0-px stroke would still render the
 *  preset). Same on-going edits to the colour swatch keep the
 *  preset = "outline" so the user sees their colour applied. */
function ImageStrokeRadiusPopover({ el }: { el: ImageElement }) {
  const updateElement = useStudio((s) => s.commitUpdateElement);
  const outline = el.imageOutline ?? null;
  const outlineWidth = outline?.width ?? 0;
  const outlineColor = outline?.color ?? "#1f0a3c";
  const cornerR = el.cornerRadius ?? 0;
  // Remember whatever non-"outline" shadow preset the user had so we
  // can restore it when they slide outline width back to 0. Without
  // this, switching outline on then off would silently destroy their
  // previously chosen drop / glow / page-lift shadow.
  const prevPresetRef = useRef<ImageElement["imageShadowPreset"]>(
    el.imageShadowPreset === "outline" ? null : el.imageShadowPreset ?? null,
  );
  useEffect(() => {
    if (el.imageShadowPreset && el.imageShadowPreset !== "outline") {
      prevPresetRef.current = el.imageShadowPreset;
    }
  }, [el.imageShadowPreset]);

  const setOutlineWidth = (w: number) => {
    if (w <= 0) {
      // Restore the user's prior shadow preset (if any) instead of
      // forcing it to null — they should not lose their drop / glow
      // pick just because they toggled outline.
      updateElement(el.id, {
        imageOutline: null,
        imageShadowPreset:
          el.imageShadowPreset === "outline"
            ? prevPresetRef.current ?? null
            : el.imageShadowPreset,
      } as Partial<ElementData>);
    } else {
      updateElement(el.id, {
        imageOutline: { color: outlineColor, width: w },
        imageShadowPreset: "outline",
      } as Partial<ElementData>);
    }
  };
  const setOutlineColor = (c: string) => {
    updateElement(el.id, {
      imageOutline: { color: c, width: Math.max(1, outlineWidth) },
      imageShadowPreset: "outline",
    } as Partial<ElementData>);
  };
  const setCornerR = (r: number) =>
    updateElement(el.id, { cornerRadius: r } as Partial<ElementData>);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="p-1.5 hover:bg-purple-100 rounded text-purple-800 inline-flex items-center gap-1"
          title="Image outline & corner rounding"
          data-testid="btn-image-stroke-radius"
        >
          <Spline className="h-3.5 w-3.5" />
          <span className="text-[10px] font-bold tabular-nums">
            {cornerR > 0 ? `r${cornerR}` : outlineWidth}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end" side="bottom">
        <h4 className="text-sm font-bold text-purple-950 mb-3">
          Outline & corners
        </h4>

        {/* Outline width */}
        <div className="mb-3">
          <span className="text-[10px] font-semibold text-purple-700">
            Outline width
          </span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={40}
              value={outlineWidth}
              onChange={(e) => setOutlineWidth(+e.target.value)}
              className="flex-1 accent-purple-600"
              data-testid="slider-image-outline-width"
            />
            <span className="w-10 text-right text-xs tabular-nums">
              {outlineWidth}px
            </span>
          </div>
        </div>

        {/* Outline colour — only shown when there's an outline to colour */}
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[10px] font-semibold text-purple-700">
            Outline colour
          </span>
          <input
            type="color"
            value={outlineColor}
            onChange={(e) => setOutlineColor(e.target.value)}
            disabled={outlineWidth <= 0}
            className="h-7 w-10 rounded border border-purple-200 disabled:opacity-40"
            data-testid="picker-image-outline-color"
          />
          <span className="text-[10px] text-purple-600 font-mono">
            {outlineColor}
          </span>
        </div>

        {/* Corner radius */}
        <div>
          <span className="text-[10px] font-semibold text-purple-700 inline-flex items-center gap-1">
            <Frame className="h-3 w-3" /> Corner radius
          </span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={Math.round(Math.min(el.width, el.height) / 2)}
              value={cornerR}
              onChange={(e) => setCornerR(+e.target.value)}
              className="flex-1 accent-purple-600"
              data-testid="slider-image-corner-radius"
            />
            <span className="w-10 text-right text-xs tabular-nums">
              {cornerR}px
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Align-to-page popover. Six one-click buttons (left/centre-h/right
 *  + top/middle-v/bottom) snap the selected element against the
 *  current page rectangle. Effective on-canvas dimensions take into
 *  account scaleX / scaleY so the alignment matches what the user
 *  sees, not the raw width/height fields. */
function PositionPopover({ el }: { el: ElementData }) {
  const updateElement = useStudio((s) => s.commitUpdateElement);
  const page = useActivePage();

  const eff = (() => {
    const w = el.width * (el.scaleX ?? 1);
    const h = el.height * (el.scaleY ?? 1);
    return { w, h };
  })();

  const setX = (x: number) => updateElement(el.id, { x } as Partial<ElementData>);
  const setY = (y: number) => updateElement(el.id, { y } as Partial<ElementData>);

  const pageW = page?.width ?? 0;
  const pageH = page?.height ?? 0;

  const actions = [
    { id: "left", title: "Align left", icon: <AlignHorizontalJustifyStart className="h-4 w-4" />, do: () => setX(0) },
    { id: "center-h", title: "Align centre (horizontal)", icon: <AlignHorizontalJustifyCenter className="h-4 w-4" />, do: () => setX(Math.round((pageW - eff.w) / 2)) },
    { id: "right", title: "Align right", icon: <AlignHorizontalJustifyEnd className="h-4 w-4" />, do: () => setX(Math.round(pageW - eff.w)) },
    { id: "top", title: "Align top", icon: <AlignVerticalJustifyStart className="h-4 w-4" />, do: () => setY(0) },
    { id: "middle-v", title: "Align middle (vertical)", icon: <AlignVerticalJustifyCenter className="h-4 w-4" />, do: () => setY(Math.round((pageH - eff.h) / 2)) },
    { id: "bottom", title: "Align bottom", icon: <AlignVerticalJustifyEnd className="h-4 w-4" />, do: () => setY(Math.round(pageH - eff.h)) },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="p-1.5 hover:bg-purple-100 rounded text-purple-800 inline-flex items-center gap-1"
          title="Position (align to page)"
          data-testid="btn-position"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span className="text-[10px] font-semibold hidden sm:inline">Pos</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end" side="bottom">
        <h4 className="text-sm font-bold text-purple-950 mb-2">Align to page</h4>
        <div className="grid grid-cols-3 gap-2">
          {actions.map((a) => (
            <button
              key={a.id}
              onClick={a.do}
              title={a.title}
              data-testid={`pos-${a.id}`}
              className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded border border-purple-200 hover:bg-purple-50 text-purple-800"
            >
              {a.icon}
              <span className="text-[9px] font-semibold capitalize">{a.id.replace("-h", "").replace("-v", "")}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-purple-600">
          Snaps the selection against the {pageW}×{pageH}px page.
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** Letter-spacing, line-spacing, text-case popover for text elements.
 *  Bundled into one trigger so the toolbar stays compact. */
function TextSpacingPopover({ el }: { el: TextElement }) {
  const updateElement = useStudio((s) => s.commitUpdateElement);
  const cases: { key: NonNullable<TextElement["textCase"]>; label: string }[] = [
    { key: "none", label: "Aa" },
    { key: "upper", label: "AA" },
    { key: "lower", label: "aa" },
    { key: "title", label: "Aa…" },
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="p-1.5 hover:bg-purple-100 rounded text-purple-800 inline-flex items-center gap-1"
          title="Letter & line spacing"
          data-testid="btn-text-spacing"
        >
          <LetterText className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end" side="bottom">
        <h4 className="text-sm font-bold text-purple-950 mb-3">Spacing & case</h4>

        {/* Letter spacing — Konva measures in pixels (px between chars).
            Range -5..40 covers everything from condensed to widely-tracked. */}
        <SliderRow
          label="Letter spacing"
          min={-5}
          max={40}
          value={Math.round(el.letterSpacing ?? 0)}
          onChange={(n) => updateElement(el.id, { letterSpacing: n } as Partial<ElementData>)}
          suffix="px"
        />

        {/* Line height — multiplier of fontSize (Konva convention).
            Range 0.6..3.0 in 0.05 steps covers tight headings to airy
            body copy. We multiply / divide by 100 to keep the slider
            integer-friendly. */}
        <div className="mt-2">
          <span className="text-[10px] font-semibold text-purple-700">Line spacing</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={60}
              max={300}
              step={5}
              value={Math.round((el.lineHeight ?? 1.2) * 100)}
              onChange={(e) => updateElement(el.id, { lineHeight: +e.target.value / 100 } as Partial<ElementData>)}
              className="flex-1 accent-purple-600"
              data-testid="slider-line-height"
            />
            <span className="w-12 text-right text-xs tabular-nums">
              {((el.lineHeight ?? 1.2)).toFixed(2)}×
            </span>
          </div>
        </div>

        {/* Text-anchor / case — controls how the text inside the box is
            cased. The "anchor" terminology comes from text-box anchor
            settings in design tools; we expose the four standard cases
            here (none / upper / lower / title). */}
        <div className="mt-3">
          <span className="text-[10px] font-semibold text-purple-700">Text anchor / case</span>
          <div className="grid grid-cols-4 gap-1 mt-1">
            {cases.map((c) => {
              const active = (el.textCase ?? "none") === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => updateElement(el.id, { textCase: c.key } as Partial<ElementData>)}
                  className={`px-2 py-1.5 rounded border text-xs font-bold ${
                    active
                      ? "bg-purple-600 text-white border-purple-700"
                      : "bg-white border-purple-200 hover:bg-purple-50 text-purple-800"
                  }`}
                  title={c.key}
                  data-testid={`text-case-${c.key}`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Format-painter trigger pair. Pipette captures style from the
 *  focal element into the store; Brush applies it to the current
 *  selection. The Brush is disabled (and visually muted) until a
 *  copy has occurred. After paste the clipboard is cleared so the
 *  next copy is unambiguous (one-shot model — same as Word/Sheets). */
function CopyStyleButtons({ focalId, selectedIds }: { focalId: string; selectedIds: string[] }) {
  const copiedStyle = useStudio((s) => s.copiedStyle);
  const copyStyleFrom = useStudio((s) => s.copyStyleFrom);
  const applyCopiedStyleTo = useStudio((s) => s.applyCopiedStyleTo);
  const clearCopiedStyle = useStudio((s) => s.clearCopiedStyle);
  const armed = !!copiedStyle;

  return (
    <>
      <button
        onClick={() => copyStyleFrom(focalId)}
        className={`p-1.5 rounded inline-flex items-center gap-1 ${
          armed
            ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
            : "hover:bg-purple-100 text-purple-800"
        }`}
        title={armed ? "Style copied — Brush to paste, or click again to overwrite" : "Copy style"}
        data-testid="btn-copy-style"
      >
        <Pipette className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => {
          if (!armed) return;
          applyCopiedStyleTo(selectedIds);
          clearCopiedStyle();
        }}
        disabled={!armed}
        className={`p-1.5 rounded inline-flex items-center gap-1 ${
          armed
            ? "text-purple-800 hover:bg-purple-100"
            : "text-purple-300 cursor-not-allowed"
        }`}
        title={armed ? "Paste style onto current selection" : "Copy a style first"}
        data-testid="btn-paste-style"
      >
        <Brush className="h-3.5 w-3.5" />
      </button>
    </>
  );
}
