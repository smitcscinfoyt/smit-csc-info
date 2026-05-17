/**
 * Canva-style floating action bar that hovers just BELOW the currently
 * selected element (or selection bbox for multi-select). Holds the
 * always-on object actions: lock, group/ungroup, duplicate, bring
 * forward / send backward, more menu (alignment + flip), delete.
 *
 * The matching icons were removed from the top `ContextualToolbar` so
 * the user only sees each action in one place — top toolbar is for
 * style/format (font, colour, filter, effects, animate, size); this
 * bar is for object lifecycle.
 *
 * Position is computed in screen-space from the selected node's
 * `getClientRect({ relativeTo: stage })` plus the stage container
 * origin and current zoom — re-runs on selection change, zoom change,
 * pan change, and on a small 60 fps RAF tick while dragging so the bar
 * follows the element.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Lock,
  Unlock,
  Copy,
  Trash2,
  Group as GroupIcon,
  Ungroup as UngroupIcon,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  RotateCcw,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  ChevronsUp,
  ChevronsDown,
  FlipHorizontal2,
  FlipVertical2,
  Layers as LayersIcon,
} from "lucide-react";
import { useStudio, useActivePage } from "../store";
import type { ElementData, ImageElement } from "../types";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

interface Props {
  /** The overflow:hidden stage container — used to translate
   *  Konva-stage coords into absolute on-screen positions for our
   *  floating bar. */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Live ref to the Konva.Stage instance and selected nodeMap so we
   *  can read each selected element's screen-space bbox. Exposed by
   *  Stage.tsx via window.__primeStudioStageBridge — same pattern
   *  the crop overlay uses. */
}

interface StageBridge {
  getStage: () => any | null;
  getNode: (id: string) => any | null;
  /** Cumulative y-offset (in stage coords) of the page containing
   *  this element. Used by the multi-page rendering path. */
  getPageOffsetForElement: (id: string) => number;
}

function readBridge(): StageBridge | null {
  return (window as any).__primeStudioStageBridge ?? null;
}

export function ElementActionBar({ containerRef }: Props) {
  const selectedIds = useStudio((s) => s.selectedIds);
  const cropMode = useStudio((s) => s.cropMode);
  const zoom = useStudio((s) => s.zoom);
  const pan = useStudio((s) => s.pan);
  const page = useActivePage();
  const pages = useStudio((s) => s.pages);
  const updateElement = useStudio((s) => s.commitUpdateElement);
  const deleteElements = useStudio((s) => s.deleteElements);
  const duplicateElements = useStudio((s) => s.duplicateElements);
  const reorderElement = useStudio((s) => s.reorderElement);
  const groupElements = useStudio((s) => s.groupElements);
  const ungroupElements = useStudio((s) => s.ungroupElements);

  const selected = useMemo(() => {
    // Selection may span pages once multi-page scroll is live, so
    // resolve each id from any page (not just the active one).
    const out: ElementData[] = [];
    for (const id of selectedIds) {
      for (const p of pages) {
        const e = p.elements.find((x) => x.id === id);
        if (e) {
          out.push(e);
          break;
        }
      }
    }
    return out;
  }, [selectedIds, pages]);

  // ── Position the bar just below the selection bbox ─────────────
  // Re-measure on every animation frame (cheap) so the bar follows
  // even mid-drag. We bail out of the RAF loop when nothing is
  // selected to avoid wasted work.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!selectedIds.length || cropMode) {
      setPos(null);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const tick = () => {
      const bridge = readBridge();
      const stage = bridge?.getStage();
      const container = containerRef.current;
      if (!stage || !container) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      // Union of every selected node's getClientRect (in stage-space).
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const id of selectedIds) {
        const node = bridge?.getNode(id);
        if (!node) continue;
        const r = node.getClientRect({ relativeTo: stage });
        if (r.width === 0 && r.height === 0) continue;
        if (r.x < minX) minX = r.x;
        if (r.y < minY) minY = r.y;
        if (r.x + r.width > maxX) maxX = r.x + r.width;
        if (r.y + r.height > maxY) maxY = r.y + r.height;
      }
      if (!isFinite(minX)) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      // stage-space → container-pixel coords. Stage has its own x/y +
      // scale (zoom). The Konva Stage container also lives inside the
      // overflow:auto scroll wrapper so we use the live container
      // bounding rect for the absolute origin.
      const stagePos = stage.container().getBoundingClientRect();
      const ctrPos = container.getBoundingClientRect();
      const stageScreenX = stagePos.left - ctrPos.left;
      const stageScreenY = stagePos.top - ctrPos.top;
      const left = stageScreenX + (minX + (maxX - minX) / 2) * zoom + stage.x();
      const top = stageScreenY + maxY * zoom + stage.y() + 14; // 14px gap
      setPos({ left, top });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [selectedIds, cropMode, containerRef, zoom, pan.x, pan.y, page?.id]);

  if (!selected.length || !pos || cropMode) return null;
  const focal = selected[selected.length - 1];

  // Group / Ungroup logic (mirrors what was previously in ContextualToolbar).
  const grpIds = new Set(selected.map((e) => e.groupId ?? null));
  const oneSharedGroup =
    grpIds.size === 1 && [...grpIds][0] !== null && [...grpIds][0] !== undefined;
  const canGroup = selected.length >= 2 && !oneSharedGroup;
  const canUngroup =
    oneSharedGroup || (selected.length === 1 && !!selected[0].groupId);

  return (
    <div
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        transform: "translateX(-50%)",
        zIndex: 35,
      }}
      className="pointer-events-auto flex items-center gap-0.5 bg-white rounded-full shadow-lg border border-purple-200 px-1.5 py-1"
      data-testid="element-action-bar"
    >
      {/* Lock / unlock */}
      <BarBtn
        title={focal.locked ? "Unlock" : "Lock"}
        onClick={() => updateElement(focal.id, { locked: !focal.locked } as any)}
        testId="bar-lock"
      >
        {focal.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
      </BarBtn>

      {/* Group / Ungroup */}
      {canUngroup ? (
        <BarBtn
          title="Ungroup"
          onClick={() => ungroupElements(selectedIds)}
          testId="bar-ungroup"
        >
          <UngroupIcon className="h-4 w-4" />
        </BarBtn>
      ) : (
        canGroup && (
          <BarBtn
            title="Group"
            onClick={() => groupElements(selectedIds)}
            testId="bar-group"
          >
            <GroupIcon className="h-4 w-4" />
          </BarBtn>
        )
      )}

      {/* Duplicate */}
      <BarBtn
        title="Duplicate"
        onClick={() => duplicateElements(selectedIds)}
        testId="bar-duplicate"
      >
        <Copy className="h-4 w-4" />
      </BarBtn>

      {/* Bring forward */}
      <BarBtn
        title="Bring forward"
        onClick={() => reorderElement(focal.id, "forward")}
      >
        <ChevronUp className="h-4 w-4" />
      </BarBtn>

      {/* Send backward */}
      <BarBtn
        title="Send backward"
        onClick={() => reorderElement(focal.id, "backward")}
      >
        <ChevronDown className="h-4 w-4" />
      </BarBtn>

      {/* Delete */}
      <BarBtn
        title="Delete"
        onClick={() => deleteElements(selectedIds)}
        testId="bar-delete"
        danger
      >
        <Trash2 className="h-4 w-4" />
      </BarBtn>

      {/* More menu — flip / align / position panel / reset rotation */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="p-1.5 hover:bg-purple-100 rounded-full text-purple-800"
            title="More"
            data-testid="bar-more"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="center" side="bottom">
          <button
            onClick={() => useStudio.getState().setSidebarTab("layers")}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-purple-50 rounded text-purple-900"
          >
            <LayersIcon className="h-4 w-4" /> Position / Layers
          </button>
          <button
            onClick={() => reorderElement(focal.id, "front")}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-purple-50 rounded text-purple-900"
          >
            <ChevronsUp className="h-4 w-4" /> Bring to front
          </button>
          <button
            onClick={() => reorderElement(focal.id, "back")}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-purple-50 rounded text-purple-900"
          >
            <ChevronsDown className="h-4 w-4" /> Send to back
          </button>
          {focal.type === "image" && (
            <>
              <div className="my-1 h-px bg-purple-100" />
              <button
                onClick={() =>
                  updateElement(focal.id, {
                    flipX: !(focal as ImageElement).flipX,
                  } as any)
                }
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-purple-50 rounded text-purple-900"
              >
                <FlipHorizontal2 className="h-4 w-4" /> Flip horizontal
              </button>
              <button
                onClick={() =>
                  updateElement(focal.id, {
                    flipY: !(focal as ImageElement).flipY,
                  } as any)
                }
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-purple-50 rounded text-purple-900"
              >
                <FlipVertical2 className="h-4 w-4" /> Flip vertical
              </button>
            </>
          )}
          <div className="my-1 h-px bg-purple-100" />
          <button
            onClick={() => updateElement(focal.id, { rotation: 0 } as any)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-purple-50 rounded text-purple-900"
          >
            <RotateCcw className="h-4 w-4" /> Reset rotation
          </button>
          {/* Page-context align (centre on page) */}
          {page && (
            <>
              <button
                onClick={() => {
                  const cx = page.width / 2;
                  updateElement(focal.id, { x: cx - focal.width / 2 } as any);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-purple-50 rounded text-purple-900"
              >
                <AlignHorizontalJustifyCenter className="h-4 w-4" /> Centre horizontally
              </button>
              <button
                onClick={() => {
                  const cy = page.height / 2;
                  updateElement(focal.id, { y: cy - focal.height / 2 } as any);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-purple-50 rounded text-purple-900"
              >
                <AlignVerticalJustifyCenter className="h-4 w-4" /> Centre vertically
              </button>
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function BarBtn({
  children,
  onClick,
  title,
  testId,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  testId?: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      data-testid={testId}
      className={`p-1.5 rounded-full ${
        danger
          ? "text-rose-600 hover:bg-rose-100"
          : "text-purple-800 hover:bg-purple-100"
      }`}
    >
      {children}
    </button>
  );
}
