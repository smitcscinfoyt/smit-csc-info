/**
 * Interactive crop overlay rendered when the studio is in crop mode for
 * an image element. Shows the FULL natural image faded out with the
 * cropped portion brightly highlighted, plus 8 draggable handles
 * (4 corners + 4 edges) for resizing the crop window. The user can also
 * drag the centre to reposition the crop window.
 *
 * On commit, computes the new element geometry (x/y/width/height in
 * design coordinates) plus a new `cropBox` (in natural-image coordinates)
 * which Konva.Image consumes via its `crop` prop.
 *
 * Limitations (acceptable for MVP):
 *  - Ignores el.rotation and flipX/flipY for the overlay rendering — the
 *    overlay is drawn upright. The underlying flip/rotation is preserved
 *    on commit, just not previewed during the crop interaction.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Image as KImage, Rect } from "react-konva";
import useImage from "use-image";
import Konva from "konva";
import type { ImageElement, ElementData } from "../types";
import { useStudio } from "../store";

interface Props {
  el: ImageElement;
  zoom: number;
}

/** Window-level handle the toolbar's Done button calls to obtain the
 *  pending crop patch. We wire it up from inside CropOverlay because
 *  only the overlay knows the current crop window. The contract is:
 *  call it → returns the patch to pass into commitUpdateElement. */
declare global {
  interface Window {
    __primeStudioCropCommit?: () => Partial<ImageElement> | null;
  }
}

const MIN_SIZE = 20; // design-units minimum crop window dimension
/** Squared screen-pixel distance under which a pointer-down →
 *  pointer-up gesture counts as a "tap" (vs a real drag). 4px radius
 *  → 16. Squared comparison avoids a sqrt per gesture. */
const TAP_THRESHOLD_SQ = 16;

export function CropOverlay({ el, zoom }: Props) {
  const [img] = useImage(el.src, "anonymous");
  const commitUpdateElement = useStudio((s) => s.commitUpdateElement);
  const setCropMode = useStudio((s) => s.setCropMode);
  const setSelected = useStudio((s) => s.setSelected);

  /** Apply the current crop window to the element + exit crop mode +
   *  re-select the image so its toolbar/Transformer reappear. Mirrors
   *  the same flow the toolbar's Done button and Stage's bg-click use,
   *  so behaviour is identical no matter how the user commits. */
  const commitAndExit = () => {
    const fn = window.__primeStudioCropCommit;
    const patch = fn?.();
    if (patch) commitUpdateElement(el.id, patch as Partial<ElementData>);
    setCropMode(null);
    setSelected([el.id]);
  };

  /** Pointer-down screen position used by the drag-vs-tap classifier
   *  in the centre drag-rect. We keep this OUTSIDE the rect's local
   *  state so the same value is read in mousedown→mouseup pairs and
   *  in the dragstart→dragend path that suppresses the trailing tap. */
  const gestureStart = useRef<{ x: number; y: number } | null>(null);
  /** Belt-and-braces flag: even if the trailing pointer-up arrives
   *  with a sub-threshold delta (e.g. browser fired touchend BEFORE
   *  dragend, leaving gestureStart non-null), this flag — set on the
   *  very first dragstart of the gesture — guarantees we never
   *  commit-and-exit at the end of a real drag. Cleared at gesture end. */
  const didDrag = useRef(false);

  // Compute the full uncropped image rectangle in DESIGN coordinates,
  // and stash the natural-image dimensions for commit-time math.
  const dims = useMemo(() => {
    if (!img) return null;
    const W = (img as HTMLImageElement).naturalWidth || img.width;
    const H = (img as HTMLImageElement).naturalHeight || img.height;
    const crop = el.cropBox ?? { x: 0, y: 0, width: W, height: H };
    const sx = el.width / crop.width; // design units per natural pixel
    const sy = el.height / crop.height;
    const fullW = W * sx;
    const fullH = H * sy;
    const fullX = el.x - crop.x * sx;
    const fullY = el.y - crop.y * sy;
    return { W, H, fullX, fullY, fullW, fullH };
    // Element pose recomputes only when its geometry/crop actually changes.
  }, [img, el.cropBox?.x, el.cropBox?.y, el.cropBox?.width, el.cropBox?.height,
      el.width, el.height, el.x, el.y]);

  // Live crop window — initialised from the element's current display rect.
  const [win, setWin] = useState({ x: el.x, y: el.y, w: el.width, h: el.height });
  // Reset whenever a different element enters crop mode.
  useEffect(() => {
    setWin({ x: el.x, y: el.y, w: el.width, h: el.height });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.id]);

  // Publish a commit() function the toolbar's Done button can call to
  // obtain the patch for commitUpdateElement. We cleanup on unmount so a
  // stale closure can't be called after crop mode exits.
  useEffect(() => {
    if (!dims) return;
    window.__primeStudioCropCommit = () => {
      const naturalPerDesignX = dims.W / dims.fullW;
      const naturalPerDesignY = dims.H / dims.fullH;
      return {
        x: win.x,
        y: win.y,
        width: win.w,
        height: win.h,
        cropBox: {
          x: Math.max(0, (win.x - dims.fullX) * naturalPerDesignX),
          y: Math.max(0, (win.y - dims.fullY) * naturalPerDesignY),
          width: win.w * naturalPerDesignX,
          height: win.h * naturalPerDesignY,
        },
      };
    };
    return () => { delete window.__primeStudioCropCommit; };
  }, [win.x, win.y, win.w, win.h, dims?.fullX, dims?.fullY, dims?.fullW, dims?.fullH]);

  if (!img || !dims) return null;

  // Detect touch devices and grow handles so they're easy to grab with
  // a finger. 14px CSS-pixels works fine for mouse but is too small for
  // touch — bump to 22px on coarse pointers.
  const isCoarse = typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const handleSize = (isCoarse ? 22 : 14) / zoom;
  const lineW = 2 / zoom;

  // Clamp a proposed crop window to stay inside the full image bounds and
  // never collapse below MIN_SIZE.
  const clamp = (n: { x: number; y: number; w: number; h: number }) => {
    let { x, y, w, h } = n;
    if (x < dims.fullX) { w -= dims.fullX - x; x = dims.fullX; }
    if (y < dims.fullY) { h -= dims.fullY - y; y = dims.fullY; }
    if (x + w > dims.fullX + dims.fullW) w = dims.fullX + dims.fullW - x;
    if (y + h > dims.fullY + dims.fullH) h = dims.fullY + dims.fullH - y;
    if (w < MIN_SIZE) w = MIN_SIZE;
    if (h < MIN_SIZE) h = MIN_SIZE;
    return { x, y, w, h };
  };

  type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

  const handleAt = (edge: Edge, hx: number, hy: number) => {
    // Edge handles only move along their relevant axis.
    const lockX = edge === "n" || edge === "s";
    const lockY = edge === "e" || edge === "w";
    // Hit-area is ~2.4x the visible handle — much more forgiving on
    // touch. Visible handle stays small/clean.
    const hit = handleSize * 2.4;
    return (
      <Rect
        key={edge}
        x={hx - handleSize / 2}
        y={hy - handleSize / 2}
        width={handleSize}
        height={handleSize}
        fill="#ffd700"
        stroke="#7c3aed"
        strokeWidth={lineW}
        cornerRadius={2}
        draggable
        // Enlarge the touch hit-zone WITHOUT growing the visible handle
        // so the user has a fat finger-target while the UI stays clean.
        hitFunc={(ctx, shape) => {
          ctx.beginPath();
          ctx.rect(
            -(hit - handleSize) / 2,
            -(hit - handleSize) / 2,
            hit,
            hit,
          );
          ctx.closePath();
          ctx.fillStrokeShape(shape);
        }}
        // Cursor hint for desktop users.
        onMouseEnter={(ev) => {
          const stage = ev.target.getStage();
          if (stage) {
            const cursorMap: Record<Edge, string> = {
              n: "ns-resize", s: "ns-resize",
              e: "ew-resize", w: "ew-resize",
              ne: "nesw-resize", sw: "nesw-resize",
              nw: "nwse-resize", se: "nwse-resize",
            };
            stage.container().style.cursor = cursorMap[edge];
          }
        }}
        onMouseLeave={(ev) => {
          const stage = ev.target.getStage();
          if (stage) stage.container().style.cursor = "default";
        }}
        // Defense-in-depth: stop the very first pointer event from
        // bubbling to the Stage so even if `cropMode` gating is bypassed
        // by future refactors, the handle drag remains isolated.
        onMouseDown={(ev) => { ev.cancelBubble = true; }}
        onTouchStart={(ev) => { ev.cancelBubble = true; }}
        onDragStart={(ev) => { ev.cancelBubble = true; }}
        // NOTE: we deliberately do NOT use `dragBoundFunc` for axis-lock.
        // Konva's dragBoundFunc receives/returns ABSOLUTE stage pixel
        // coords, while our handles live inside a Layer that's scaled by
        // `zoom` and panned by `pan` — mixing units causes the handle to
        // teleport on the very first move (this was the source of the
        // "not smooth" bug). Instead we let Konva drag freely and apply
        // axis-lock + clamping inside onDragMove using the handle's local
        // position (`ev.target.x()/y()`), which is already in design
        // coords because the parent Group is in design coords.
        onDragMove={(ev: Konva.KonvaEventObject<DragEvent>) => {
          let px = ev.target.x() + handleSize / 2;
          let py = ev.target.y() + handleSize / 2;
          if (lockX) px = hx;
          if (lockY) py = hy;
          let nx = win.x, ny = win.y, nw = win.w, nh = win.h;
          if (edge.includes("w")) { nw = win.x + win.w - px; nx = px; }
          if (edge.includes("e")) { nw = px - win.x; }
          if (edge.includes("n")) { nh = win.y + win.h - py; ny = py; }
          if (edge.includes("s")) { nh = py - win.y; }
          const clamped = clamp({ x: nx, y: ny, w: nw, h: nh });
          setWin(clamped);
          // Re-pin the dragged handle to the (possibly clamped) edge so
          // it visually tracks the finger / cursor on the very same frame
          // even if React's re-render is one tick behind.
          let nhx = hx, nhy = hy;
          if (edge.includes("w")) nhx = clamped.x;
          if (edge.includes("e")) nhx = clamped.x + clamped.w;
          if (edge.includes("n")) nhy = clamped.y;
          if (edge.includes("s")) nhy = clamped.y + clamped.h;
          if (edge === "n" || edge === "s") nhx = clamped.x + clamped.w / 2;
          if (edge === "e" || edge === "w") nhy = clamped.y + clamped.h / 2;
          ev.target.x(nhx - handleSize / 2);
          ev.target.y(nhy - handleSize / 2);
        }}
        onDragEnd={(ev: Konva.KonvaEventObject<DragEvent>) => {
          // Final snap so the next render's authoritative position
          // (computed from `win`) doesn't visually pop.
          ev.target.x(hx - handleSize / 2);
          ev.target.y(hy - handleSize / 2);
        }}
      />
    );
  };

  const cx = win.x + win.w / 2;
  const cy = win.y + win.h / 2;

  return (
    <Group listening>
      {/* Faded full image — shows what's outside the crop frame */}
      <KImage
        image={img}
        x={dims.fullX}
        y={dims.fullY}
        width={dims.fullW}
        height={dims.fullH}
        opacity={0.32}
        listening={false}
      />
      {/* Bright crop window: clip the full image to the window rect */}
      <Group
        clipX={win.x}
        clipY={win.y}
        clipWidth={win.w}
        clipHeight={win.h}
        listening={false}
      >
        <KImage
          image={img}
          x={dims.fullX}
          y={dims.fullY}
          width={dims.fullW}
          height={dims.fullH}
          listening={false}
        />
      </Group>
      {/* Drag-the-window: a transparent rect that moves the whole crop.
          Also acts as a TAP-TO-COMMIT surface — a quick tap (no drag)
          inside the crop frame applies the current crop and exits crop
          mode, matching what the stage-background click already does
          and what the user requested (clicking on the photo applies the
          current crop). */}
      <Rect
        x={win.x}
        y={win.y}
        width={win.w}
        height={win.h}
        fill="rgba(0,0,0,0.001)"
        draggable
        onMouseEnter={(ev) => {
          const stage = ev.target.getStage();
          if (stage) stage.container().style.cursor = "move";
        }}
        onMouseLeave={(ev) => {
          const stage = ev.target.getStage();
          if (stage) stage.container().style.cursor = "default";
        }}
        // ── Drag-vs-tap discrimination ──────────────────────────────
        // We need to tell apart two intents on the SAME transparent
        // rect: (a) tap → commit + exit crop mode, (b) drag → reposition
        // the crop window. The previous "_wasDragged + setTimeout"
        // flag had race conditions on touch (tap can synthesise a
        // micro-drag on noisy fingers, dragend → click ordering varies
        // by browser). We replace it with a deterministic
        // movement-threshold: record pointer-down screen coords, and
        // only treat the gesture as a TAP if the cursor moved < 4px
        // by pointer-up. This matches Canva/Figma behaviour.
        onMouseDown={(ev) => {
          const stage = ev.target.getStage();
          const p = stage?.getPointerPosition();
          gestureStart.current = p ? { x: p.x, y: p.y } : null;
          didDrag.current = false;
        }}
        onTouchStart={(ev) => {
          const stage = ev.target.getStage();
          const p = stage?.getPointerPosition();
          gestureStart.current = p ? { x: p.x, y: p.y } : null;
          didDrag.current = false;
        }}
        onDragStart={() => { didDrag.current = true; }}
        onDragMove={(ev) => {
          didDrag.current = true;
          const nx = ev.target.x();
          const ny = ev.target.y();
          setWin(clamp({ x: nx, y: ny, w: win.w, h: win.h }));
        }}
        onDragEnd={(ev) => {
          // Snap node back; the next render places it via win.
          ev.target.x(win.x);
          ev.target.y(win.y);
          // A drag definitely moved — kill the gesture-start so the
          // trailing synthetic click does NOT commit.
          gestureStart.current = null;
        }}
        onMouseUp={(ev) => {
          const start = gestureStart.current;
          const wasDrag = didDrag.current;
          gestureStart.current = null;
          didDrag.current = false;
          if (wasDrag || !start) return;
          const stage = ev.target.getStage();
          const p = stage?.getPointerPosition();
          if (!p) return;
          const dx = p.x - start.x;
          const dy = p.y - start.y;
          if (dx * dx + dy * dy < TAP_THRESHOLD_SQ) commitAndExit();
        }}
        onTouchEnd={(ev) => {
          const start = gestureStart.current;
          const wasDrag = didDrag.current;
          gestureStart.current = null;
          didDrag.current = false;
          if (wasDrag || !start) return;
          const stage = ev.target.getStage();
          const p = stage?.getPointerPosition();
          if (!p) return;
          const dx = p.x - start.x;
          const dy = p.y - start.y;
          if (dx * dx + dy * dy < TAP_THRESHOLD_SQ) commitAndExit();
        }}
      />
      {/* Crop window border */}
      <Rect
        x={win.x}
        y={win.y}
        width={win.w}
        height={win.h}
        stroke="#7c3aed"
        strokeWidth={lineW * 1.5}
        dash={[6 / zoom, 4 / zoom]}
        listening={false}
      />
      {/* Rule-of-thirds guides */}
      {[1, 2].map((i) => (
        <Rect
          key={`v${i}`}
          x={win.x + (win.w * i) / 3 - lineW / 2}
          y={win.y}
          width={lineW}
          height={win.h}
          fill="rgba(124, 58, 237, 0.4)"
          listening={false}
        />
      ))}
      {[1, 2].map((i) => (
        <Rect
          key={`h${i}`}
          x={win.x}
          y={win.y + (win.h * i) / 3 - lineW / 2}
          width={win.w}
          height={lineW}
          fill="rgba(124, 58, 237, 0.4)"
          listening={false}
        />
      ))}
      {/* Handles last so they sit on top */}
      {handleAt("nw", win.x, win.y)}
      {handleAt("n", cx, win.y)}
      {handleAt("ne", win.x + win.w, win.y)}
      {handleAt("e", win.x + win.w, cy)}
      {handleAt("se", win.x + win.w, win.y + win.h)}
      {handleAt("s", cx, win.y + win.h)}
      {handleAt("sw", win.x, win.y + win.h)}
      {handleAt("w", win.x, cy)}
    </Group>
  );
}
