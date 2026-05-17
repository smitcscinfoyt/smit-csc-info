/**
 * Canva-style HTML rotate handle that floats to the RIGHT of the
 * selection bounding box. We disable Konva's built-in top-centre
 * rotate anchor in `Stage.tsx` so this is the single rotate UI.
 *
 * Why HTML instead of a Konva node?
 *  • Pointer events / cursor styling are easier in DOM.
 *  • No interference with marquee selection or transformer hit-test.
 *  • Multi-page rendering already mixes screen-space overlays with
 *    Konva — keeping the rotate handle in the same layer makes math
 *    consistent.
 *
 * Behaviour:
 *  • Visible only when exactly one element is selected (multi-select
 *    rotation is rare in Canva and usually done via a different path).
 *  • Position: union bbox of selected node, right edge + ~30 px gap,
 *    vertically centred.
 *  • On pointerdown captures the element centre + start angle; on
 *    pointermove we compute the angle delta and patch element.rotation
 *    every frame. Shift snaps to 15°. Commit (history) on pointerup.
 */

import { useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { useStudio } from "../store";

interface Props {
  containerRef: React.RefObject<HTMLDivElement>;
}

interface StageBridge {
  getStage: () => any | null;
  getNode: (id: string) => any | null;
}

function readBridge(): StageBridge | null {
  return (window as any).__primeStudioStageBridge ?? null;
}

export function RotateHandle({ containerRef }: Props) {
  const selectedIds = useStudio((s) => s.selectedIds);
  const cropMode = useStudio((s) => s.cropMode);
  const zoom = useStudio((s) => s.zoom);
  const pan = useStudio((s) => s.pan);
  const pages = useStudio((s) => s.pages);
  const updateElement = useStudio((s) => s.updateElement);
  const commit = useStudio((s) => s._commit);

  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef<{
    id: string;
    centerX: number;
    centerY: number;
    startAngle: number;
    startRotation: number;
  } | null>(null);

  // Resolve the (single) selected element across all pages.
  const focalId = selectedIds.length === 1 ? selectedIds[0] : null;
  const focal = focalId
    ? pages.flatMap((p) => p.elements).find((e) => e.id === focalId) ?? null
    : null;

  // ── Position polling ───────────────────────────────────────────
  useEffect(() => {
    if (!focal || cropMode) {
      setPos(null);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const tick = () => {
      const bridge = readBridge();
      const stage = bridge?.getStage();
      const node = bridge?.getNode(focal.id);
      const container = containerRef.current;
      if (!stage || !node || !container) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const r = node.getClientRect({ relativeTo: stage });
      const stagePos = stage.container().getBoundingClientRect();
      const ctrPos = container.getBoundingClientRect();
      const stageScreenX = stagePos.left - ctrPos.left;
      const stageScreenY = stagePos.top - ctrPos.top;
      const left =
        stageScreenX + (r.x + r.width) * zoom + stage.x() + 24; // 24 px right gap
      const top =
        stageScreenY + (r.y + r.height / 2) * zoom + stage.y();
      setPos({ left, top });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [focal, cropMode, containerRef, zoom, pan.x, pan.y]);

  // ── Drag-to-rotate ─────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if (!focal) return;
    e.preventDefault();
    e.stopPropagation();
    const bridge = readBridge();
    const stage = bridge?.getStage();
    const node = bridge?.getNode(focal.id);
    if (!stage || !node) return;

    // Element centre in screen-space (page coords for the stage
    // container origin → DOM coords).
    const r = node.getClientRect({ relativeTo: stage });
    const stagePos = stage.container().getBoundingClientRect();
    const cx = stagePos.left + (r.x + r.width / 2) * zoom + stage.x();
    const cy = stagePos.top + (r.y + r.height / 2) * zoom + stage.y();

    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
    const startRotation = (focal as any).rotation ?? 0;

    draggingRef.current = {
      id: focal.id,
      centerX: cx,
      centerY: cy,
      startAngle,
      startRotation,
    };
    commit(); // single history snapshot at start
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = draggingRef.current;
    if (!drag) return;
    const angle = Math.atan2(
      e.clientY - drag.centerY,
      e.clientX - drag.centerX,
    );
    let deg =
      drag.startRotation + ((angle - drag.startAngle) * 180) / Math.PI;
    // Normalise to (-180, 180] for nicer numbers in the inspector.
    while (deg > 180) deg -= 360;
    while (deg <= -180) deg += 360;
    if (e.shiftKey) {
      deg = Math.round(deg / 15) * 15;
    }
    updateElement(drag.id, { rotation: deg } as any);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released — safe to ignore */
    }
  };

  if (!focal || !pos || cropMode) return null;

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title="Drag to rotate (hold Shift to snap to 15°)"
      data-testid="rotate-handle"
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        transform: "translate(-50%, -50%)",
        touchAction: "none",
        zIndex: 36,
      }}
      className="h-7 w-7 rounded-full bg-white shadow-md border border-purple-300 flex items-center justify-center text-purple-700 hover:bg-purple-50 cursor-grab active:cursor-grabbing"
    >
      <RotateCw className="h-3.5 w-3.5" />
    </button>
  );
}
