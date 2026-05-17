/**
 * Prime Studio — Zustand store.
 *
 * Single source of truth for the entire studio: pages, selection, zoom,
 * tool mode, history (undo/redo). Components subscribe via selectors so
 * only the slices they care about re-render — keeps drag/transform
 * silky-smooth even with hundreds of elements.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  DEFAULT_PAGE_H,
  DEFAULT_PAGE_W,
  type ElementData,
  type ElementId,
  type PageData,
  type ProjectData,
  uid,
} from "./types";

const HISTORY_LIMIT = 60;

export type ToolMode = "select" | "hand" | "text" | "rect" | "circle" | "line" | "arrow" | "eraser" | "draw";

/** Live settings the Artboard tab pushes down to Stage so its
 *  pointer-handlers know what colour / weight / dash to apply when
 *  committing freehand strokes or straight lines. Kept on the store
 *  so the panel can stay declarative while Stage reads via getState
 *  inside Konva event callbacks. */
export interface ArtboardToolSettings {
  drawColor: string;
  drawSize: number;
  lineWeight: number;
  lineDashed: boolean;
}

export type SidebarTab =
  | "templates"
  | "elements"
  | "text"
  | "artboard"
  | "brand"
  | "uploads"
  | "assets"
  | "tools"
  | "projects"
  | "apps"
  | "layers";

interface HistorySnapshot {
  pages: PageData[];
  activePageId: string;
}

/** Asset stored in the user's Uploads library. Persists as long as the
 *  studio is open (browser session) so switching between sidebar tabs
 *  doesn't wipe the recent-uploads grid. */
export interface UploadedAsset {
  id: string;
  src: string;        // blob URL (preferred) or data URL
  width: number;
  height: number;
  label?: string;
}

interface StudioState {
  // ── Project ────────────────────────────────────────────
  project: ProjectData;
  pages: PageData[];
  activePageId: string;

  // ── Selection / view ───────────────────────────────────
  selectedIds: ElementId[];
  toolMode: ToolMode;
  sidebarTab: SidebarTab | null;
  zoom: number; // 0.1..8
  pan: { x: number; y: number };

  // ── Uploads library (session-scoped) ───────────────────
  /** Lives in the store rather than UploadsPanel local state so the
   *  recent-uploads grid survives panel-tab switches. */
  uploads: UploadedAsset[];
  addUpload: (a: UploadedAsset) => void;
  addUploads: (a: UploadedAsset[]) => void;
  removeUpload: (id: string) => void;

  // ── Crop mode ──────────────────────────────────────────
  /** Element id currently being interactively cropped (image only).
   *  When set, the regular Transformer is hidden for this element and
   *  a CropOverlay is rendered instead. The toolbar swaps to a
   *  Done / Cancel bar. */
  cropMode: ElementId | null;
  setCropMode: (id: ElementId | null) => void;

  // ── Erase mode (image background eraser) ───────────────
  /** Element id whose pixels are currently being interactively erased.
   *  Mirrors `cropMode` semantics: when set, the regular Transformer is
   *  hidden, the ImageNode is replaced by an EraseOverlay paint UI,
   *  and the toolbar swaps to a Done / Cancel bar. */
  eraseMode: ElementId | null;
  setEraseMode: (id: ElementId | null) => void;
  /** Diameter in design-units of the eraser brush. Persisted across
   *  erase sessions so the user keeps their preferred brush size. */
  eraseBrushSize: number;
  setEraseBrushSize: (px: number) => void;

  // ── Copy / paste style (Format-painter) ────────────────
  /** Captured styling props from the most-recently style-copied element.
   *  Lives in the store (not local state) so the Brush "paste" button can
   *  be enabled across selection changes and undo/redo cycles, and so the
   *  copied snapshot survives popover open/close. Cleared when the user
   *  pastes (one-shot model) or explicitly cancels. */
  copiedStyle: Partial<ElementData> | null;
  copyStyleFrom: (id: ElementId) => void;
  applyCopiedStyleTo: (ids: ElementId[]) => void;
  clearCopiedStyle: () => void;

  // ── History ────────────────────────────────────────────
  past: HistorySnapshot[];
  future: HistorySnapshot[];

  // ── Mutations (every write that mutates pages MUST call _commit first) ─
  _commit: () => void;
  setPages: (pages: PageData[]) => void;
  setActivePage: (id: string) => void;
  addPage: () => void;
  duplicatePage: (id: string) => void;
  deletePage: (id: string) => void;
  renamePage: (id: string, name: string) => void;
  setPageBackground: (id: string, bg: string) => void;
  setPageSize: (id: string, w: number, h: number) => void;

  addElement: (el: Omit<ElementData, "id"> & { id?: ElementId }) => ElementId;
  updateElement: (id: ElementId, patch: Partial<ElementData>) => void;
  /** updateElement variant that snapshots history first — use for any
   *  user-initiated edit (toolbar buttons, panel inputs, etc). Drag and
   *  transform end-handlers commit their own snapshot via _commit() in
   *  the start callback so they should keep using updateElement. */
  commitUpdateElement: (id: ElementId, patch: Partial<ElementData>) => void;
  updateElements: (ids: ElementId[], patch: Partial<ElementData>) => void;
  commitUpdateElements: (ids: ElementId[], patch: Partial<ElementData>) => void;
  deleteElements: (ids: ElementId[]) => void;

  /** Atomically remove `oldIds` from the active page and append the
   *  given new payloads, all under a SINGLE history snapshot. Used
   *  by Artboard's table regenerator so live-syncing a 20×20 table
   *  doesn't blow out the 60-step history limit. Returns the new
   *  ids in insertion order. */
  replaceElementsBatched: (
    oldIds: ElementId[],
    additions: Array<Omit<ElementData, "id"> & { id?: ElementId }>,
  ) => ElementId[];
  duplicateElements: (ids: ElementId[]) => void;
  reorderElement: (id: ElementId, dir: "front" | "back" | "forward" | "backward") => void;
  groupElements: (ids: ElementId[]) => void;
  ungroupElements: (ids: ElementId[]) => void;

  // ── Selection ──────────────────────────────────────────
  setSelected: (ids: ElementId[]) => void;
  toggleSelected: (id: ElementId, additive?: boolean) => void;
  clearSelection: () => void;

  // ── View ───────────────────────────────────────────────
  setToolMode: (m: ToolMode) => void;
  setSidebarTab: (t: SidebarTab | null) => void;

  // ── Artboard panel — settings consumed by Stage's draw / line
  //    pointer handlers so freehand strokes and committed lines
  //    pick up the user's chosen colour, brush size, line weight
  //    and dash style from the Artboard tab.
  artboard: ArtboardToolSettings;
  setArtboardSettings: (patch: Partial<ArtboardToolSettings>) => void;
  setZoom: (z: number) => void;
  setPan: (p: { x: number; y: number }) => void;

  // ── Animation playback ────────────────────────────────
  /** Bumped whenever the user requests an animation preview. Stage
   *  subscribes to it and runs a Konva tween on the matching node. */
  lastAnimationPlay: { id: ElementId; type: string; nonce: number } | null;
  playAnimation: (id: ElementId, type: NonNullable<ElementData["animation"]>) => void;

  // ── History ────────────────────────────────────────────
  undo: () => void;
  redo: () => void;

  // ── Persistence ────────────────────────────────────────
  loadProject: (p: ProjectData) => void;
  exportProject: () => ProjectData;
}

function makeBlankPage(): PageData {
  return {
    id: uid("pg"),
    name: "Page 1",
    width: DEFAULT_PAGE_W,
    height: DEFAULT_PAGE_H,
    background: "#ffffff",
    backgroundImage: null,
    elements: [],
  };
}

function makeBlankProject(): ProjectData {
  const pg = makeBlankPage();
  return {
    id: uid("proj"),
    title: "Untitled design",
    pages: [pg],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const useStudio = create<StudioState>()(
  subscribeWithSelector((set, get) => {
    const initial = makeBlankProject();
    return {
      project: initial,
      pages: initial.pages,
      activePageId: initial.pages[0].id,
      selectedIds: [],
      toolMode: "select",
      sidebarTab: "elements",
      artboard: {
        drawColor: "#7c3aed",
        drawSize: 8,
        lineWeight: 3,
        lineDashed: false,
      },
      zoom: 0.56,
      pan: { x: 0, y: 0 },
      cropMode: null,
      setCropMode: (id) => set({ cropMode: id }),

      eraseMode: null,
      setEraseMode: (id) => set({ eraseMode: id }),
      eraseBrushSize: 40,
      setEraseBrushSize: (px) => set({ eraseBrushSize: Math.max(4, Math.min(400, px)) }),

      // ── Format-painter (copy/paste style) ─────────────────────
      copiedStyle: null,
      copyStyleFrom: (id) => {
        // Walk every page so the copy works regardless of which page
        // is currently active (multi-page rendering).
        const pages = get().pages;
        let src: ElementData | undefined;
        for (const p of pages) {
          const found = p.elements.find((e) => e.id === id);
          if (found) { src = found; break; }
        }
        if (!src) return;
        // Pick ONLY visual-styling props — never copy positional /
        // identity / type-specific content (text body, image src,
        // dimensions, position, etc). The keys below are deliberately
        // restricted to fields that make sense to clone across element
        // types AND across instances of the same type.
        const style: Partial<ElementData> = {
          opacity: src.opacity,
          shadow: src.shadow ?? null,
          cornerRadius: src.cornerRadius,
        };
        if (src.type === "text") {
          Object.assign(style, {
            fontFamily: src.fontFamily,
            fontSize: src.fontSize,
            fontStyle: src.fontStyle,
            textDecoration: src.textDecoration,
            align: src.align,
            fill: src.fill,
            lineHeight: src.lineHeight,
            letterSpacing: src.letterSpacing,
            textCase: src.textCase,
          });
        } else if (src.type === "rect" || src.type === "circle" || src.type === "line") {
          Object.assign(style, {
            stroke: src.stroke,
            strokeWidth: src.strokeWidth,
            dash: src.dash ?? null,
          });
          if (src.type !== "line") {
            (style as any).fill = (src as any).fill;
          }
        }
        set({ copiedStyle: style });
      },
      applyCopiedStyleTo: (ids) => {
        const cs = get().copiedStyle;
        if (!cs || !ids.length) return;
        // Snapshot history then apply per-target so each element only
        // receives the props that are actually valid for its type.
        // We fetch the target element to know its type — fields that
        // do not belong (e.g. lineHeight on a rect) are stripped.
        get()._commit();
        const pages = get().pages;
        for (const id of ids) {
          let target: ElementData | undefined;
          for (const p of pages) {
            const f = p.elements.find((e) => e.id === id);
            if (f) { target = f; break; }
          }
          if (!target) continue;
          const patch: Partial<ElementData> = {};
          // Universal fields
          if ("opacity" in cs) (patch as any).opacity = cs.opacity;
          if ("shadow" in cs) (patch as any).shadow = cs.shadow;
          // Type-gated fields
          if (target.type === "text") {
            for (const k of [
              "fontFamily", "fontSize", "fontStyle", "textDecoration",
              "align", "fill", "lineHeight", "letterSpacing", "textCase",
            ] as const) {
              if (k in cs) (patch as any)[k] = (cs as any)[k];
            }
          } else if (target.type === "rect" || target.type === "circle") {
            for (const k of ["fill", "stroke", "strokeWidth", "dash"] as const) {
              if (k in cs) (patch as any)[k] = (cs as any)[k];
            }
            if (target.type === "rect" && "cornerRadius" in cs) {
              (patch as any).cornerRadius = cs.cornerRadius;
            }
          } else if (target.type === "line") {
            for (const k of ["stroke", "strokeWidth", "dash"] as const) {
              if (k in cs) (patch as any)[k] = (cs as any)[k];
            }
          }
          // Apply through updateElement (no extra history snapshot —
          // we already committed once above for the whole batch).
          get().updateElement(id, patch);
        }
      },
      clearCopiedStyle: () => set({ copiedStyle: null }),

      uploads: [],
      addUpload: (a) => set((s) => ({ uploads: [...s.uploads, a] })),
      addUploads: (a) => set((s) => ({ uploads: [...s.uploads, ...a] })),
      removeUpload: (id) => set((s) => ({ uploads: s.uploads.filter((u) => u.id !== id) })),

      past: [],
      future: [],
      lastAnimationPlay: null,

      playAnimation: (id, type) => {
        // Persist the choice on the element + bump the play token so the
        // Stage's effect re-runs and tweens the live Konva node.
        get().commitUpdateElement(id, { animation: type } as Partial<ElementData>);
        const prev = get().lastAnimationPlay?.nonce ?? 0;
        set({ lastAnimationPlay: { id, type, nonce: prev + 1 } });
      },

      _commit: () => {
        const { pages, activePageId, past } = get();
        const snap: HistorySnapshot = {
          pages: JSON.parse(JSON.stringify(pages)),
          activePageId,
        };
        const next = [...past, snap].slice(-HISTORY_LIMIT);
        set({ past: next, future: [] });
      },

      setPages: (pages) => set({ pages }),
      setActivePage: (id) => set({ activePageId: id, selectedIds: [] }),

      addPage: () => {
        get()._commit();
        const { pages } = get();
        const pg: PageData = {
          ...makeBlankPage(),
          name: `Page ${pages.length + 1}`,
          width: pages[0]?.width ?? DEFAULT_PAGE_W,
          height: pages[0]?.height ?? DEFAULT_PAGE_H,
        };
        set({ pages: [...pages, pg], activePageId: pg.id, selectedIds: [] });
      },

      duplicatePage: (id) => {
        get()._commit();
        const { pages } = get();
        const src = pages.find((p) => p.id === id);
        if (!src) return;
        const idx = pages.indexOf(src);
        const copy: PageData = JSON.parse(JSON.stringify(src));
        copy.id = uid("pg");
        copy.name = `${src.name} (copy)`;
        copy.elements = copy.elements.map((e) => ({ ...e, id: uid("el") }));
        const next = [...pages.slice(0, idx + 1), copy, ...pages.slice(idx + 1)];
        set({ pages: next, activePageId: copy.id, selectedIds: [] });
      },

      deletePage: (id) => {
        const { pages } = get();
        if (pages.length <= 1) return;
        get()._commit();
        const next = pages.filter((p) => p.id !== id);
        const wasActive = get().activePageId === id;
        set({ pages: next, activePageId: wasActive ? next[0].id : get().activePageId, selectedIds: [] });
      },

      renamePage: (id, name) => {
        get()._commit();
        const next = get().pages.map((p) => (p.id === id ? { ...p, name } : p));
        set({ pages: next });
      },

      setPageBackground: (id, bg) => {
        get()._commit();
        const next = get().pages.map((p) => (p.id === id ? { ...p, background: bg } : p));
        set({ pages: next });
      },

      setPageSize: (id, width, height) => {
        get()._commit();
        const next = get().pages.map((p) => (p.id === id ? { ...p, width, height } : p));
        set({ pages: next });
      },

      addElement: (el) => {
        get()._commit();
        const id = el.id ?? uid("el");
        const elFull = { ...el, id } as ElementData;
        const { pages, activePageId } = get();
        const next = pages.map((p) =>
          p.id === activePageId ? { ...p, elements: [...p.elements, elFull] } : p,
        );
        set({ pages: next, selectedIds: [id] });
        return id;
      },

      updateElement: (id, patch) => {
        // Multi-page rendering means the user can interact with any
        // element on any page (snap, drag, transform, crop, text-edit
        // all work cross-page). Mutations therefore resolve the
        // OWNING page by id rather than relying on `activePageId` —
        // otherwise a write to a non-active-page element silently
        // no-ops, leaving the canvas visually drifted from the store.
        const { pages } = get();
        const next = pages.map((p) =>
          p.elements.some((e) => e.id === id)
            ? {
                ...p,
                elements: p.elements.map((e) =>
                  e.id === id ? ({ ...e, ...patch } as ElementData) : e,
                ),
              }
            : p,
        );
        set({ pages: next });
      },

      updateElements: (ids, patch) => {
        // Same reasoning as `updateElement`. We patch elements in-place
        // wherever they live so multi-page selections (rare but
        // possible via programmatic select) also work uniformly.
        const { pages } = get();
        const set_ = new Set(ids);
        const next = pages.map((p) => {
          if (!p.elements.some((e) => set_.has(e.id))) return p;
          return {
            ...p,
            elements: p.elements.map((e) =>
              set_.has(e.id) ? ({ ...e, ...patch } as ElementData) : e,
            ),
          };
        });
        set({ pages: next });
      },

      commitUpdateElement: (id, patch) => {
        get()._commit();
        get().updateElement(id, patch);
      },

      commitUpdateElements: (ids, patch) => {
        get()._commit();
        get().updateElements(ids, patch);
      },

      deleteElements: (ids) => {
        get()._commit();
        // Resolve owning page per element so we can delete across
        // pages in one go (multi-page rendering exposes any element
        // to keyboard / action-bar Delete regardless of active page).
        const { pages, selectedIds } = get();
        const set_ = new Set(ids);
        const next = pages.map((p) => {
          if (!p.elements.some((e) => set_.has(e.id))) return p;
          return { ...p, elements: p.elements.filter((e) => !set_.has(e.id)) };
        });
        set({
          pages: next,
          selectedIds: selectedIds.filter((id) => !set_.has(id)),
        });
      },

      replaceElementsBatched: (oldIds, additions) => {
        // ONE history snapshot for the whole delete + add cycle.
        // Without this, a 20×20 table regenerated on a slider drag
        // would push 400+ snapshots and instantly burn through the
        // HISTORY_LIMIT, leaving the user with no usable undo.
        get()._commit();
        const { pages, activePageId } = get();
        const oldSet = new Set(oldIds);
        const newIds: ElementId[] = [];
        const addedFull: ElementData[] = additions.map((el) => {
          const id = el.id ?? uid("el");
          newIds.push(id);
          return { ...el, id } as ElementData;
        });
        const next = pages.map((p) => {
          // Strip oldIds from EVERY page just in case the user
          // somehow moved tracked cells onto another page (drag-
          // across-pages doesn't exist today but defensive). The
          // additions only land on the active page.
          const hasOld = p.elements.some((e) => oldSet.has(e.id));
          if (p.id === activePageId) {
            const filtered = hasOld
              ? p.elements.filter((e) => !oldSet.has(e.id))
              : p.elements;
            return { ...p, elements: [...filtered, ...addedFull] };
          }
          if (hasOld) {
            return {
              ...p,
              elements: p.elements.filter((e) => !oldSet.has(e.id)),
            };
          }
          return p;
        });
        set({ pages: next, selectedIds: newIds });
        return newIds;
      },

      duplicateElements: (ids) => {
        get()._commit();
        // Duplicate within EACH owning page so the clones land on the
        // same page as their originals (Canva behaviour). A multi-
        // page selection therefore produces clones on the right pages
        // rather than collapsing them onto activePage.
        const { pages } = get();
        const set_ = new Set(ids);
        const newIds: ElementId[] = [];
        // Group remap is shared across pages so two members of the
        // same group always remap to the same new groupId, even when
        // they live on different pages.
        const groupRemap = new Map<string, string>();
        const next = pages.map((p) => {
          if (!p.elements.some((e) => set_.has(e.id))) return p;
          const adds: ElementData[] = [];
          for (const e of p.elements) {
            if (!set_.has(e.id)) continue;
            const clone: ElementData = JSON.parse(JSON.stringify(e));
            clone.id = uid("el");
            clone.x += 16;
            clone.y += 16;
            if (clone.groupId) {
              const remapped = groupRemap.get(clone.groupId) ?? uid("grp");
              groupRemap.set(clone.groupId, remapped);
              clone.groupId = remapped;
            }
            adds.push(clone);
            newIds.push(clone.id);
          }
          return { ...p, elements: [...p.elements, ...adds] };
        });
        set({ pages: next, selectedIds: newIds });
      },

      reorderElement: (id, dir) => {
        get()._commit();
        // Z-ordering operates within the element's OWNING page (it
        // doesn't make geometric sense to "bring forward" past
        // another page's elements). We locate that page by id.
        const { pages } = get();
        const next = pages.map((p) => {
          if (!p.elements.some((e) => e.id === id)) return p;
          const arr = [...p.elements];
          const idx = arr.findIndex((e) => e.id === id);
          if (idx < 0) return p;
          const [el] = arr.splice(idx, 1);
          let to = idx;
          if (dir === "front") to = arr.length;
          else if (dir === "back") to = 0;
          else if (dir === "forward") to = Math.min(arr.length, idx + 1);
          else to = Math.max(0, idx - 1);
          arr.splice(to, 0, el);
          return { ...p, elements: arr };
        });
        set({ pages: next });
      },

      groupElements: (ids) => {
        if (ids.length < 2) return;
        get()._commit();
        const grp = uid("grp");
        get().updateElements(ids, { groupId: grp } as Partial<ElementData>);
      },

      ungroupElements: (ids) => {
        get()._commit();
        get().updateElements(ids, { groupId: null } as Partial<ElementData>);
      },

      setSelected: (ids) => set({ selectedIds: ids }),
      toggleSelected: (id, additive) => {
        const cur = get().selectedIds;
        if (!additive) {
          set({ selectedIds: cur.length === 1 && cur[0] === id ? [] : [id] });
          return;
        }
        set({
          selectedIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
        });
      },
      clearSelection: () => set({ selectedIds: [] }),

      setToolMode: (m) => set({ toolMode: m }),
      setSidebarTab: (t) => set({ sidebarTab: t }),
      setArtboardSettings: (patch) =>
        set((s) => ({ artboard: { ...s.artboard, ...patch } })),
      setZoom: (z) => set({ zoom: Math.min(8, Math.max(0.1, z)) }),
      setPan: (p) => set({ pan: p }),

      undo: () => {
        const { past, pages, activePageId, future } = get();
        if (!past.length) return;
        const prev = past[past.length - 1];
        const cur: HistorySnapshot = {
          pages: JSON.parse(JSON.stringify(pages)),
          activePageId,
        };
        set({
          past: past.slice(0, -1),
          future: [...future, cur].slice(-HISTORY_LIMIT),
          pages: prev.pages,
          activePageId: prev.activePageId,
          selectedIds: [],
        });
      },

      redo: () => {
        const { future, pages, activePageId, past } = get();
        if (!future.length) return;
        const nxt = future[future.length - 1];
        const cur: HistorySnapshot = {
          pages: JSON.parse(JSON.stringify(pages)),
          activePageId,
        };
        set({
          future: future.slice(0, -1),
          past: [...past, cur].slice(-HISTORY_LIMIT),
          pages: nxt.pages,
          activePageId: nxt.activePageId,
          selectedIds: [],
        });
      },

      loadProject: (p) => {
        set({
          project: p,
          pages: p.pages,
          activePageId: p.pages[0]?.id ?? "",
          selectedIds: [],
          past: [],
          future: [],
        });
      },

      exportProject: () => {
        const { project, pages } = get();
        return { ...project, pages, updatedAt: Date.now() };
      },
    };
  }),
);

/** Convenience selector: the currently-active page object. */
export const useActivePage = () =>
  useStudio((s) => s.pages.find((p) => p.id === s.activePageId) ?? s.pages[0]);

/** Convenience selector: list of currently-selected element IDs (ref-stable
 *  per change). Components only re-render when the selection set changes. */
export const useSelected = () => useStudio((s) => s.selectedIds);
