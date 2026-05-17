/**
 * Prime Studio — multi-project library persistence (localStorage).
 *
 * Centralises all read/write logic for the "My Projects" panel and the
 * autosave loop in `prime-studio.tsx`. Mirrors the original autosave
 * behaviour (image `src` stripped, oversized payloads skipped) so that
 * mobile browsers don't get OOM'd by multi-MB camera-photo data URLs.
 *
 * Storage layout
 *   `prime-studio-projects`        JSON array of `ProjectMeta`
 *   `prime-studio-active-project`  id of the currently-loaded project
 *   `prime-studio-autosave`        legacy single-project key (kept for
 *                                  backwards compatibility — written on
 *                                  every save so older code paths still
 *                                  see fresh data)
 */

import type { ProjectData } from "../types";

const PROJECTS_KEY = "prime-studio-projects";
const ACTIVE_KEY = "prime-studio-active-project";
const LEGACY_AUTOSAVE_KEY = "prime-studio-autosave";
const OPEN_TABS_KEY = "prime-studio-open-tabs";

const MAX_BYTES = 2 * 1024 * 1024;

export interface ProjectMeta {
  id: string;
  title: string;
  updatedAt: number;
  /** Data URL (jpeg) of the canvas at last save — may be empty string
   *  when the canvas is not yet rendered. */
  thumbnail: string;
  /** Full project payload with every image element's `src` stripped to
   *  "" so the JSON stays well under the localStorage quota. */
  payload: ProjectData;
}

/**
 * Session-only, in-memory cache of every project the user has touched
 * since the page loaded — keyed by project id, holding the FULL
 * `ProjectData` (image `src` URLs included).
 *
 * Why this matters: `localStorage` payloads are intentionally stripped
 * of every image `src` to keep persisted size under the 2 MB quota
 * (a single 4K camera photo as base64 is already ~7 MB). Without this
 * cache, switching to another tab and back would re-load the stripped
 * payload and the user's images / PDF page rasters / Word document
 * pages would silently vanish — devastating for PDF/DOCX/XLSX imports
 * because those projects ARE just images.
 *
 * The cache is process-local: a hard refresh wipes it, matching the
 * existing "Image files aren't stored — re-upload on reload" contract
 * shown in the My Projects panel header.
 */
const sessionCache = new Map<string, ProjectData>();

/** Cache the full, unstripped project. Called by every persist /
 *  upsert path so any subsequent `loadProject(id)` within the same
 *  session returns the version with image src intact. */
export function cacheFullProject(p: ProjectData): void {
  sessionCache.set(p.id, p);
}

function readAll(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as ProjectMeta[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: ProjectMeta[]): void {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
  } catch {
    /* quota exceeded — nothing we can do here, swallow */
  }
}

function stripImageSrc(p: ProjectData): ProjectData {
  return {
    ...p,
    pages: p.pages.map((pg) => ({
      ...pg,
      elements: pg.elements.map((el) =>
        el.type === "image" ? { ...el, src: "" } : el,
      ),
    })),
  };
}

export function loadAllProjects(): ProjectMeta[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveProjectId(id: string | null): void {
  try {
    if (id == null) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
}

/**
 * Upsert the current project into the library. Skips entirely if the
 * resulting JSON would blow past 2 MB (matches original autosave
 * behaviour). Also writes the legacy `prime-studio-autosave` key so
 * older code paths keep working.
 */
export function saveCurrent(stateProject: ProjectData, thumbnail: string): void {
  // Always cache the FULL project first — even if persistence later
  // bails (oversized JSON), the in-memory tab strip can still flip
  // back to this project without losing image src.
  cacheFullProject(stateProject);

  const lite = stripImageSrc(stateProject);
  const json = JSON.stringify(lite);
  if (json.length > MAX_BYTES) return;

  try {
    localStorage.setItem(LEGACY_AUTOSAVE_KEY, json);
  } catch {
    /* ignore */
  }

  const all = readAll();
  const idx = all.findIndex((p) => p.id === stateProject.id);
  const meta: ProjectMeta = {
    id: stateProject.id,
    title: stateProject.title || "Untitled design",
    updatedAt: Date.now(),
    thumbnail: thumbnail || (idx >= 0 ? all[idx].thumbnail : ""),
    payload: lite,
  };
  if (idx >= 0) all[idx] = meta;
  else all.push(meta);
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  writeAll(all);
  setActiveProjectId(stateProject.id);
}

export function deleteProject(id: string): void {
  // NOTE: We do NOT call URL.revokeObjectURL on this project's image
  // src URLs even though they may be blob:. Blob URLs from imported
  // PDFs/Word/Excel/images can be freely shared with:
  //   - the Uploads library (UploadedAsset.src points to the same
  //     blob URL when an upload was dragged onto a canvas), and
  //   - duplicated elements in OTHER cached projects.
  // Revoking eagerly here would silently break thumbnails / images
  // in those other surfaces. The blob is held by the browser until
  // the tab is reloaded, which is an acceptable bounded leak —
  // correctness > a few MB of unfreed memory. Proper safe revocation
  // requires per-URL ref-counting across projects + uploads + history,
  // which is a future enhancement.
  const all = readAll().filter((p) => p.id !== id);
  writeAll(all);
  sessionCache.delete(id);
  if (getActiveProjectId() === id) setActiveProjectId(null);
}

export function renameProject(id: string, newTitle: string): void {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return;
  const title = newTitle.trim() || all[idx].title;
  all[idx] = {
    ...all[idx],
    title,
    payload: { ...all[idx].payload, title },
    updatedAt: Date.now(),
  };
  writeAll(all);

  // Keep the session cache in sync with the new title — otherwise a
  // subsequent loadProject(id) would return the cached payload with
  // the OLD title and the next upsert would clobber the persisted
  // rename. Only the metadata field changes; image src URLs are
  // preserved as-is.
  const cached = sessionCache.get(id);
  if (cached) {
    sessionCache.set(id, { ...cached, title, updatedAt: Date.now() });
  }
}

export function duplicateProject(id: string): string {
  const all = readAll();
  const src = all.find((p) => p.id === id);
  if (!src) return "";
  const newId = `proj_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
  const newTitle = `${src.title} (copy)`;
  const copy: ProjectMeta = {
    ...src,
    id: newId,
    title: newTitle,
    updatedAt: Date.now(),
    payload: { ...src.payload, id: newId, title: newTitle },
  };
  all.unshift(copy);
  writeAll(all);

  // NOTE: We deliberately do NOT seed the duplicate's session cache
  // from the source. If we did, both projects would share the same
  // blob: URL strings — and `deleteProject(source)` would revoke
  // blobs the duplicate still references, breaking its images.
  // Implementing safe sharing requires per-URL ref-counting (or a
  // deep blob clone), which adds notable complexity for a duplicate
  // that already follows the existing "image content won't survive
  // a reload" contract advertised in the My Projects panel header.
  // Opening the duplicate falls back to the stripped persisted
  // payload (no image src), matching the current UX for reloads.
  return newId;
}

export function loadProject(id: string): ProjectData | null {
  // Prefer the session cache — it has full image src URLs intact and
  // therefore renders the project as the user last left it. Fall back
  // to the persisted (image-stripped) payload only if the cache is
  // empty (e.g. after a hard reload).
  const cached = sessionCache.get(id);
  if (cached) return cached;
  const all = readAll();
  const m = all.find((p) => p.id === id);
  return m ? m.payload : null;
}

/**
 * Eagerly upsert a project (with no thumbnail) into the library. Used
 * for fresh blank designs and just-imported projects so that their card
 * appears in the "My Projects" list — and their tab is clickable —
 * BEFORE the 15-second autosave loop has a chance to run.
 *
 * Unlike `saveCurrent()` this does NOT touch the active-project pointer,
 * letting the caller stay in control of the active state machine.
 */
export function upsertProject(project: ProjectData): void {
  // Mirror saveCurrent: cache the full payload up-front so even if the
  // stripped JSON exceeds the 2 MB localStorage cap, the live tab
  // strip can still load the project from memory with images intact.
  cacheFullProject(project);

  const lite = stripImageSrc(project);
  const json = JSON.stringify(lite);
  if (json.length > MAX_BYTES) return;

  const all = readAll();
  const idx = all.findIndex((p) => p.id === project.id);
  const meta: ProjectMeta = {
    id: project.id,
    title: project.title || "Untitled design",
    updatedAt: Date.now(),
    thumbnail: idx >= 0 ? all[idx].thumbnail : "",
    payload: lite,
  };
  if (idx >= 0) all[idx] = meta;
  else all.push(meta);
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  writeAll(all);
}

// ───────────────── Open-tabs (multi-document) ──────────────────────────
//
// The studio can only mount one project into the live Konva scene at a
// time, but the user can keep an arbitrary number of projects "open" —
// just like browser tabs. Switching tabs just persists the current
// scene and re-loads the target project. This keeps the in-memory
// footprint flat while giving the user the multi-document workflow they
// expect from Canva / Figma.

export function getOpenTabs(): string[] {
  try {
    const raw = localStorage.getItem(OPEN_TABS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function setOpenTabs(ids: string[]): void {
  try {
    // Dedupe but preserve order.
    const seen = new Set<string>();
    const clean: string[] = [];
    for (const id of ids) {
      if (id && !seen.has(id)) {
        seen.add(id);
        clean.push(id);
      }
    }
    localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(clean));
  } catch {
    /* ignore */
  }
}

export function addOpenTab(id: string): void {
  const cur = getOpenTabs();
  if (cur.includes(id)) return;
  setOpenTabs([...cur, id]);
}

export function removeOpenTab(id: string): string[] {
  const next = getOpenTabs().filter((x) => x !== id);
  setOpenTabs(next);
  return next;
}
