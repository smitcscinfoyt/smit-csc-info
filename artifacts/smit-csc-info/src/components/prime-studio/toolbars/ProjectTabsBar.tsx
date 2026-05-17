/**
 * Prime Studio — multi-document tabs bar.
 *
 * Sits directly under the TopBar and shows one chip per "open" project.
 * Clicking a chip switches the active project (auto-saving the current
 * one first); the X button closes the tab without deleting the project
 * from the My Projects library.
 *
 * Open-tabs state lives entirely in localStorage via `projectsStorage`,
 * so the same set of tabs survives reloads — Canva-style.
 */

import { useEffect, useState, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudio } from "../store";
import {
  loadAllProjects,
  type ProjectMeta,
  getActiveProjectId,
  setActiveProjectId,
  loadProject as loadStoredProject,
  saveCurrent,
  upsertProject,
  getOpenTabs,
  addOpenTab,
  removeOpenTab,
} from "../panels/projectsStorage";
import { makeBlankProject } from "../panels/projectFactory";
import { useNewDesignDialog } from "../panels/NewDesignDialog";

function snapshotThumbnail(): string {
  try {
    const cv = document.querySelector(
      '[data-testid="prime-studio-root"] canvas',
    ) as HTMLCanvasElement | null;
    return cv?.toDataURL("image/jpeg", 0.5) ?? "";
  } catch {
    return "";
  }
}

function persistCurrent() {
  try {
    const cur = useStudio.getState().exportProject();
    saveCurrent(cur, snapshotThumbnail());
  } catch {
    /* ignore */
  }
}

export function ProjectTabsBar() {
  const [tabs, setTabs] = useState<string[]>(() => getOpenTabs());
  const [activeId, setActiveIdLocal] = useState<string | null>(() =>
    getActiveProjectId(),
  );
  const [library, setLibrary] = useState<ProjectMeta[]>(() => loadAllProjects());

  // Light polling keeps the chips' titles/ordering in sync with autosaves
  // and any rename/delete actions performed in the My Projects panel.
  useEffect(() => {
    const id = setInterval(() => {
      setTabs(getOpenTabs());
      setActiveIdLocal(getActiveProjectId());
      setLibrary(loadAllProjects());
    }, 2500);
    return () => clearInterval(id);
  }, []);

  // Reflect the in-memory project's id/title immediately (no need to
  // wait for the 2.5 s poll) so a fresh "New tab" or rename feels snappy.
  const project = useStudio((s) => s.project);
  useEffect(() => {
    setTabs(getOpenTabs());
    setActiveIdLocal(getActiveProjectId());
    setLibrary(loadAllProjects());
  }, [project.id, project.title]);

  // Boot: on first mount make sure the currently-loaded project is
  // present in the open-tabs strip — otherwise the user would see an
  // empty tab bar even though a project is clearly on the canvas.
  useEffect(() => {
    const cur = useStudio.getState().project;
    if (!cur?.id) return;
    upsertProject(cur);
    addOpenTab(cur.id);
    setActiveProjectId(cur.id);
    setTabs(getOpenTabs());
    setActiveIdLocal(cur.id);
    setLibrary(loadAllProjects());
  // Run once on mount; intentionally no deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const titleFor = useCallback(
    (id: string): string => {
      if (id === project.id) return project.title || "Untitled design";
      return library.find((p) => p.id === id)?.title || "Untitled design";
    },
    [library, project.id, project.title],
  );

  const switchTo = (id: string) => {
    if (id === activeId) return;
    persistCurrent();
    const data = loadStoredProject(id);
    if (!data) {
      // Stale tab — drop it and bail.
      const next = removeOpenTab(id);
      setTabs(next);
      return;
    }
    useStudio.getState().loadProject(data);
    setActiveProjectId(id);
    setActiveIdLocal(id);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const closingActive = id === activeId;

    // Snapshot the pre-close tab order so we can pick the right-hand
    // neighbour for focus. Doing this AFTER removeOpenTab() would lose
    // the index information we need.
    const beforeTabs = getOpenTabs();
    const closedIdx = beforeTabs.indexOf(id);

    // CRITICAL: persist any unsaved edits in the active tab BEFORE we
    // tear it down, otherwise everything since the last 15 s autosave
    // tick is dropped on the floor.
    if (closingActive) persistCurrent();

    const remaining = removeOpenTab(id);

    if (closingActive) {
      // Empty strip → spin up a fresh blank doc so the canvas is never
      // abandoned (Canva-style behaviour).
      if (remaining.length === 0) {
        const blank = makeBlankProject({});
        useStudio.getState().loadProject(blank);
        upsertProject(blank);
        addOpenTab(blank.id);
        setActiveProjectId(blank.id);
        setTabs(getOpenTabs());
        setActiveIdLocal(blank.id);
        setLibrary(loadAllProjects());
        return;
      }
      // Prefer the right-hand neighbour of the closed tab; if it was
      // the last one, fall back to the new last tab (i.e. the previous
      // left-hand neighbour). `closedIdx` indexes into beforeTabs but
      // the same position in `remaining` IS the right neighbour because
      // the closed entry is gone — we just have to clamp.
      const nextIdx = Math.min(
        Math.max(closedIdx, 0),
        remaining.length - 1,
      );
      const next = remaining[nextIdx];
      const data = loadStoredProject(next);
      if (data) {
        useStudio.getState().loadProject(data);
        setActiveProjectId(next);
        setActiveIdLocal(next);
      }
    }
    setTabs(remaining);
  };

  // The "+" button no longer creates a blank tab directly — it pops the
  // size-picker dialog so the user can choose between social-media
  // presets and a custom width × height before the new tab spawns.
  // (The dialog itself funnels through `openProjectAsNewTab` which
  // handles persist + register + load.)
  const newTab = () => {
    useNewDesignDialog.getState().show();
  };

  if (tabs.length === 0) {
    // Hide the strip entirely when there's nothing to show — the bottom
    // border still rides on the TopBar's existing shadow.
    return null;
  }

  return (
    <div
      className="h-9 shrink-0 bg-purple-50 border-b border-purple-200 flex items-stretch overflow-x-auto"
      data-testid="project-tabs-bar"
      role="tablist"
      aria-label="Open projects"
    >
      {tabs.map((id) => {
        const isActive = id === activeId;
        const title = titleFor(id);
        return (
          <div
            key={id}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            onClick={() => switchTo(id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                switchTo(id);
              }
            }}
            className={cn(
              "group flex items-center gap-1.5 px-3 max-w-[180px] cursor-pointer border-r border-purple-200 select-none transition-colors",
              isActive
                ? "bg-white text-purple-950 font-semibold"
                : "text-purple-700 hover:bg-purple-100",
            )}
            data-testid={`project-tab-${id}`}
            title={title}
          >
            <span className="truncate text-xs">{title}</span>
            <button
              type="button"
              onClick={(e) => closeTab(id, e)}
              aria-label={`Close ${title}`}
              className={cn(
                "shrink-0 rounded p-0.5 transition-opacity",
                isActive
                  ? "text-purple-700 hover:bg-purple-100"
                  : "text-purple-500 opacity-60 group-hover:opacity-100 hover:bg-purple-200",
              )}
              data-testid={`project-tab-close-${id}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={newTab}
        className="px-2 text-purple-700 hover:bg-purple-100 flex items-center gap-1 text-xs font-medium"
        data-testid="project-tab-new"
        title="New tab"
        aria-label="New tab"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
