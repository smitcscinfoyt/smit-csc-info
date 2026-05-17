/**
 * Prime Studio — Canva-style graphic-design tool. Konva-powered scene
 * graph + Zustand state. Mobile-first layout with collapsible sidebar.
 */

import { useEffect, useRef, useState } from "react";
// @ts-expect-error — fontfaceobserver ships no .d.ts
import FontFaceObserver from "fontfaceobserver";
import { TopBar } from "@/components/prime-studio/toolbars/TopBar";
import { LeftSidebar } from "@/components/prime-studio/panels/LeftSidebar";
import { PanelHost } from "@/components/prime-studio/panels/PanelHost";
import { StudioStage } from "@/components/prime-studio/Stage";
import { ContextualToolbar } from "@/components/prime-studio/toolbars/ContextualToolbar";
import { ErasePanel } from "@/components/prime-studio/panels/ErasePanel";
import { ElementActionBar } from "@/components/prime-studio/toolbars/ElementActionBar";
import { RotateHandle } from "@/components/prime-studio/toolbars/RotateHandle";
import { PageToolbar } from "@/components/prime-studio/toolbars/PageToolbar";
import { PagesBar } from "@/components/prime-studio/toolbars/PagesBar";
import { ProjectTabsBar } from "@/components/prime-studio/toolbars/ProjectTabsBar";
import { NewDesignDialog } from "@/components/prime-studio/panels/NewDesignDialog";
import { useStudio } from "@/components/prime-studio/store";
import {
  saveCurrent as saveCurrentProject,
  loadProject as loadStoredProject,
  getActiveProjectId,
  setActiveProjectId,
  addOpenTab,
} from "@/components/prime-studio/panels/projectsStorage";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const FONTS_TO_PRELOAD = [
  "Poppins",
  "Inter",
  "Montserrat",
  "Playfair Display",
  "Noto Sans Gujarati",
  "Bebas Neue",
];

export default function PrimeStudioPage() {
  const containerRef = useRef<HTMLDivElement>(null!);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const deleteElements = useStudio((s) => s.deleteElements);
  const duplicateElements = useStudio((s) => s.duplicateElements);
  const selectedIds = useStudio((s) => s.selectedIds);
  const activePageId = useStudio((s) => s.activePageId);
  const setPageSize = useStudio((s) => s.setPageSize);
  const pages = useStudio((s) => s.pages);
  const cropMode = useStudio((s) => s.cropMode);
  const setCropMode = useStudio((s) => s.setCropMode);
  const commitUpdateElement = useStudio((s) => s.commitUpdateElement);
  const [resizeOpen, setResizeOpen] = useState(false);
  // Page dimensions are ALWAYS stored as pixels in the store (Konva
  // coordinates). The dialog accepts the user's chosen physical unit
  // and converts to/from px at the boundary. 96 DPI is the CSS / web
  // standard so 1 in == 96 px (matches Canva's print sizing).
  const [customW, setCustomW] = useState(1280);
  const [customH, setCustomH] = useState(720);
  const [unit, setUnit] = useState<"px" | "in" | "mm" | "cm" | "pt">("px");
  const [fontsReady, setFontsReady] = useState(false);

  // Inject Google Fonts <link> + wait for them so Konva text renders crisp.
  useEffect(() => {
    const id = "prime-studio-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&family=Inter:wght@400;600;700&family=Montserrat:wght@400;600;700&family=Playfair+Display:wght@400;700&family=Lora:wght@400;700&family=Roboto:wght@400;700&family=Noto+Sans+Gujarati:wght@400;700&family=Shrikhand&family=Bebas+Neue&display=swap";
      document.head.appendChild(link);
    }
    Promise.allSettled(FONTS_TO_PRELOAD.map((f) => new FontFaceObserver(f).load(null, 8000)))
      .then(() => setFontsReady(true));
  }, []);

  // Keyboard shortcuts — only when not focused on an input/textarea.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) {
        return;
      }
      // Crop-mode shortcuts take priority over everything else: Enter
      // commits, Escape cancels. This mirrors Canva / Photoshop muscle
      // memory and avoids forcing the user to chase the on-screen
      // Done button (especially valuable on a small mobile viewport).
      if (cropMode) {
        if (e.key === "Enter") {
          e.preventDefault();
          const fn = (window as any).__primeStudioCropCommit as
            | (() => Partial<import("@/components/prime-studio/types").ImageElement> | null)
            | undefined;
          const patch = fn?.();
          if (patch) {
            commitUpdateElement(cropMode, patch as any);
          }
          setCropMode(null);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setCropMode(null);
          return;
        }
        // Don't fall through to Delete/Backspace/Ctrl+Z while cropping —
        // those shouldn't mutate the element under crop.
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length) {
          e.preventDefault();
          deleteElements(selectedIds);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        if (selectedIds.length) {
          e.preventDefault();
          duplicateElements(selectedIds);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, selectedIds, deleteElements, duplicateElements, cropMode, setCropMode, commitUpdateElement]);

  // Restore the most recently active project on first mount, if any.
  // The actual storage / size guards live in `projectsStorage`. This
  // runs ONCE — switching projects after this point is owned by the
  // ProjectsPanel and the ProjectTabsBar.
  useEffect(() => {
    try {
      const activeId = getActiveProjectId();
      if (!activeId) return;
      const data = loadStoredProject(activeId);
      if (data) {
        useStudio.getState().loadProject(data);
        // Seed the tab strip with the just-restored project so the user
        // sees their work represented as an open tab from the very first
        // paint (otherwise the bar would only repopulate on next focus).
        addOpenTab(activeId);
      }
    } catch {
      /* corrupt storage — ignore and start blank */
    }
  }, []);

  // Auto-save to localStorage every 15 s.
  //
  // Delegates the heavy lifting (image-src strip, 2 MB quota guard,
  // legacy `prime-studio-autosave` key, multi-project upsert) to
  // `projectsStorage.saveCurrent`. The thumbnail is grabbed by reading
  // the first <canvas> element Konva painted into the stage container —
  // returns `""` when the canvas isn't ready yet, which `saveCurrent`
  // tolerates by keeping the previous thumbnail.
  useEffect(() => {
    const id = setInterval(() => {
      try {
        const proj = useStudio.getState().exportProject();
        const cv = containerRef.current?.querySelector("canvas") as
          | HTMLCanvasElement
          | null;
        let thumbnail = "";
        try {
          thumbnail = cv?.toDataURL("image/jpeg", 0.5) ?? "";
        } catch {
          thumbnail = "";
        }
        saveCurrentProject(proj, thumbnail);
        // Make sure the active-project pointer always tracks the project
        // currently in the store (e.g. after `loadProject(blank)` from
        // the Projects panel).
        if (getActiveProjectId() !== proj.id) {
          setActiveProjectId(proj.id);
        }
      } catch {
        /* quota / serialization — silently ignore */
      }
    }, 15000);
    return () => clearInterval(id);
  }, []);

  // ── Unit conversion (CSS / web standard, 96 DPI) ─────────────────
  const PX_PER_UNIT: Record<typeof unit, number> = {
    px: 1,
    in: 96,
    cm: 37.7952755,
    mm: 3.77952755,
    pt: 1.3333333,
  } as const;
  const toDisplay = (px: number) => {
    const v = px / PX_PER_UNIT[unit];
    // px stays integer; physical units round to 2 decimals.
    return unit === "px" ? Math.round(v) : Math.round(v * 100) / 100;
  };
  const toPx = (val: number) => Math.round(val * PX_PER_UNIT[unit]);

  const applyResize = () => {
    setPageSize(activePageId, Math.max(50, customW), Math.max(50, customH));
    setResizeOpen(false);
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-purple-950" data-testid="prime-studio-root">
      <TopBar onResize={() => {
        const cur = pages.find((p) => p.id === activePageId);
        if (cur) {
          setCustomW(cur.width);
          setCustomH(cur.height);
        }
        setResizeOpen(true);
      }} />

      <ProjectTabsBar />
      <NewDesignDialog />

      <div className="flex-1 flex overflow-hidden">
        <LeftSidebar />
        <PanelHost />
        <div className="flex-1 relative overflow-hidden" ref={containerRef}>
          <StudioStage containerRef={containerRef} />
          <PageToolbar
            onResize={() => {
              const cur = pages.find((p) => p.id === activePageId);
              if (cur) {
                setCustomW(cur.width);
                setCustomH(cur.height);
              }
              setResizeOpen(true);
            }}
          />
          <ContextualToolbar containerRef={containerRef} />
          {/* Floating brush-size panel that appears on the right while
              eraseMode is active. Self-hides when the user exits erase. */}
          <ErasePanel />
          {/* Canva-style floating bar (lock / group / duplicate / delete)
              that hugs the bottom of the selection. The matching icons
              were removed from the top contextual toolbar. */}
          <ElementActionBar containerRef={containerRef} />
          {/* Custom rotate handle on the RIGHT of the selection. We
              disable Konva's built-in top-centre rotate anchor so this
              is the only rotate UI (Canva parity). */}
          <RotateHandle containerRef={containerRef} />
          {!fontsReady && (
            <div className="absolute top-16 right-2 bg-amber-100 text-amber-900 text-xs px-2 py-1 rounded shadow">
              Loading fonts…
            </div>
          )}
        </div>
      </div>

      <PagesBar />

      <Dialog open={resizeOpen} onOpenChange={setResizeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Resize current page</DialogTitle>
            <DialogDescription>
              Choose a unit (px, in, mm, cm, pt) and enter the page
              dimensions. The Templates panel still has common sizes
              (Instagram, A4, etc) one click away.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 py-2">
            <label className="text-sm col-span-1">
              Width
              <input
                type="number"
                step={unit === "px" ? 1 : 0.01}
                value={toDisplay(customW)}
                onChange={(e) => setCustomW(toPx(+e.target.value || 0))}
                className="mt-1 w-full border border-purple-300 rounded px-2 py-1.5"
                data-testid="page-resize-width"
              />
            </label>
            <label className="text-sm col-span-1">
              Height
              <input
                type="number"
                step={unit === "px" ? 1 : 0.01}
                value={toDisplay(customH)}
                onChange={(e) => setCustomH(toPx(+e.target.value || 0))}
                className="mt-1 w-full border border-purple-300 rounded px-2 py-1.5"
                data-testid="page-resize-height"
              />
            </label>
            <label className="text-sm col-span-1">
              Unit
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as typeof unit)}
                className="mt-1 w-full border border-purple-300 rounded px-2 py-1.5 bg-white"
                data-testid="page-resize-unit"
              >
                <option value="px">px</option>
                <option value="in">in</option>
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="pt">pt</option>
              </select>
            </label>
          </div>
          <div className="text-xs text-purple-700 -mt-1 mb-1">
            Stored as {customW} × {customH} px (96 DPI).
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setResizeOpen(false)}>Cancel</Button>
            <Button className="bg-purple-700 hover:bg-purple-800" onClick={applyResize} data-testid="page-resize-apply">Resize</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
