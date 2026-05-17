/**
 * Interactive erase overlay rendered when the studio is in erase mode
 * for an image element. Lets the user paint with a circular brush over
 * the image to mark pixels for erasure. The painted area is shown as a
 * semi-transparent purple overlay so the user can SEE what they're
 * about to remove. On commit, the offscreen mask canvas is exported as
 * a data-URL and stored on `el.eraseMask`; ImageNode then renders it
 * as a destination-out overlay so the marked pixels become transparent.
 *
 * Coordinates: pointer positions arrive in design-units (the parent
 * page Group is in design-coords). We translate them into the image's
 * LOCAL coords (subtract el.x/y) and then into NATURAL-pixel coords
 * (the mask canvas is sized to the natural image so it lines up
 * pixel-for-pixel when applied via destination-out).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Image as KImage, Rect } from "react-konva";
import useImage from "use-image";
import Konva from "konva";
import type { ImageElement } from "../types";
import { useStudio } from "../store";

interface Props {
  el: ImageElement;
  zoom: number;
}

/** Window-level handle the toolbar's Done button calls to commit the
 *  pending eraseMask. Mirrors the crop bridge — call → returns the
 *  patch (or null) so the same commit path works from Done, Cancel
 *  reset, and stage-bg auto-commit. */
declare global {
  interface Window {
    __primeStudioEraseCommit?: () => Partial<ImageElement> | null;
    __primeStudioEraseClear?: () => void;
  }
}

export function EraseOverlay({ el, zoom }: Props) {
  const [img] = useImage(el.src, "anonymous");
  const eraseBrushSize = useStudio((s) => s.eraseBrushSize);

  // ── Offscreen mask canvas ────────────────────────────────────────
  // Sized to the natural image. Drawing into it with full-alpha black
  // marks pixels for removal. We expose this canvas as a Konva image
  // overlay so the user sees their strokes painted on top of the
  // image (rendered in semi-transparent purple).
  const maskCanvas = useMemo(() => {
    if (!img) return null;
    const W = (img as HTMLImageElement).naturalWidth || img.width;
    const H = (img as HTMLImageElement).naturalHeight || img.height;
    const c = document.createElement("canvas");
    c.width = Math.max(1, W);
    c.height = Math.max(1, H);
    return c;
  }, [img]);

  // Konva needs a separate VISIBLE canvas for the purple "what you've
  // painted" preview overlay. We keep two canvases in sync (real mask
  // = opaque black; preview = semi-transparent purple) so the export
  // is clean black-on-transparent while the on-screen feedback is
  // clearly visible against the image colours below.
  const previewCanvas = useMemo(() => {
    if (!img) return null;
    const W = (img as HTMLImageElement).naturalWidth || img.width;
    const H = (img as HTMLImageElement).naturalHeight || img.height;
    const c = document.createElement("canvas");
    c.width = Math.max(1, W);
    c.height = Math.max(1, H);
    return c;
  }, [img]);

  // Bump this counter to force Konva to re-render the preview overlay
  // every paint stroke (Konva caches the image — toggling its `image`
  // prop won't invalidate without a state nudge).
  const [previewTick, setPreviewTick] = useState(0);

  // Seed the mask + preview from any pre-existing eraseMask so the
  // user can resume erasing from where they left off last session.
  useEffect(() => {
    if (!maskCanvas || !previewCanvas) return;
    if (!el.eraseMask) return;
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      const mctx = maskCanvas.getContext("2d");
      const pctx = previewCanvas.getContext("2d");
      if (!mctx || !pctx) return;
      mctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      mctx.drawImage(im, 0, 0, maskCanvas.width, maskCanvas.height);
      // Repaint preview as purple-tinted version of the mask.
      pctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      pctx.drawImage(im, 0, 0, previewCanvas.width, previewCanvas.height);
      pctx.globalCompositeOperation = "source-in";
      pctx.fillStyle = "rgba(124, 58, 237, 0.55)";
      pctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
      pctx.globalCompositeOperation = "source-over";
      setPreviewTick((t) => t + 1);
    };
    im.src = el.eraseMask;
    // Only seed once per element id — repeated re-runs on every paint
    // would clobber the user's in-progress strokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.id, maskCanvas, previewCanvas]);

  // Convert design-coords pointer → natural-image-pixel coords.
  // Account for the image's cropBox so erasing lines up with the
  // displayed sub-rectangle (Konva.Image with crop stretches the
  // sub-rect to fill width × height).
  const designToNatural = (lx: number, ly: number) => {
    if (!img) return { x: 0, y: 0 };
    const W = (img as HTMLImageElement).naturalWidth || img.width;
    const H = (img as HTMLImageElement).naturalHeight || img.height;
    const crop = el.cropBox ?? { x: 0, y: 0, width: W, height: H };
    const naturalX = crop.x + (lx / el.width) * crop.width;
    const naturalY = crop.y + (ly / el.height) * crop.height;
    return { x: naturalX, y: naturalY };
  };

  // Paint a circular brush stamp at design-coords (lx, ly). We stamp
  // both canvases — opaque black in the export mask, translucent
  // purple in the preview — so the two stay in lockstep.
  const stamp = (lx: number, ly: number) => {
    if (!maskCanvas || !previewCanvas || !img) return;
    const { x, y } = designToNatural(lx, ly);
    if (!isFinite(x) || !isFinite(y)) return;
    // Brush radius in NATURAL pixels: convert from design units using
    // the same crop-aware scale as the coord transform. This keeps the
    // brush visually constant regardless of zoom or crop.
    const W = (img as HTMLImageElement).naturalWidth || img.width;
    const crop = el.cropBox ?? { x: 0, y: 0, width: W, height: maskCanvas.height };
    const naturalPerDesign = crop.width / el.width;
    const r = (eraseBrushSize / 2) * naturalPerDesign;

    const mctx = maskCanvas.getContext("2d");
    const pctx = previewCanvas.getContext("2d");
    if (!mctx || !pctx) return;
    mctx.fillStyle = "#000";
    mctx.beginPath();
    mctx.arc(x, y, r, 0, Math.PI * 2);
    mctx.fill();

    pctx.fillStyle = "rgba(124, 58, 237, 0.55)";
    pctx.beginPath();
    pctx.arc(x, y, r, 0, Math.PI * 2);
    pctx.fill();
    setPreviewTick((t) => t + 1);
  };

  // Continuous-paint helper: draw a thick line between two natural
  // points so quick mouse moves don't leave gaps between stamps.
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const stampLine = (lx: number, ly: number) => {
    if (!maskCanvas || !previewCanvas || !img) return;
    const { x: nx, y: ny } = designToNatural(lx, ly);
    const last = lastPt.current;
    lastPt.current = { x: nx, y: ny };
    if (!last) {
      stamp(lx, ly);
      return;
    }
    const W = (img as HTMLImageElement).naturalWidth || img.width;
    const crop = el.cropBox ?? { x: 0, y: 0, width: W, height: maskCanvas.height };
    const naturalPerDesign = crop.width / el.width;
    const r = (eraseBrushSize / 2) * naturalPerDesign;

    const mctx = maskCanvas.getContext("2d");
    const pctx = previewCanvas.getContext("2d");
    if (!mctx || !pctx) return;
    mctx.strokeStyle = "#000";
    mctx.lineWidth = r * 2;
    mctx.lineCap = "round";
    mctx.beginPath();
    mctx.moveTo(last.x, last.y);
    mctx.lineTo(nx, ny);
    mctx.stroke();

    pctx.strokeStyle = "rgba(124, 58, 237, 0.55)";
    pctx.lineWidth = r * 2;
    pctx.lineCap = "round";
    pctx.beginPath();
    pctx.moveTo(last.x, last.y);
    pctx.lineTo(nx, ny);
    pctx.stroke();
    setPreviewTick((t) => t + 1);
  };

  // ── Pointer interaction on the canvas-cover Rect ──────────────────
  const painting = useRef(false);
  const onDown = (ev: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    ev.cancelBubble = true;
    painting.current = true;
    lastPt.current = null;
    // Group containing this Rect is in design-coords already because
    // its parent page Group has scale=1; getRelativePointerPosition()
    // gives us local coords inside that Group.
    const group = ev.target.getParent();
    const p = group?.getRelativePointerPosition();
    if (!p) return;
    // Subtract el.x/y so we're in the IMAGE's local space.
    stampLine(p.x - el.x, p.y - el.y);
  };
  const onMove = (ev: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!painting.current) return;
    ev.cancelBubble = true;
    const group = ev.target.getParent();
    const p = group?.getRelativePointerPosition();
    if (!p) return;
    stampLine(p.x - el.x, p.y - el.y);
  };
  const onUp = () => {
    painting.current = false;
    lastPt.current = null;
  };

  // Publish the commit + clear bridges for the toolbar.
  useEffect(() => {
    window.__primeStudioEraseCommit = () => {
      if (!maskCanvas) return null;
      // Detect whether ANY pixel was painted — if not, return a
      // patch that nulls out eraseMask so a quick in/out doesn't
      // wipe a prior mask but explicitly clears one if user erased
      // and then chose to commit empty.
      try {
        const dataUrl = maskCanvas.toDataURL("image/png");
        return { eraseMask: dataUrl };
      } catch {
        return null;
      }
    };
    window.__primeStudioEraseClear = () => {
      if (!maskCanvas || !previewCanvas) return;
      const mctx = maskCanvas.getContext("2d");
      const pctx = previewCanvas.getContext("2d");
      mctx?.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      pctx?.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      setPreviewTick((t) => t + 1);
    };
    return () => {
      delete window.__primeStudioEraseCommit;
      delete window.__primeStudioEraseClear;
    };
  }, [maskCanvas, previewCanvas]);

  // Track pointer in stage-coords for the brush-circle preview.
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const onHover = (ev: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const group = ev.target.getParent();
    const p = group?.getRelativePointerPosition();
    if (!p) return;
    setHover({ x: p.x, y: p.y });
  };

  if (!img) return null;

  return (
    <Group listening>
      {/* The image, rendered upright at its display rect (we ignore
          rotation/flip during erase for clarity — the mask will still
          be applied correctly because it's stored in NATURAL pixel
          space, independent of display transform). */}
      <KImage
        image={img}
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        listening={false}
        {...(el.cropBox
          ? {
              cropX: el.cropBox.x,
              cropY: el.cropBox.y,
              cropWidth: el.cropBox.width,
              cropHeight: el.cropBox.height,
            }
          : {})}
      />
      {/* Purple paint preview — sits ON TOP so the user sees their
          strokes against the image colours below. */}
      {previewCanvas && (
        <KImage
          key={previewTick}
          image={previewCanvas}
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          listening={false}
          opacity={0.85}
        />
      )}
      {/* Pointer-capture rect that spans the image area. We extend it
          slightly outward (12px in each direction) so the user can
          start a stroke on / past the image edge — natural for an
          eraser brush. */}
      <Rect
        x={el.x - 12}
        y={el.y - 12}
        width={el.width + 24}
        height={el.height + 24}
        fill="rgba(0,0,0,0.001)"
        onMouseDown={onDown}
        onMouseMove={(ev) => { onMove(ev); onHover(ev); }}
        onMouseUp={onUp}
        onMouseEnter={(ev) => {
          const stage = ev.target.getStage();
          if (stage) stage.container().style.cursor = "none";
          onHover(ev);
        }}
        onMouseLeave={(ev) => {
          const stage = ev.target.getStage();
          if (stage) stage.container().style.cursor = "default";
          painting.current = false;
          setHover(null);
        }}
        onTouchStart={onDown}
        onTouchMove={(ev) => { onMove(ev); onHover(ev); }}
        onTouchEnd={onUp}
      />
      {/* Brush-size cursor circle so user sees the actual stamp size. */}
      {hover && (
        <>
          <Rect
            x={hover.x - eraseBrushSize / 2}
            y={hover.y - eraseBrushSize / 2}
            width={eraseBrushSize}
            height={eraseBrushSize}
            cornerRadius={eraseBrushSize / 2}
            stroke="#7c3aed"
            strokeWidth={2 / zoom}
            listening={false}
          />
          <Rect
            x={hover.x - eraseBrushSize / 2 - 1 / zoom}
            y={hover.y - eraseBrushSize / 2 - 1 / zoom}
            width={eraseBrushSize + 2 / zoom}
            height={eraseBrushSize + 2 / zoom}
            cornerRadius={(eraseBrushSize + 2 / zoom) / 2}
            stroke="#ffffff"
            strokeWidth={1 / zoom}
            listening={false}
          />
        </>
      )}
    </Group>
  );
}
