/**
 * Prime Studio canvas — Konva Stage with full element rendering, selection
 * transformer, marquee selection, click-empty-to-deselect, double-click
 * text editing overlay, and pinch-to-zoom on touch devices.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Transformer, Group } from "react-konva";
import Konva from "konva";
import { useStudio, useActivePage } from "./store";
import type { ElementId, PageData, TextElement } from "./types";
import { ShapeNode } from "./elements/ShapeNode";
import { TextNode } from "./elements/TextNode";
import { ImageNode } from "./elements/ImageNode";
import { IconNode } from "./elements/IconNode";
import { CropOverlay } from "./elements/CropOverlay";
import { EraseOverlay } from "./elements/EraseOverlay";
import { loadGoogleFont, onFontLoaded } from "./fonts/catalog";
import { computeSnaps, nodeToSnapBox, pageBoxFromSize } from "./snapGuides";

interface Props {
  containerRef: React.RefObject<HTMLDivElement>;
}

/** Vertical gap (in page-local px) between stacked pages. Matches
 *  the visual breathing space Canva uses between consecutive pages. */
const PAGE_GAP = 60;

export function StudioStage({ containerRef }: Props) {
  const page = useActivePage();
  const pages = useStudio((s) => s.pages);
  const setActivePage = useStudio((s) => s.setActivePage);
  const selectedIds = useStudio((s) => s.selectedIds);
  const setSelected = useStudio((s) => s.setSelected);
  const toggleSelected = useStudio((s) => s.toggleSelected);
  const clearSelection = useStudio((s) => s.clearSelection);
  const zoom = useStudio((s) => s.zoom);
  const setZoom = useStudio((s) => s.setZoom);
  const pan = useStudio((s) => s.pan);
  const setPan = useStudio((s) => s.setPan);
  const toolMode = useStudio((s) => s.toolMode);
  const updateElement = useStudio((s) => s.commitUpdateElement);
  const lastAnimationPlay = useStudio((s) => s.lastAnimationPlay);

  // ── Multi-page vertical layout ────────────────────────────────────
  // Every page is rendered into ONE Konva Stage as a `<Group>` whose
  // y-offset is the cumulative height of all preceding pages plus a
  // fixed gap. Element coords stay page-local (kids of the Group), so
  // existing drag / transform math is unchanged. We only have to add
  // the page offset when translating between stage-space and DOM-space
  // for HTML overlays (text edit, rotate handle, action bar).
  const pageOffsets = useMemo(() => {
    const map = new Map<string, number>();
    let y = 0;
    for (const p of pages) {
      map.set(p.id, y);
      y += p.height + PAGE_GAP;
    }
    return map;
  }, [pages]);
  const totalContentW = useMemo(
    () => pages.reduce((m, p) => Math.max(m, p.width), 0),
    [pages],
  );
  const totalContentH = useMemo(
    () => pages.reduce((sum, p, i) => sum + p.height + (i > 0 ? PAGE_GAP : 0), 0),
    [pages],
  );
  /** Map a stage-space Y back to {pageId, localY}; returns null if
   *  the Y lands inside a between-page gap (or off-canvas). */
  const findPageAtY = (worldY: number): { pageId: string; localY: number } | null => {
    for (const p of pages) {
      const start = pageOffsets.get(p.id) ?? 0;
      if (worldY >= start && worldY < start + p.height) {
        return { pageId: p.id, localY: worldY - start };
      }
    }
    return null;
  };
  /** Given an element id, return the page that owns it (any page,
   *  not just the active one — selection now spans pages). */
  const findPageOfElement = (id: ElementId): PageData | null => {
    for (const p of pages) {
      if (p.elements.some((e) => e.id === id)) return p;
    }
    return null;
  };

  const stageRef = useRef<Konva.Stage | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);
  const nodeMap = useRef<Map<ElementId, Konva.Node>>(new Map());

  // ── Artboard live-draw scratch refs ─────────────────────────────
  // While the user is mid-drag with the freehand brush ("draw" tool)
  // we keep the in-progress LineElement id + its accumulating points
  // here. Storing the raw points array (not just the id) avoids a
  // round-trip through pages/find on every mousemove — the only
  // store call inside the move handler is updateElement(id,{points})
  // which is O(elements) per page; cheap enough for a brush stroke.
  const drawingLineId = useRef<string | null>(null);
  const drawingPoints = useRef<number[]>([]);
  const drawingPageId = useRef<string | null>(null);

  // For the Line tool we record the click-down origin (page-local)
  // and the freshly-created LineElement id. Mousemove updates its
  // `points` to [0,0, dx,dy]; mouseup commits or removes if degenerate.
  const lineToolState = useRef<{
    id: string;
    pageId: string;
    startX: number;
    startY: number;
  } | null>(null);

  // ── Font loading ──────────────────────────────────────────────────────
  // Whenever a text element references a Google Font, kick off a load
  // and force-redraw the layer once it's painted. We watch the current
  // page's text elements + a tick from the font module so newly loaded
  // fonts on OTHER pages also retro-update if user navigates back.
  const [fontTick, setFontTick] = useState(0);
  useEffect(() => {
    const off = onFontLoaded(() => setFontTick((t) => t + 1));
    return off;
  }, []);

  // ── Window-level finaliser for Artboard tools ─────────────────
  // Konva's onStageMouseUp only fires when pointer-up lands on the
  // stage canvas. If the user drags fast and releases OUTSIDE the
  // stage (off the panel, on the toolbar, off-window) the in-progress
  // brush stroke / line would otherwise stay "armed" and resume on
  // the next move event — visibly broken behaviour. Mirror the
  // finalisation logic on a window-level pointerup so any release
  // anywhere closes out the operation cleanly. The stage handler
  // still runs first for normal in-canvas releases; this is just
  // the safety net.
  useEffect(() => {
    const finalize = () => {
      if (drawingLineId.current) {
        const id = drawingLineId.current;
        drawingLineId.current = null;
        drawingPageId.current = null;
        if (drawingPoints.current.length < 6) {
          useStudio.getState().deleteElements([id]);
        }
        drawingPoints.current = [];
      }
      if (lineToolState.current) {
        const st = lineToolState.current;
        lineToolState.current = null;
        const allPages = useStudio.getState().pages;
        const owning = allPages.find((p) => p.id === st.pageId);
        const el = owning?.elements.find((e) => e.id === st.id);
        if (el && el.type === "line") {
          const p = (el as any).points as number[];
          const dx = p[2] - p[0];
          const dy = p[3] - p[1];
          if (Math.hypot(dx, dy) < 4) {
            useStudio.getState().deleteElements([st.id]);
          }
        }
      }
    };
    window.addEventListener("mouseup", finalize);
    window.addEventListener("touchend", finalize);
    window.addEventListener("touchcancel", finalize);
    window.addEventListener("pointercancel", finalize);
    // `blur` fires when user alt-tabs / swipes to another window mid-
    // drag — also clean up so we don't keep painting on focus return.
    window.addEventListener("blur", finalize);
    return () => {
      window.removeEventListener("mouseup", finalize);
      window.removeEventListener("touchend", finalize);
      window.removeEventListener("touchcancel", finalize);
      window.removeEventListener("pointercancel", finalize);
      window.removeEventListener("blur", finalize);
    };
  }, []);
  useEffect(() => {
    if (!page) return;
    page.elements.forEach((el) => {
      if (el.type === "text" && el.fontFamily) {
        loadGoogleFont(el.fontFamily).catch(() => {});
      }
    });
  }, [page]);
  // After fontTick changes, force Konva text nodes to re-measure with
  // the freshly-loaded font. We use the public `fontFamily` setter —
  // setting it to its current value is a no-op for the value but
  // clears Konva's internal text-data cache so the next paint uses
  // correct metrics from the now-available web font.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.find("Text").forEach((n) => {
      const t = n as Konva.Text;
      // Re-set the same font family to invalidate cached glyph metrics.
      t.fontFamily(t.fontFamily());
    });
    stage.batchDraw();
  }, [fontTick]);

  // ── Animation preview ─────────────────────────────────────────────────
  // Whenever the user picks an animation in the toolbar, the store bumps
  // `lastAnimationPlay.nonce`; we tween the matching live Konva node so
  // the user can immediately see the effect on the canvas.
  useEffect(() => {
    if (!lastAnimationPlay) return;
    const node = nodeMap.current.get(lastAnimationPlay.id);
    if (!node) return;
    runAnimationPreview(node, lastAnimationPlay.type);
  }, [lastAnimationPlay?.nonce]);

  // Track stage container size so we can centre the page rect.
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    obs.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => obs.disconnect();
  }, [containerRef]);

  // ── Infinite-canvas layout (Canva-style) ────────────────────────────
  // The page is ALWAYS centred inside an inner "scroll content" div
  // whose size grows with zoom. The outer wrapper has overflow:auto so
  // the browser draws real scrollbars on the right + bottom whenever
  // page*zoom exceeds the viewport — exactly like Canva. The toolbar
  // lives in the OUTER wrapper (not the scroll content) so it stays
  // pinned to the top of the viewport regardless of zoom or scroll.
  const TOP_RESERVE = 100;       // headroom for floating toolbars
  const SIDE_RESERVE = 32;
  const BOTTOM_RESERVE = 32;
  const PAGE_MARGIN = 120;       // breathing room around page in scroll content

  // Auto-fit zoom on initial mount + viewport changes — caps zoom
  // DOWN so a freshly-opened deck always fits the viewport WIDTH (we
  // pick the widest page; height is unbounded because pages now stack
  // vertically and the user scrolls between them). Never zooms IN
  // automatically — that would feel jarring.
  useEffect(() => {
    if (!totalContentW || !pages.length) return;
    const usableW = Math.max(50, size.w - SIDE_RESERVE * 2);
    const usableH = Math.max(50, size.h - TOP_RESERVE - BOTTOM_RESERVE);
    // Fit by widest page; if a single page is shorter than viewport,
    // also let it grow vertically so initial render isn't tiny.
    const firstH = pages[0]?.height ?? 1;
    const fitZoom = Math.min(usableW / totalContentW, usableH / firstH);
    const newZoom = Math.min(zoom, Math.max(0.1, fitZoom));
    if (Math.abs(newZoom - zoom) > 0.001) setZoom(newZoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length, totalContentW, size.w, size.h]);

  // Stage canvas dimensions: large enough to host the entire vertical
  // stack of pages (sum of heights + gaps) plus margin, with a floor
  // at viewport size so empty area still receives wheel events.
  const stageW = totalContentW
    ? Math.max(size.w, totalContentW * zoom + PAGE_MARGIN * 2)
    : size.w;
  const stageH = totalContentH
    ? Math.max(size.h, totalContentH * zoom + PAGE_MARGIN * 2)
    : size.h;
  // Horizontal: centre the widest page; vertical: leave a small top
  // margin (PAGE_MARGIN) and let pages stack downward from there.
  const renderPanX = totalContentW ? (stageW - totalContentW * zoom) / 2 : 0;
  const renderPanY = totalContentH ? PAGE_MARGIN : 0;

  // Sync derived pan back to the store so legacy consumers (text editor
  // overlay, marquee math) keep working unchanged.
  useEffect(() => {
    if (Math.abs(pan.x - renderPanX) > 0.5 || Math.abs(pan.y - renderPanY) > 0.5) {
      setPan({ x: renderPanX, y: renderPanY });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderPanX, renderPanY]);

  // Centre horizontally + scroll to the ACTIVE page vertically when
  // the active page changes (e.g. user clicks a thumbnail in PagesBar)
  // or zoom changes. Don't fight the user's manual scroll between
  // pages — only move when the active page id flips.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !page) return;
    el.scrollLeft = Math.max(0, (stageW - size.w) / 2);
    const offset = pageOffsets.get(page.id) ?? 0;
    // Scroll so the top of the active page sits ~PAGE_MARGIN/2 below
    // the viewport top — leaves room for any HTML page header.
    el.scrollTop = Math.max(0, offset * zoom + renderPanY - PAGE_MARGIN / 2);
  }, [zoom, stageW, size.w, page?.id]);

  // Re-attach transformer whenever selection changes. While in crop mode
  // we hide the Transformer entirely — the CropOverlay handles all
  // resize / drag affordances for that one element.
  const cropMode = useStudio((s) => s.cropMode);
  const eraseMode = useStudio((s) => s.eraseMode);
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    if (cropMode || eraseMode) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const nodes = selectedIds
      .map((id) => nodeMap.current.get(id))
      .filter((n): n is Konva.Node => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, page?.elements?.length, cropMode, eraseMode]);

  // Element being cropped (if any) — looked up across ALL pages so a
  // crop initiated on a non-active page still resolves the right
  // element (multi-page rendering means active page may have shifted
  // mid-crop). Also expose the owning page so the CropOverlay can be
  // wrapped in the right page Group at render time.
  const cropPair = useMemo(() => {
    if (!cropMode) return null;
    for (const p of pages) {
      const e = p.elements.find((x) => x.id === cropMode);
      if (e && e.type === "image") return { el: e, page: p };
    }
    return null;
  }, [cropMode, pages]);
  const cropEl = cropPair?.el ?? null;

  // Same lookup pattern for the element being erased — needed so the
  // EraseOverlay can be wrapped in the right page Group at render time.
  const erasePair = useMemo(() => {
    if (!eraseMode) return null;
    for (const p of pages) {
      const e = p.elements.find((x) => x.id === eraseMode);
      if (e && e.type === "image") return { el: e, page: p };
    }
    return null;
  }, [eraseMode, pages]);
  const eraseEl = erasePair?.el ?? null;

  // ── Wheel zoom (Ctrl/Cmd + wheel) ─────────────────────────────────────
  // Plain wheel = browser-native scroll on the wrapper (Canva pattern).
  // Ctrl/Cmd + wheel = zoom around page CENTRE (we re-centre the
  // scroll position via the layout effect above so the page stays
  // visually anchored regardless of zoom).
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    if (!e.evt.ctrlKey && !e.evt.metaKey) return; // let wrapper scroll
    e.evt.preventDefault();
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const factor = 1.1;
    const newScale = Math.min(8, Math.max(0.1, zoom * (direction > 0 ? factor : 1 / factor)));
    setZoom(newScale);
  };

  // ── Marquee selection (drag on empty area in select mode) ─────────────
  // `marquee` lives in stage-space (not page-local) so the visual rect
  // overlays the entire stage uniformly. `marqueePageId` records which
  // page owned the down-click — hit-tests + the visible rect both
  // restrict to that page so a drag on page 2 never selects page 1.
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const marqueePageId = useRef<string | null>(null);

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    // While the user is interactively cropping an image, the CropOverlay
    // owns ALL pointer input WITHIN the crop frame. But a click on the
    // empty stage / page background should AUTO-COMMIT the crop and exit
    // crop mode — no need to chase the on-screen Done button. This is
    // how Canva / Figma / Photoshop all behave and is what the user
    // expects (whatever is currently cropped should get applied).
    if (cropMode) {
      const tgt = e.target;
      const tgtId = tgt?.id?.();
      // Only treat clicks on the bare page / stage background as
      // "outside the crop frame". Clicks on the crop window's invisible
      // drag-rect or its handles continue to be owned by CropOverlay.
      if ((tgtId && tgtId.startsWith("pageBg-")) || tgtId === "stageBg") {
        const fn = (window as any).__primeStudioCropCommit as
          | (() => Partial<import("./types").ImageElement> | null)
          | undefined;
        const patch = fn?.();
        const cropId = cropMode;
        if (patch) {
          updateElement(cropId, patch as any);
        }
        useStudio.getState().setCropMode(null);
        // Re-select the just-cropped image so the contextual toolbar
        // and Transformer reappear immediately and the user can drag
        // it without having to re-click first.
        setSelected([cropId]);
      }
      // Whether we committed or not, swallow this stage event — it must
      // NOT also start a marquee selection or clear selection.
      return;
    }
    // Mirror the same auto-commit on stage-bg click while ERASING — a
    // click outside the image saves the current mask and exits erase
    // mode. Painting strokes happen on the EraseOverlay's own pointer
    // rect so they never reach this stage handler.
    if (eraseMode) {
      const tgt = e.target;
      const tgtId = tgt?.id?.();
      if ((tgtId && tgtId.startsWith("pageBg-")) || tgtId === "stageBg") {
        const fn = (window as any).__primeStudioEraseCommit as
          | (() => Partial<import("./types").ImageElement> | null)
          | undefined;
        const patch = fn?.();
        const eraseId = eraseMode;
        if (patch) {
          updateElement(eraseId, patch as any);
        }
        useStudio.getState().setEraseMode(null);
        setSelected([eraseId]);
      }
      return;
    }
    // ── Artboard tools (freehand draw + straight line) ──────────────
    // When either of these tools is armed via the Artboard panel we
    // intercept BEFORE the marquee/select logic. Clicking on an
    // existing element does NOT pick it — it starts a new shape, the
    // same way Figma / Canva behave. Both start by translating the
    // pointer to the page-local coord space of whichever page lies
    // under the cursor.
    if (toolMode === "draw" || toolMode === "line") {
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const localStage = {
        x: (pos.x - stage.x()) / zoom,
        y: (pos.y - stage.y()) / zoom,
      };
      const hit = findPageAtY(localStage.y);
      if (!hit) return;
      // Make sure addElement (which targets activePageId) drops the
      // shape on the page the user actually clicked.
      if (hit.pageId !== page?.id) setActivePage(hit.pageId);
      const px = localStage.x;
      const py = hit.localY;
      const settings = useStudio.getState().artboard;
      const addElementFn = useStudio.getState().addElement;
      if (toolMode === "draw") {
        // Seed with a 2-point polyline at the click — Konva needs at
        // least two points to render anything, and the next mousemove
        // will keep extending it.
        const id = addElementFn({
          type: "line",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          points: [px, py, px, py],
          stroke: settings.drawColor,
          strokeWidth: settings.drawSize,
          dash: null,
        } as any);
        drawingLineId.current = id;
        drawingPoints.current = [px, py, px, py];
        drawingPageId.current = hit.pageId;
      } else {
        // Line tool: anchor the element AT the click point and store
        // points relative to that anchor — keeps drag/resize math
        // simple and matches how the existing snap-line code thinks
        // about Konva Lines.
        const id = addElementFn({
          type: "line",
          x: px,
          y: py,
          width: 0,
          height: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          points: [0, 0, 0, 0],
          stroke: settings.drawColor,
          strokeWidth: settings.lineWeight,
          dash: settings.lineDashed
            ? [Math.max(6, settings.lineWeight * 3), Math.max(4, settings.lineWeight * 2)]
            : null,
        } as any);
        lineToolState.current = {
          id,
          pageId: hit.pageId,
          startX: px,
          startY: py,
        };
      }
      // Swallow this stage event so neither marquee nor clearSelection
      // fires — they would wipe the just-added shape's selection.
      return;
    }
    // Only react when the click is on the empty stage / page-bg, not on
    // a real element node or a Transformer anchor (those handle their own
    // selection / resize). Without the Transformer check the user clicking
    // a corner handle would clear the selection BEFORE the resize starts,
    // making resize impossible.
    const target = e.target;
    if (target && typeof (target as Konva.Node).findAncestor === "function") {
      const onTransformer =
        (target.getClassName?.() === "Transformer") ||
        !!(target as Konva.Node).findAncestor?.("Transformer", true);
      if (onTransformer) return;
      // Walk up the Konva tree from the click target — if any
      // ancestor is a registered element node (lives in nodeMap),
      // the click landed inside that element and its own
      // onMouseDown has already handled selection. We MUST bail
      // out here, otherwise the marquee/clearSelection branch
      // below wipes the selection that just got made.
      //
      // Why a walk and not just `target.id()`?
      //   ImageNode wraps its KImage in a <Group> that carries
      //   id={el.id}; the inner KImage has no id of its own.
      //   Konva delivers the deepest-hit node as `e.target`, so
      //   clicking the image gives target = inner KImage with
      //   empty id — the old `if (targetId && ...) return` guard
      //   missed this and let the click fall through to
      //   clearSelection(). Walking up the parent chain catches
      //   both the element node itself AND any of its inner
      //   shapes uniformly.
      let walker: Konva.Node | null = target as Konva.Node;
      while (walker) {
        const wid = walker.id?.();
        if (wid && nodeMap.current.has(wid)) return;
        walker = walker.getParent ? (walker.getParent() as Konva.Node | null) : null;
      }
    }
    const targetId = target?.id?.();
    // pageBg is now `pageBg-<pageId>` per stacked page; stageBg is the
    // single un-pageified backdrop. Treat any of these as "empty".
    const isPageBg = !!targetId && targetId.startsWith("pageBg-");
    if (toolMode === "hand") return; // hand tool pans only
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const local = {
      x: (pos.x - stage.x()) / zoom,
      y: (pos.y - stage.y()) / zoom,
    };
    // Identify which page (if any) this click landed on. Marquee is
    // restricted to elements on that page so a drag on page 2 never
    // accidentally selects page 1 elements above it.
    const hit = isPageBg
      ? { pageId: targetId.replace("pageBg-", ""), localY: local.y }
      : findPageAtY(local.y);
    if (hit) {
      marqueePageId.current = hit.pageId;
      // Clicking a non-active page → make it active so the user's
      // next style change targets the right page.
      if (hit.pageId !== page?.id) setActivePage(hit.pageId);
    } else {
      marqueePageId.current = null;
    }
    marqueeStart.current = local;
    setMarquee({ ...local, w: 0, h: 0 });
    clearSelection();
  };

  const onStageMouseMove = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const local = {
      x: (pos.x - stage.x()) / zoom,
      y: (pos.y - stage.y()) / zoom,
    };
    // ── Freehand brush: extend the in-progress polyline ─────────
    if (drawingLineId.current) {
      const hit = findPageAtY(local.y);
      // If pointer left the page vertically, just hold the last
      // point — re-entry will resume cleanly.
      if (!hit || hit.pageId !== drawingPageId.current) return;
      drawingPoints.current.push(local.x, hit.localY);
      useStudio.getState().updateElement(drawingLineId.current, {
        points: [...drawingPoints.current],
      } as any);
      return;
    }
    // ── Line tool: stretch end-point relative to anchor ─────────
    if (lineToolState.current) {
      const hit = findPageAtY(local.y);
      if (!hit || hit.pageId !== lineToolState.current.pageId) return;
      const dx = local.x - lineToolState.current.startX;
      const dy = hit.localY - lineToolState.current.startY;
      useStudio.getState().updateElement(lineToolState.current.id, {
        points: [0, 0, dx, dy],
      } as any);
      return;
    }
    if (!marqueeStart.current) return;
    const cur = local;
    const x = Math.min(marqueeStart.current.x, cur.x);
    const y = Math.min(marqueeStart.current.y, cur.y);
    const w = Math.abs(cur.x - marqueeStart.current.x);
    const h = Math.abs(cur.y - marqueeStart.current.y);
    setMarquee({ x, y, w, h });
  };

  const onStageMouseUp = () => {
    // Same protection as mouseDown — crop overlay owns input while active.
    if (cropMode) {
      marqueeStart.current = null;
      marqueePageId.current = null;
      if (marquee) setMarquee(null);
      return;
    }
    // ── Finalise an in-progress freehand brush stroke ──────────
    if (drawingLineId.current) {
      // Snapshot history once at end-of-stroke so undo collapses
      // the entire scribble into a single step (the per-move
      // updateElement calls didn't snapshot).
      const id = drawingLineId.current;
      drawingLineId.current = null;
      drawingPageId.current = null;
      // If the user just clicked without dragging the polyline has
      // only the seed point repeated — drop it so we don't litter
      // the canvas with invisible degenerates.
      if (drawingPoints.current.length < 6) {
        useStudio.getState().deleteElements([id]);
      }
      drawingPoints.current = [];
      return;
    }
    // ── Finalise a Line tool drag ──────────────────────────────
    if (lineToolState.current) {
      const st = lineToolState.current;
      lineToolState.current = null;
      // If the line is too short (effectively a click), drop it —
      // otherwise we leave a near-invisible point on the canvas.
      const allPages = useStudio.getState().pages;
      const owning = allPages.find((p) => p.id === st.pageId);
      const el = owning?.elements.find((e) => e.id === st.id);
      if (el && el.type === "line") {
        const p = (el as any).points as number[];
        const dx = p[2] - p[0];
        const dy = p[3] - p[1];
        if (Math.hypot(dx, dy) < 4) {
          useStudio.getState().deleteElements([st.id]);
        }
      }
      return;
    }
    if (marqueeStart.current && marquee && (marquee.w > 4 || marquee.h > 4)) {
      // Both rectangles live in stage-space:
      //   - `marquee` was captured by reversing zoom+pan
      //   - `getClientRect({ relativeTo: stage })` returns the node's
      //     box in the stage's *un-transformed* coords, which for a
      //     node nested in a page Group is page-local + group offset
      //     == stage-space. So we can compare directly.
      const stage = stageRef.current;
      const targetPageId = marqueePageId.current;
      const targetPage = targetPageId
        ? pages.find((p) => p.id === targetPageId)
        : null;
      if (targetPage) {
        const hits: ElementId[] = [];
        for (const el of targetPage.elements) {
          const node = nodeMap.current.get(el.id);
          if (!node || !stage) continue;
          const r = node.getClientRect({ relativeTo: stage as any });
          if (
            r.x < marquee.x + marquee.w &&
            r.x + r.width > marquee.x &&
            r.y < marquee.y + marquee.h &&
            r.y + r.height > marquee.y
          ) {
            hits.push(el.id);
          }
        }
        setSelected(hits);
      }
    }
    marqueeStart.current = null;
    marqueePageId.current = null;
    setMarquee(null);
  };

  // ── Pinch-to-zoom (mobile) ────────────────────────────────────────────
  // We snapshot the *start* pan/zoom/world anchor so each frame computes a
  // deterministic new pan from immutable inputs — prevents drift jitter as
  // setPan/setZoom updates the live `pan`/`zoom` state mid-gesture.
  const pinchStart = useRef<{
    dist: number;
    startZoom: number;
    startPanX: number;
    startPanY: number;
    anchor: { x: number; y: number }; // world (page-local) point under midpoint
  } | null>(null);

  const onTouchMovePinch = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length !== 2) return;
    e.evt.preventDefault();
    const [t1, t2] = [touches[0], touches[1]];
    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    if (!pinchStart.current) {
      pinchStart.current = {
        dist,
        startZoom: zoom,
        startPanX: pan.x,
        startPanY: pan.y,
        anchor: { x: 0, y: 0 },
      };
      return;
    }
    const ratio = dist / pinchStart.current.dist;
    const newScale = Math.min(8, Math.max(0.1, pinchStart.current.startZoom * ratio));
    setZoom(newScale);
    // Pan is derived from stage size + zoom (page always centred), and
    // the layout effect re-centres scroll, so we don't touch pan here.
  };
  const onTouchEndPinch = () => { pinchStart.current = null; };

  // ── Text editing overlay ──────────────────────────────────────────────
  // editingEl + its owning page (search across ALL pages — multi-page
  // rendering means the user can double-click text on page 2 even if
  // page 1 was previously active).
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const editingPair = useMemo(() => {
    if (!editingTextId) return null;
    for (const p of pages) {
      const el = p.elements.find((e) => e.id === editingTextId);
      if (el && el.type === "text") {
        return { el: el as TextElement, page: p };
      }
    }
    return null;
  }, [editingTextId, pages]);
  const editingEl = editingPair?.el ?? null;

  const overlayBox = useMemo(() => {
    if (!editingPair || !stageRef.current) return null;
    // Use the Stage's actual container DIV bounding rect — this is the
    // <div> Konva renders into, which lives INSIDE the scroll wrapper
    // and therefore moves with the user's scroll position. Add the
    // cumulative y-offset of the editing element's PAGE so the
    // textarea pins correctly when text on a non-first page is edited.
    const stageBox = stageRef.current.container().getBoundingClientRect();
    const off = pageOffsets.get(editingPair.page.id) ?? 0;
    const left = stageBox.left + (editingPair.el.x * zoom + (stageRef.current.x() ?? 0));
    const top = stageBox.top + ((editingPair.el.y + off) * zoom + (stageRef.current.y() ?? 0));
    return { left, top };
  }, [editingPair, zoom, pan, pageOffsets]);

  const selectableRef = (id: ElementId, n: Konva.Node | null) => {
    if (n) nodeMap.current.set(id, n);
    else nodeMap.current.delete(id);
  };

  // Bridge: expose stage + node lookups on `window` so the floating
  // overlays (`ElementActionBar`, `RotateHandle`) can read screen-space
  // bboxes without re-implementing Konva ref plumbing inside React.
  // We refresh on every render — the bridge object is cheap and lets
  // overlays poll via `requestAnimationFrame` to follow drags.
  useEffect(() => {
    (window as any).__primeStudioStageBridge = {
      getStage: () => stageRef.current,
      getNode: (id: string) => nodeMap.current.get(id) ?? null,
      // Multi-page rendering stacks pages vertically; each page Group
      // sits at `pageOffsets[pageId]`. RotateHandle / ElementActionBar
      // need this to translate page-local element coordinates into
      // screen-space when computing their floating positions.
      getPageOffsetForElement: (id: string) => {
        const all = useStudio.getState().pages;
        let off = 0;
        for (const p of all) {
          if (p.elements.some((e) => e.id === id)) return off;
          off += p.height + PAGE_GAP;
        }
        return 0;
      },
    };
    return () => {
      if ((window as any).__primeStudioStageBridge) {
        delete (window as any).__primeStudioStageBridge;
      }
    };
  }, []);

  const onElementSelect = (id: ElementId, ev: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const additive = (ev.evt as MouseEvent).shiftKey;
    // Resolve owning page first so EVERY selection path (additive or
    // not) can switch active page when the click crossed a page
    // boundary. Without this, Shift-clicking an element on page 2
    // while page 1 is active would toggle the selection but leave
    // active page wrong, breaking add/insert operations that still
    // target activePageId (e.g. addElement, page-level UI).
    const ownerPage = findPageOfElement(id);
    if (ownerPage && ownerPage.id !== page?.id) {
      setActivePage(ownerPage.id);
    }
    if (additive) {
      // Shift always toggles the SINGLE element (power-user override —
      // lets you peel one element off a group's selection).
      toggleSelected(id, true);
      return;
    }
    // Group-aware selection: clicking any group member selects every
    // member of that group as a unit. We already resolved owner page
    // and switched active page above (covers both additive and
    // non-additive paths), so just look up the clicked element here.
    const clicked = ownerPage?.elements.find((e) => e.id === id);
    const grpId = clicked?.groupId;
    if (grpId && ownerPage) {
      const groupMemberIds = ownerPage.elements
        .filter((e) => e.groupId === grpId)
        .map((e) => e.id);
      const sameSet =
        selectedIds.length === groupMemberIds.length &&
        groupMemberIds.every((mid) => selectedIds.includes(mid));
      if (!sameSet) setSelected(groupMemberIds);
      return;
    }
    if (!selectedIds.includes(id)) setSelected([id]);
  };

  // ── Group drag + snap guides ──────────────────────────────────────────
  // Two intertwined behaviours implemented via Stage-level event
  // delegation (Konva bubbles drag* events from any node up to the
  // stage). Doing it here means we don't need to touch every element
  // node component (ImageNode, TextNode, ShapeNode, IconNode) — they
  // keep their existing drag handlers, and we layer this on top.
  //
  // 1) GROUP DRAG: when the user starts dragging one element while 2+
  //    elements are selected, snapshot every selected element's start
  //    position. On every dragmove of the focal node, translate the
  //    other selected nodes by the same delta so the whole selection
  //    moves as one unit. Persist final positions in the store on
  //    dragend (history snapshot was already taken by the focal
  //    element's existing onDragStart -> _commit pipe).
  //
  // 2) SNAP GUIDES: on every dragmove, compare the focal node's
  //    bounding box edges/centres against every other element + the
  //    page itself. If within ~6 px (in world coords), nudge the focal
  //    node onto the snap line and render a purple guide line on a
  //    dedicated overlay layer for visual feedback. Cleared on
  //    dragend.
  // For each selected element we snapshot BOTH:
  //   - nodeX/nodeY → live Konva node position at drag start (used for
  //     intra-frame visual translation; for a Konva.Circle this is its
  //     CENTRE, for Rect/Image/Text/Icon it's the top-left).
  //   - elX/elY    → the element's STORE position at drag start (always
  //     top-left in the studio's element-coordinate convention).
  // We translate the node by the focal-node delta during dragmove, and
  // persist `elX + delta, elY + delta` on dragend — that way circles
  // (whose node coords differ from store coords by their radius) get
  // saved correctly. Without this, every non-focal circle in a grouped
  // drag was being saved at +radius from its true position.
  const groupDragRef = useRef<Map<
    ElementId,
    { nodeX: number; nodeY: number; elX: number; elY: number }
  > | null>(null);
  const guideLayerRef = useRef<Konva.Layer | null>(null);

  // Render a fresh set of guide lines on the dedicated overlay layer.
  // Imperative (not React state) so we can update at 60 fps without
  // triggering re-renders of every other element on the canvas.
  const drawGuides = (vGuides: number[], hGuides: number[]) => {
    const layer = guideLayerRef.current;
    if (!layer || !page) return;
    layer.destroyChildren();
    const stroke = "#7c3aed";
    const sw = 1; // logical px; layer is scaled by stage zoom so this stays crisp
    for (const x of vGuides) {
      layer.add(
        new Konva.Line({
          points: [x, -10000, x, 10000],
          stroke,
          strokeWidth: sw / Math.max(0.001, useStudio.getState().zoom),
          opacity: 0.85,
          listening: false,
          dash: [4 / Math.max(0.001, useStudio.getState().zoom), 4 / Math.max(0.001, useStudio.getState().zoom)],
        }),
      );
    }
    for (const y of hGuides) {
      layer.add(
        new Konva.Line({
          points: [-10000, y, 10000, y],
          stroke,
          strokeWidth: sw / Math.max(0.001, useStudio.getState().zoom),
          opacity: 0.85,
          listening: false,
          dash: [4 / Math.max(0.001, useStudio.getState().zoom), 4 / Math.max(0.001, useStudio.getState().zoom)],
        }),
      );
    }
    layer.batchDraw();
  };
  const clearGuides = () => {
    const layer = guideLayerRef.current;
    if (!layer) return;
    layer.destroyChildren();
    layer.batchDraw();
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const isElementNode = (n: Konva.Node) => {
      const id = n.id?.();
      if (!id) return false;
      // Exclude scaffolding (page rect, stage bg, transformer, guides).
      return id !== "pageBg" && id !== "stageBg" && nodeMap.current.has(id);
    };

    const onDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Node;
      if (!isElementNode(node)) return;
      const id = node.id() as ElementId;
      // Only set up group-drag when 2+ elements are selected AND the
      // dragging node is one of them. Otherwise it's a plain solo
      // drag and we leave behaviour untouched.
      const sel = useStudio.getState().selectedIds;
      const pageNow = useStudio.getState().pages.find(
        (p) => p.id === useStudio.getState().activePageId,
      );
      if (sel.length >= 2 && sel.includes(id) && pageNow) {
        const snaps = new Map<
          ElementId,
          { nodeX: number; nodeY: number; elX: number; elY: number }
        >();
        for (const sid of sel) {
          const n = nodeMap.current.get(sid);
          const elData = pageNow.elements.find((e) => e.id === sid);
          if (n && elData) {
            snaps.set(sid, {
              nodeX: n.x(),
              nodeY: n.y(),
              elX: elData.x,
              elY: elData.y,
            });
          }
        }
        groupDragRef.current = snaps;
      } else {
        groupDragRef.current = null;
      }
      // Always clear any leftover guides at drag start.
      clearGuides();
    };

    const onDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Node;
      if (!isElementNode(node)) return;
      const id = node.id() as ElementId;
      // Resolve the page that OWNS this element (not necessarily the
      // active page — multi-page rendering means any element on any
      // page can be dragged). Snap math therefore only considers
      // siblings on the same page so cross-page snapping is impossible.
      const ownerPage = (() => {
        const allPages = useStudio.getState().pages;
        for (const p of allPages) {
          if (p.elements.some((e2) => e2.id === id)) return p;
        }
        return null;
      })();
      if (!ownerPage) return;
      // Cumulative y offset for this element's page in stage-space.
      const allPagesNow = useStudio.getState().pages;
      let pageOffsetY = 0;
      for (const p of allPagesNow) {
        if (p.id === ownerPage.id) break;
        pageOffsetY += p.height + PAGE_GAP;
      }

      // ── Snap the focal node first ────────────────────────────────
      // We collect sibling boxes from every OTHER element that's not
      // hidden / locked AND not currently part of the moving group
      // (so a multi-selection doesn't try to snap to its own members).
      const sel = useStudio.getState().selectedIds;
      const movingSet = new Set(sel.includes(id) ? sel : [id]);
      const dragBox = nodeToSnapBox(node, stage);
      const siblingBoxes = ownerPage.elements
        .filter((el) => !movingSet.has(el.id) && !el.hidden && !el.locked)
        .map((el) => nodeMap.current.get(el.id))
        .filter((n): n is Konva.Node => !!n)
        .map((n) => nodeToSnapBox(n, stage));
      // pageBox returns origin-(0,0) coords; offset by this page's
      // stage-space y so its top/bottom/centre lines land on the
      // correct page strip.
      const pgBoxLocal = pageBoxFromSize(ownerPage.width, ownerPage.height);
      const pgBox = {
        left: pgBoxLocal.left,
        right: pgBoxLocal.right,
        cx: pgBoxLocal.cx,
        top: pgBoxLocal.top + pageOffsetY,
        bottom: pgBoxLocal.bottom + pageOffsetY,
        cy: pgBoxLocal.cy + pageOffsetY,
      };
      // Threshold in world (page-local) coords. We want it to feel like
      // ~6 screen pixels regardless of zoom.
      const threshold = 6 / Math.max(0.001, useStudio.getState().zoom);
      const snap = computeSnaps(dragBox, siblingBoxes, pgBox, threshold);
      if (snap.dx !== 0) node.x(node.x() + snap.dx);
      if (snap.dy !== 0) node.y(node.y() + snap.dy);
      drawGuides(snap.vGuides, snap.hGuides);

      // ── Group drag: translate other selected nodes by same delta ─
      // For visual translation we use NODE coords (Konva-space), since
      // that's what Konva nodes actually live in. The focal-node delta
      // applied here is identical to the conceptual drag delta — for a
      // circle the centre moves the same dx as the top-left.
      const groupSnaps = groupDragRef.current;
      if (groupSnaps && groupSnaps.size > 1) {
        const start = groupSnaps.get(id);
        if (start) {
          const dx = node.x() - start.nodeX;
          const dy = node.y() - start.nodeY;
          groupSnaps.forEach((startPos, otherId) => {
            if (otherId === id) return;
            const other = nodeMap.current.get(otherId);
            if (other) {
              other.x(startPos.nodeX + dx);
              other.y(startPos.nodeY + dy);
            }
          });
          stage.batchDraw();
        }
      }
    };

    const onDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target as Konva.Node;
      clearGuides();
      if (!isElementNode(node)) return;
      const id = node.id() as ElementId;
      const groupSnaps = groupDragRef.current;
      if (groupSnaps && groupSnaps.size > 1) {
        const start = groupSnaps.get(id);
        if (start) {
          // Translation delta is computed in NODE space — but a visual
          // delta of (dx, dy) maps 1:1 to a STORE delta of the same
          // (dx, dy) for every element type (the offset between node
          // and store coords is constant per shape, so it cancels in
          // the delta). Persist using each peer's STORE start position
          // so circles save their top-left, not their centre.
          const dx = node.x() - start.nodeX;
          const dy = node.y() - start.nodeY;
          groupSnaps.forEach((startPos, otherId) => {
            if (otherId === id) return;
            useStudio
              .getState()
              .updateElement(otherId, {
                x: startPos.elX + dx,
                y: startPos.elY + dy,
              });
          });
        }
      }
      groupDragRef.current = null;
    };

    stage.on("dragstart.studio-group", onDragStart);
    stage.on("dragmove.studio-group", onDragMove);
    stage.on("dragend.studio-group", onDragEnd);
    return () => {
      stage.off("dragstart.studio-group");
      stage.off("dragmove.studio-group");
      stage.off("dragend.studio-group");
    };
  }, [page?.id]);

  if (!page) return null;

  return (
    <div className="relative w-full h-full bg-purple-50 overflow-hidden">
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-auto canvas-scroll"
        style={{ scrollbarGutter: "stable" }}
      >
      <div style={{ width: stageW, height: stageH, position: "relative" }}>
        {/* Per-page header labels — pure HTML overlays positioned above
            each page in scroll-content space (i.e. zoomed canvas
            coords). Click label to make that page active. */}
        {pages.map((p, i) => {
          const offY = pageOffsets.get(p.id) ?? 0;
          const left = renderPanX;
          const top = renderPanY + offY * zoom - 26;
          const isActive = p.id === page?.id;
          return (
            <button
              key={`label-${p.id}`}
              type="button"
              onClick={() => setActivePage(p.id)}
              style={{
                position: "absolute",
                left,
                top,
                width: p.width * zoom,
                // Sits ABOVE the Konva canvas (which paints normally
                // at the natural stacking level inside this container).
                // pointerEvents:auto ensures label clicks reach this
                // button rather than falling through to the stage.
                zIndex: 5,
                pointerEvents: "auto",
              }}
              className={`flex items-center justify-between text-[11px] font-medium tracking-wide select-none px-1 ${
                isActive ? "text-purple-700" : "text-purple-400 hover:text-purple-600"
              }`}
            >
              <span className="truncate">
                Page {i + 1}
                {p.name ? ` · ${p.name}` : ""}
              </span>
              <span className="text-purple-300">
                {Math.round(p.width)} × {Math.round(p.height)}
              </span>
            </button>
          );
        })}
      <Stage
        ref={stageRef}
        width={stageW}
        height={stageH}
        x={renderPanX}
        y={renderPanY}
        scaleX={zoom}
        scaleY={zoom}
        draggable={false}
        onWheel={onWheel}
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onMouseUp={onStageMouseUp}
        onTouchStart={(e) => {
          if ((e.evt as TouchEvent).touches?.length >= 2) {
            onTouchMovePinch(e);
          } else {
            onStageMouseDown(e);
          }
        }}
        onTouchMove={(e) => {
          if ((e.evt as TouchEvent).touches?.length >= 2) onTouchMovePinch(e);
          else onStageMouseMove();
        }}
        onTouchEnd={(e) => {
          onTouchEndPinch();
          onStageMouseUp();
          // swallow to avoid synthesised mouse events firing too
          if ((e.evt as TouchEvent).touches?.length === 0) {
            // no-op
          }
        }}
        style={{ cursor: toolMode === "hand" ? "grab" : "default" }}
      >
        <Layer listening={false}>
          {/* Big stage backdrop so wheel-events fire even on empty area. */}
          <Rect id="stageBg" x={-100000} y={-100000} width={200000} height={200000} fill="#f5f3ff" listening={false} />
        </Layer>

        {/* One Layer holds every page. Each page is wrapped in a Group
            offset by its cumulative y so the pages stack vertically with
            PAGE_GAP between them. The Group origin is the page's top-
            left, so element x/y stay page-local — exactly what the
            single-page version stored, no schema migration needed. */}
        <Layer>
          {pages.map((p) => {
            const offY = pageOffsets.get(p.id) ?? 0;
            return (
              <Group key={p.id} x={0} y={offY}>
                {/* Page surface (drop shadow). Per-page id so the
                    marquee + crop-commit handlers can detect WHICH
                    page received an empty-area click. */}
                <Rect
                  id={`pageBg-${p.id}`}
                  x={0}
                  y={0}
                  width={p.width}
                  height={p.height}
                  fill={p.background}
                  shadowColor="rgba(75, 0, 130, 0.18)"
                  shadowBlur={28}
                  shadowOffsetY={6}
                  cornerRadius={4}
                  listening
                />
                {p.elements.map((el) => {
                  if (el.type === "rect" || el.type === "circle" || el.type === "line") {
                    return (
                      <ShapeNode
                        key={el.id}
                        el={el}
                        selectableRef={selectableRef}
                        onSelect={onElementSelect}
                      />
                    );
                  }
                  if (el.type === "text") {
                    return (
                      <TextNode
                        key={el.id}
                        el={el}
                        selectableRef={selectableRef}
                        onSelect={onElementSelect}
                        onRequestEdit={setEditingTextId}
                        hidden={editingTextId === el.id}
                      />
                    );
                  }
                  if (el.type === "image") {
                    return (
                      <ImageNode
                        key={el.id}
                        el={el}
                        selectableRef={selectableRef}
                        onSelect={onElementSelect}
                        hidden={cropMode === el.id || eraseMode === el.id}
                      />
                    );
                  }
                  if (el.type === "icon") {
                    return (
                      <IconNode
                        key={el.id}
                        el={el}
                        selectableRef={selectableRef}
                        onSelect={onElementSelect}
                      />
                    );
                  }
                  return null;
                })}
                {/* Crop overlay belongs to the page that owns the
                    cropped image — sits above other elements on that
                    same page so handles are clickable. */}
                {cropEl && cropPair?.page.id === p.id && (
                  <CropOverlay el={cropEl} zoom={zoom} />
                )}
                {/* Erase overlay — same scoping logic. The image being
                    erased is hidden in the element loop above (via the
                    `hidden` prop pattern, mirroring crop), and the
                    overlay re-renders the image with the live paint
                    preview painted on top so the user can see what
                    they're about to erase. */}
                {eraseEl && erasePair?.page.id === p.id && (
                  <EraseOverlay el={eraseEl} zoom={zoom} />
                )}
              </Group>
            );
          })}
          {/* Transformer is OUTSIDE the page Groups — it operates on
              absolute node positions and follows whichever node(s) are
              selected, regardless of which Group they live in. */}
          <Transformer
            ref={trRef}
            // Konva's built-in rotate anchor is a top-centre handle — we
            // disable it and replace with a Canva-style HTML rotate
            // button on the RIGHT side of the selection (RotateHandle.tsx).
            rotateEnabled={false}
            keepRatio={false}
            // Tiny dot-style anchors (Canva-style). Touch usability is
            // preserved by `anchorDragBoundFunc` hit slop + the fact
            // that Konva expands the hit area beyond the visual rect.
            anchorSize={8}
            anchorStroke="#7c3aed"
            anchorStrokeWidth={1}
            anchorFill="#ffffff"
            anchorCornerRadius={2}
            borderStroke="#7c3aed"
            borderStrokeWidth={1}
            borderDash={undefined}
            ignoreStroke
            enabledAnchors={[
              "top-left",
              "top-center",
              "top-right",
              "middle-left",
              "middle-right",
              "bottom-left",
              "bottom-center",
              "bottom-right",
            ]}
            // Corner anchors lock aspect ratio (Canva behaviour). Edge
            // anchors stretch a single axis. We achieve this in
            // `boundBoxFunc` because Konva's `keepRatio` is global.
            boundBoxFunc={(oldBox, newBox) => {
              // Refuse to shrink below 5×5 so anchors never collapse.
              if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
                return oldBox;
              }
              const tr = trRef.current;
              const anchor = tr?.getActiveAnchor() ?? "";
              const isCorner =
                anchor === "top-left" ||
                anchor === "top-right" ||
                anchor === "bottom-left" ||
                anchor === "bottom-right";
              if (!isCorner || oldBox.height === 0 || oldBox.width === 0) return newBox;
              // ── Stable uniform scale via DIAGONAL distance ───────
              // Earlier versions picked the dominant axis per frame
              // (`useWidth = |Δw| > |Δh|`) and snapped the other axis
              // to it. That decision flipped frame-to-frame as the
              // pointer wobbled, oscillating the dominant axis and
              // producing the visible blink/jerk during a corner drag.
              //
              // The diagonal-length scale below is monotonic in the
              // pointer's distance from the opposite corner, so it
              // only ever grows or shrinks smoothly — no flipping,
              // no jitter, and aspect ratio is preserved exactly.
              const distOld = Math.hypot(oldBox.width, oldBox.height) || 1;
              const distNew = Math.hypot(newBox.width, newBox.height);
              const scale = distNew / distOld;
              const w = Math.sign(newBox.width || 1) * Math.abs(oldBox.width) * scale;
              const h = Math.sign(newBox.height || 1) * Math.abs(oldBox.height) * scale;
              // Anchor the box at the OPPOSITE corner so the dragged
              // corner tracks the pointer rather than drifting.
              let x = newBox.x;
              let y = newBox.y;
              if (anchor === "top-left") {
                x = oldBox.x + oldBox.width - w;
                y = oldBox.y + oldBox.height - h;
              } else if (anchor === "top-right") {
                x = oldBox.x;
                y = oldBox.y + oldBox.height - h;
              } else if (anchor === "bottom-left") {
                x = oldBox.x + oldBox.width - w;
                y = oldBox.y;
              } else {
                x = oldBox.x;
                y = oldBox.y;
              }
              return { x, y, width: w, height: h, rotation: newBox.rotation };
            }}
          />
        </Layer>

        {marquee && (marquee.w > 1 || marquee.h > 1) && (
          <Layer listening={false}>
            <Rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.w}
              height={marquee.h}
              fill="rgba(75, 0, 130, 0.08)"
              stroke="#7c3aed"
              strokeWidth={1 / zoom}
              dash={[4 / zoom, 4 / zoom]}
            />
          </Layer>
        )}

        {/* Snap-guides overlay layer. Lives ABOVE the main content
            layer so guide lines render over the top of every element
            without being themselves clickable. We populate this layer
            imperatively from the dragmove handler so we don't trigger
            React re-renders at 60 fps. */}
        <Layer ref={guideLayerRef} listening={false} />
      </Stage>
      </div>
      </div>

      {/* Animation preview overlay logic lives outside the JSX. */}
      {editingEl && overlayBox && (
        <textarea
          autoFocus
          defaultValue={editingEl.text}
          onBlur={(e) => {
            updateElement(editingEl.id, { text: e.target.value });
            setEditingTextId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditingTextId(null);
          }}
          className="fixed z-50 outline-none border-2 border-amber-400 bg-white/95 rounded px-1 resize-none shadow-lg"
          style={{
            left: overlayBox.left,
            top: overlayBox.top,
            width: editingEl.width * zoom,
            fontFamily: editingEl.fontFamily,
            fontSize: editingEl.fontSize * zoom,
            lineHeight: editingEl.lineHeight,
            color: editingEl.fill,
            fontStyle: editingEl.fontStyle.includes("italic") ? "italic" : "normal",
            fontWeight: editingEl.fontStyle.includes("bold") ? 700 : 400,
            textAlign: editingEl.align,
            transform: `rotate(${editingEl.rotation}deg)`,
            transformOrigin: "top left",
            minHeight: editingEl.fontSize * zoom * editingEl.lineHeight + 4,
          }}
        />
      )}
    </div>
  );
}

/**
 * Plays a short Konva tween on a node to preview the chosen animation
 * preset. Snapshots the original transform first and always restores it
 * on tween finish so the document state is unaffected — animation is a
 * preview only, persistence is handled by `el.animation` in the store.
 */
function runAnimationPreview(node: Konva.Node, type: string) {
  // Cancel any in-flight tween/timer on this node so rapid clicks restart
  // cleanly instead of overlapping (which would leave node in odd state).
  // We attach pending state to the node via custom attrs.
  const orig = {
    x: node.x(),
    y: node.y(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    rotation: node.rotation(),
    opacity: node.opacity(),
  };
  // Reset any previously parked tween
  const prevTween = (node as any)._previewTween as Konva.Tween | undefined;
  if (prevTween) {
    try { prevTween.destroy(); } catch {}
  }

  const finish = () => {
    node.x(orig.x);
    node.y(orig.y);
    node.scaleX(orig.scaleX);
    node.scaleY(orig.scaleY);
    node.rotation(orig.rotation);
    node.opacity(orig.opacity);
    node.getLayer()?.batchDraw();
  };

  let tween: Konva.Tween | null = null;
  switch (type) {
    case "fade":
      node.opacity(0);
      tween = new Konva.Tween({
        node,
        opacity: orig.opacity,
        duration: 0.6,
        onFinish: finish,
      });
      break;
    case "slide-left":
      node.x(orig.x + 200);
      node.opacity(0);
      tween = new Konva.Tween({
        node,
        x: orig.x,
        opacity: orig.opacity,
        duration: 0.5,
        easing: Konva.Easings.EaseOut,
        onFinish: finish,
      });
      break;
    case "slide-right":
      node.x(orig.x - 200);
      node.opacity(0);
      tween = new Konva.Tween({
        node,
        x: orig.x,
        opacity: orig.opacity,
        duration: 0.5,
        easing: Konva.Easings.EaseOut,
        onFinish: finish,
      });
      break;
    case "zoom":
      node.scaleX(orig.scaleX * 0.2);
      node.scaleY(orig.scaleY * 0.2);
      node.opacity(0);
      tween = new Konva.Tween({
        node,
        scaleX: orig.scaleX,
        scaleY: orig.scaleY,
        opacity: orig.opacity,
        duration: 0.5,
        easing: Konva.Easings.BackEaseOut,
        onFinish: finish,
      });
      break;
    case "pulse": {
      // Two-stage tween: scale up briefly then back down.
      const up = new Konva.Tween({
        node,
        scaleX: orig.scaleX * 1.18,
        scaleY: orig.scaleY * 1.18,
        duration: 0.18,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
          const down = new Konva.Tween({
            node,
            scaleX: orig.scaleX,
            scaleY: orig.scaleY,
            duration: 0.22,
            easing: Konva.Easings.EaseInOut,
            onFinish: finish,
          });
          (node as any)._previewTween = down;
          down.play();
        },
      });
      tween = up;
      break;
    }
    case "bounce":
      node.y(orig.y - 80);
      node.opacity(0);
      tween = new Konva.Tween({
        node,
        y: orig.y,
        opacity: orig.opacity,
        duration: 0.6,
        easing: Konva.Easings.BounceEaseOut,
        onFinish: finish,
      });
      break;
    default:
      finish();
      return;
  }
  if (tween) {
    (node as any)._previewTween = tween;
    tween.play();
  }
}

