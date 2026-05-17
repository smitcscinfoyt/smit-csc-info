/**
 * Prime Studio — "My Projects" sidebar panel.
 *
 * Multi-project library backed by `projectsStorage` (localStorage).
 * Lets the user juggle multiple in-flight designs, switch between
 * them, rename / duplicate / delete, and start a fresh blank one
 * without losing the current design.
 */

import { useEffect, useRef, useState } from "react";
import {
  Plus,
  MoreVertical,
  Image as ImageIcon,
  FilePlus,
  Upload,
  ImagePlus,
  ChevronDown,
  FileText,
  FileSpreadsheet,
  FileType,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudio } from "../store";
import { uid, type ProjectData } from "../types";
import {
  loadAllProjects,
  type ProjectMeta,
  getActiveProjectId,
  setActiveProjectId,
  loadProject as loadStoredProject,
  deleteProject as deleteStoredProject,
  renameProject as renameStoredProject,
  duplicateProject as duplicateStoredProject,
  saveCurrent,
  upsertProject,
  addOpenTab,
  removeOpenTab,
} from "./projectsStorage";
import {
  makeBlankProject,
  imageFileToProject,
  pdfFileToProject,
  docxFileToProject,
  xlsxFileToProject,
  detectImportKind,
} from "./projectFactory";
import { useNewDesignDialog } from "./NewDesignDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function snapshotThumbnail(): string {
  // Best-effort: read the first <canvas> Konva painted, scale it down
  // to a JPEG data URL. Returns "" if no canvas is on the page yet.
  try {
    const cv = document.querySelector(
      '[data-testid="prime-studio-root"] canvas',
    ) as HTMLCanvasElement | null;
    return cv?.toDataURL("image/jpeg", 0.5) ?? "";
  } catch {
    return "";
  }
}

function isValidProject(x: any): x is ProjectData {
  return (
    !!x &&
    typeof x === "object" &&
    typeof x.id === "string" &&
    Array.isArray(x.pages) &&
    x.pages.every(
      (pg: any) =>
        pg &&
        typeof pg.id === "string" &&
        typeof pg.width === "number" &&
        typeof pg.height === "number" &&
        Array.isArray(pg.elements),
    )
  );
}

export function ProjectsPanel() {
  const [list, setList] = useState<ProjectMeta[]>(() => loadAllProjects());
  const [activeId, setActiveIdLocal] = useState<string | null>(() =>
    getActiveProjectId(),
  );
  // One ref per import flow so each `<input type="file">` only has its
  // own accept-list; clicking "Import PDF" mustn't open a Word picker.
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const docxInputRef = useRef<HTMLInputElement>(null);
  const xlsxInputRef = useRef<HTMLInputElement>(null);
  const anyInputRef = useRef<HTMLInputElement>(null);
  /** Truthy while a heavy import (PDF / Word / Excel rasterisation) is
   *  in flight — disables the dropdown and shows a spinner so the user
   *  doesn't double-click and queue a second import on top. */
  const [importing, setImporting] = useState<string | null>(null);
  /** Synchronous re-entrancy lock. The `importing` state setter is
   *  asynchronous (React batches it), so two file-input change events
   *  fired in the same tick can both pass an `if (importing) return`
   *  check before either flips the state. A ref flips immediately and
   *  closes that race window. */
  const importLockRef = useRef(false);

  // Light polling so timestamps stay fresh and autosaves from the
  // background loop appear without forcing the user to re-open the tab.
  useEffect(() => {
    const id = setInterval(() => {
      setList(loadAllProjects());
      setActiveIdLocal(getActiveProjectId());
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const refresh = () => {
    setList(loadAllProjects());
    setActiveIdLocal(getActiveProjectId());
  };

  const persistCurrent = () => {
    try {
      const cur = useStudio.getState().exportProject();
      saveCurrent(cur, snapshotThumbnail());
    } catch {
      /* ignore */
    }
  };

  // Common path: switch the in-memory studio to `data`, register it as
  // the active project, and add it to the open-tabs strip so the user
  // can flip between it and other docs from the top of the canvas.
  const switchToProject = (data: ProjectData) => {
    useStudio.getState().loadProject(data);
    upsertProject(data);
    addOpenTab(data.id);
    setActiveProjectId(data.id);
    refresh();
  };

  // "Blank design" now opens the size-picker dialog so the user can
  // choose dimensions before the new tab appears (instead of always
  // landing on the default 1280×720 canvas).
  const onNewBlank = () => {
    useNewDesignDialog.getState().show();
  };

  const onImportJsonClick = () => jsonInputRef.current?.click();
  const onImportImageClick = () => imageInputRef.current?.click();
  const onImportPdfClick = () => pdfInputRef.current?.click();
  const onImportDocxClick = () => docxInputRef.current?.click();
  const onImportXlsxClick = () => xlsxInputRef.current?.click();
  const onImportAnyClick = () => anyInputRef.current?.click();

  /** Internal: parse a JSON project file and switch to it. The shared
   *  lock + UI banner are managed by the caller (`importFile`) so this
   *  function can be reused without per-call lock plumbing. */
  const importJsonInternal = async (file: File): Promise<void> => {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!isValidProject(parsed)) {
      alert("That file doesn't look like a Prime Studio project.");
      return;
    }
    persistCurrent();
    // Always assign a fresh id so importing the same file twice
    // produces two independent projects (mirrors Canva's behaviour).
    const fresh: ProjectData = {
      ...parsed,
      id: uid("proj"),
      title: parsed.title || file.name.replace(/\.(primestudio\.)?json$/i, ""),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    upsertProject(fresh);
    switchToProject(fresh);
  };

  /**
   * Generic "import this file as a new project" pipeline. Routes the
   * file through the right factory in `projectFactory.ts` based on
   * extension / MIME, then funnels the resulting `ProjectData` through
   * the standard `switchToProject` path.
   *
   * `expected` lets the caller force a particular kind even when the
   * MIME is missing (mobile browsers often hand over `application/
   * octet-stream` for downloaded PDFs / DOCX / XLSX).
   */
  const importFile = async (
    file: File | null,
    expected?: "image" | "pdf" | "docx" | "xlsx" | "json",
  ) => {
    if (!file) return;
    // Re-entrancy guard: PDF/DOCX/XLSX rasterisation can run for many
    // seconds; without this a second click on another menu item would
    // queue a parallel import that races to switch the active tab.
    // The ref check is the source of truth (synchronous); the state is
    // only used to drive UI (banner + disabled menu).
    if (importLockRef.current) return;
    importLockRef.current = true;
    // Single try/finally guarantees the lock + UI banner are released
    // on EVERY exit path (json, unknown, success, error). An earlier
    // refactor leaked the lock on the unknown-extension branch.
    const labels: Record<string, string> = {
      image: "Loading image…",
      pdf: "Rendering PDF pages…",
      docx: "Rendering Word document…",
      xlsx: "Rendering spreadsheet…",
      json: "Importing project…",
    };
    let kind: ReturnType<typeof detectImportKind> | "json" =
      expected ?? detectImportKind(file);
    setImporting(labels[kind] ?? "Importing…");
    try {
      if (kind === "unknown") {
        alert(
          "Unsupported file type. Try an image, PDF, Word (.docx), Excel/CSV (.xlsx/.csv), or a Prime Studio JSON.",
        );
        return;
      }
      // Snapshot the current project once BEFORE the long async raster.
      // Belt-and-braces: we'll snapshot a SECOND time after the raster
      // completes to capture any edits the user made while waiting.
      persistCurrent();
      let proj: ProjectData | null = null;
      switch (kind) {
        case "json":
          await importJsonInternal(file);
          return; // importJsonInternal already switched to the project
        case "image":
          proj = await imageFileToProject(file);
          break;
        case "pdf":
          proj = await pdfFileToProject(file);
          break;
        case "docx":
          proj = await docxFileToProject(file);
          break;
        case "xlsx":
          proj = await xlsxFileToProject(file);
          break;
      }
      if (!proj) return;
      // Final pre-switch persist: covers the window where the user
      // dragged / typed while we were rasterising. Without this, those
      // last-second edits would be wiped by `loadProject(proj)`.
      persistCurrent();
      upsertProject(proj);
      switchToProject(proj);
    } catch (e) {
      console.error(`[Prime Studio] ${kind} import failed:`, e);
      alert(`Couldn't import that ${kind} file: ${(e as Error).message}`);
    } finally {
      setImporting(null);
      importLockRef.current = false;
    }
  };

  const onJsonFile = async (file: File | null) => {
    await importFile(file, "json");
    if (jsonInputRef.current) jsonInputRef.current.value = "";
  };
  const onImageFile = async (file: File | null) => {
    await importFile(file, "image");
    if (imageInputRef.current) imageInputRef.current.value = "";
  };
  const onPdfFile = async (file: File | null) => {
    await importFile(file, "pdf");
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  };
  const onDocxFile = async (file: File | null) => {
    await importFile(file, "docx");
    if (docxInputRef.current) docxInputRef.current.value = "";
  };
  const onXlsxFile = async (file: File | null) => {
    await importFile(file, "xlsx");
    if (xlsxInputRef.current) xlsxInputRef.current.value = "";
  };
  const onAnyFile = async (file: File | null) => {
    await importFile(file);
    if (anyInputRef.current) anyInputRef.current.value = "";
  };

  const onOpen = (id: string) => {
    // Always re-load from disk, even when the card is already active.
    // Re-clicking your own card used to silently do nothing, which made
    // the UI feel broken (the user couldn't tell whether the click had
    // registered). A no-op reload is harmless and still pulls the most
    // recent autosaved state.
    persistCurrent();
    const data = loadStoredProject(id);
    if (!data) return;
    switchToProject(data);
  };

  const onRename = (id: string) => {
    const cur = list.find((p) => p.id === id);
    const next = window.prompt("Rename project", cur?.title ?? "");
    if (next == null) return;
    const title = next.trim() || cur?.title || "Untitled";
    renameStoredProject(id, title);
    if (activeId === id) {
      const proj = useStudio.getState().exportProject();
      useStudio.getState().loadProject({ ...proj, title });
      setActiveProjectId(id);
    }
    refresh();
  };

  const onDuplicate = (id: string) => {
    duplicateStoredProject(id);
    refresh();
  };

  const onDelete = (id: string) => {
    if (!window.confirm("Delete this project? This cannot be undone.")) return;
    deleteStoredProject(id);
    removeOpenTab(id);
    if (activeId === id) {
      const blank = makeBlankProject({});
      upsertProject(blank);
      switchToProject(blank);
    }
    refresh();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-purple-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold text-purple-950">My Projects</h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                // Disabled while an import is in flight: this is the
                // FINAL guard layer. The synchronous importLockRef is
                // the source of truth, but disabling the trigger makes
                // the busy state visually obvious so the member doesn't
                // sit there clicking on a no-op menu.
                disabled={!!importing}
                className="bg-gradient-to-br from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-amber-50 h-8 px-2.5 text-xs font-semibold shadow-sm gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                data-testid="projects-new"
              >
                <Plus className="h-3.5 w-3.5" />
                {importing ? "Importing…" : "New project"}
                <ChevronDown className="h-3 w-3 opacity-80" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem
                onClick={onNewBlank}
                data-testid="projects-new-blank"
                className="gap-2"
              >
                <FilePlus className="h-3.5 w-3.5" />
                Blank design
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onImportImageClick}
                data-testid="projects-new-image"
                className="gap-2"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                Import image…
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onImportPdfClick}
                data-testid="projects-new-pdf"
                className="gap-2"
              >
                <FileText className="h-3.5 w-3.5" />
                Import PDF…
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onImportDocxClick}
                data-testid="projects-new-docx"
                className="gap-2"
              >
                <FileType className="h-3.5 w-3.5" />
                Import Word (.docx)…
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onImportXlsxClick}
                data-testid="projects-new-xlsx"
                className="gap-2"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Import Excel / Sheet…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onImportAnyClick}
                data-testid="projects-new-any"
                className="gap-2"
              >
                <Upload className="h-3.5 w-3.5" />
                Import any file…
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onImportJsonClick}
                data-testid="projects-new-import"
                className="gap-2"
              >
                <Upload className="h-3.5 w-3.5" />
                Import project (.json)…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Hidden file inputs driven by the dropdown items above. Each
              one only accepts its own type so the OS picker filters
              naturally; the "any file" picker accepts every supported
              format and uses MIME / extension sniffing to route. */}
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => onJsonFile(e.target.files?.[0] ?? null)}
            data-testid="projects-import-file-input"
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onImageFile(e.target.files?.[0] ?? null)}
            data-testid="projects-import-image-input"
          />
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => onPdfFile(e.target.files?.[0] ?? null)}
            data-testid="projects-import-pdf-input"
          />
          <input
            ref={docxInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => onDocxFile(e.target.files?.[0] ?? null)}
            data-testid="projects-import-docx-input"
          />
          <input
            ref={xlsxInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={(e) => onXlsxFile(e.target.files?.[0] ?? null)}
            data-testid="projects-import-xlsx-input"
          />
          <input
            ref={anyInputRef}
            type="file"
            accept="image/*,.pdf,.docx,.xlsx,.xls,.csv,.json,application/pdf,application/json"
            className="hidden"
            onChange={(e) => onAnyFile(e.target.files?.[0] ?? null)}
            data-testid="projects-import-any-input"
          />
        </div>
        {importing && (
          <div
            className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-300 text-[11px] font-semibold text-amber-900"
            data-testid="projects-importing-banner"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {importing}
          </div>
        )}
        <p
          className="text-[11px] text-purple-700 leading-relaxed"
          title="Image elements keep their layout but their files aren't stored — re-upload images on reload."
        >
          Auto-saves every 15 s. Image files aren't stored —
          re-upload on reload.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {list.length === 0 ? (
          <div className="text-center text-xs text-purple-600 py-10 px-4 leading-relaxed">
            No saved projects yet. Start designing — your work
            auto-saves every 15&nbsp;seconds.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {list.map((p) => {
              const isActive = activeId === p.id;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "relative rounded-lg border bg-white overflow-hidden shadow-sm transition-all hover:shadow-md",
                    isActive
                      ? "border-amber-400 ring-2 ring-amber-300/60"
                      : "border-purple-200",
                  )}
                  data-testid={`projects-card-${p.id}`}
                >
                  <button
                    type="button"
                    onClick={() => onOpen(p.id)}
                    className="block w-full text-left"
                    title={isActive ? "Currently open" : "Open project"}
                  >
                    <div className="aspect-[4/3] bg-purple-50 flex items-center justify-center overflow-hidden">
                      {p.thumbnail ? (
                        <img
                          src={p.thumbnail}
                          alt={p.title}
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <ImageIcon className="h-7 w-7 text-purple-300" />
                      )}
                    </div>
                    <div className="px-2 py-1.5">
                      <div className="text-[12px] font-semibold text-purple-950 truncate">
                        {p.title || "Untitled"}
                      </div>
                      <div className="text-[10px] text-purple-600">
                        {relativeTime(p.updatedAt)}
                      </div>
                    </div>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center text-purple-700"
                        data-testid={`projects-menu-${p.id}`}
                        aria-label="Project options"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-xs">
                      <DropdownMenuItem
                        onClick={() => onRename(p.id)}
                        data-testid={`projects-rename-${p.id}`}
                      >
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDuplicate(p.id)}
                        data-testid={`projects-duplicate-${p.id}`}
                      >
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(p.id)}
                        className="text-red-600 focus:text-red-700"
                        data-testid={`projects-delete-${p.id}`}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
