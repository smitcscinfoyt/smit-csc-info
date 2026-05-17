import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Upload,
  X,
  Plus,
  FileText,
  Image as ImageIcon,
  RotateCcw,
  RotateCw,
  Trash2,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  Files as FilesIcon,
  FileStack,
  Settings2,
  Download,
  ArrowDownAZ,
  ArrowUpZA,
  Shuffle,
  GripVertical,
  Sparkles,
  Layers,
  CheckSquare,
  Square,
} from "lucide-react";
import {
  PDFDocument,
  degrees,
  StandardFonts,
  rgb,
  PageSizes,
} from "pdf-lib";
import {
  PrimeToolShell,
  GoldButton,
  GoldLoader,
} from "@/components/tools/prime-tool-shell";
import { getTool } from "@/components/tools/tools-data";
import { renderThumbnails, type PageThumb } from "@/lib/tools/pdf-tools";
import { downloadBlob, formatBytes } from "@/lib/tools/file";

type ItemKind = "pdf" | "image" | "blank";
type ViewMode = "files" | "pages";
type BookmarkMode = "keep" | "discard" | "perDoc" | "groupPerDoc";
type TocMode = "none" | "filenames" | "titles";
type FormFieldsMode = "discard" | "merge" | "rename" | "flatten";

interface MergeItem {
  id: string;
  name: string;
  size: number;
  kind: ItemKind;
  file: File | null; // null for blank pages
  pageCount: number;
  thumbs: PageThumb[]; // first thumb for image, all for PDF
  rotation: number; // applied to whole file in Files view (0/90/180/270)
  blankSizePt?: [number, number]; // for "blank" kind only
}

interface PageEntry {
  uid: string; // unique id for DnD
  itemId: string;
  pageIndex: number;
  rotation: number; // per-page rotation override (0/90/180/270)
}

const BASE_THUMB_W = 150;
const A4_PT: [number, number] = [595.28, 841.89];
const uid = () => Math.random().toString(36).slice(2, 10);

export default function MergePdfPage() {
  const tool = getTool("merge-pdf")!;
  const [items, setItems] = useState<MergeItem[]>([]);
  const [pages, setPages] = useState<PageEntry[]>([]);
  const [view, setView] = useState<ViewMode>("files");
  const [zoom, setZoom] = useState(100);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  // Sejda-style options
  const [doubleSided, setDoubleSided] = useState(false);
  const [sameSize, setSameSize] = useState(false);
  const [coverFirst, setCoverFirst] = useState(false);
  const [filenameFooter, setFilenameFooter] = useState(false);
  const [bookmarkMode, setBookmarkMode] = useState<BookmarkMode>("keep");
  const [tocMode, setTocMode] = useState<TocMode>("none");
  const [formFieldsMode, setFormFieldsMode] =
    useState<FormFieldsMode>("rename");

  // Dropdowns
  const [openMenu, setOpenMenu] = useState<
    "addFiles" | "addPages" | "reorder" | null
  >(null);
  const fileInputPdfRef = useRef<HTMLInputElement>(null);
  const fileInputImgRef = useRef<HTMLInputElement>(null);

  // DnD state
  const dragSrc = useRef<{ type: "file" | "page"; index: number } | null>(
    null,
  );
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // Outside click for menus
  useEffect(() => {
    if (!openMenu) return;
    const handler = () => setOpenMenu(null);
    const t = setTimeout(() => window.addEventListener("click", handler), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", handler);
    };
  }, [openMenu]);

  // When items change, rebuild Pages list while preserving manual reorders
  useEffect(() => {
    setPages((prev) => {
      const itemMap = new Map(items.map((it) => [it.id, it]));
      // Keep existing pages whose item still exists & page index valid
      const kept = prev.filter((p) => {
        const it = itemMap.get(p.itemId);
        return !!it && p.pageIndex < it.pageCount;
      });
      // Add new pages for items that don't have any entries yet
      const have = new Set(kept.map((p) => p.itemId));
      const additions: PageEntry[] = [];
      for (const it of items) {
        if (!have.has(it.id)) {
          for (let i = 0; i < it.pageCount; i++) {
            additions.push({
              uid: uid(),
              itemId: it.id,
              pageIndex: i,
              rotation: 0,
            });
          }
        }
      }
      return [...kept, ...additions];
    });
  }, [items]);

  // ───────────────────────── File ingestion ─────────────────────────

  const ingestFiles = async (fl: FileList | File[]) => {
    const arr = Array.from(fl);
    if (!arr.length) return;
    setError(null);
    setBusy(true);
    setProgress(0);
    setProgressLabel("Files load કરી રહ્યા છીએ…");
    const newItems: MergeItem[] = [];
    let i = 0;
    for (const f of arr) {
      i++;
      setProgress((i / arr.length) * 100);
      try {
        if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
          const t = await renderThumbnails(f, 200);
          newItems.push({
            id: uid(),
            name: f.name,
            size: f.size,
            kind: "pdf",
            file: f,
            pageCount: t.length,
            thumbs: t,
            rotation: 0,
          });
        } else if (f.type.startsWith("image/")) {
          const dataUrl = await fileToDataUrl(f);
          const dim = await imageDim(dataUrl);
          newItems.push({
            id: uid(),
            name: f.name,
            size: f.size,
            kind: "image",
            file: f,
            pageCount: 1,
            thumbs: [
              {
                index: 0,
                dataUrl,
                width: dim.w,
                height: dim.h,
              },
            ],
            rotation: 0,
          });
        }
      } catch {
        // skip unreadable
      }
    }
    setItems((prev) => [...prev, ...newItems]);
    setBusy(false);
    setProgress(0);
    setProgressLabel("");
  };

  const addBlankPage = (size: "a4-p" | "a4-l" | "letter" = "a4-p") => {
    const dims: [number, number] =
      size === "a4-p"
        ? A4_PT
        : size === "a4-l"
        ? [A4_PT[1], A4_PT[0]]
        : (PageSizes.Letter as unknown as [number, number]);
    const w = 200;
    const h = Math.round((dims[1] / dims[0]) * w);
    const blank = blankThumb(w, h);
    setItems((prev) => [
      ...prev,
      {
        id: uid(),
        name: `Blank-${size.toUpperCase()}.pdf`,
        size: 0,
        kind: "blank",
        file: null,
        pageCount: 1,
        thumbs: [{ index: 0, dataUrl: blank, width: w, height: h }],
        rotation: 0,
        blankSizePt: dims,
      },
    ]);
  };

  // ───────────────────────── File ops ─────────────────────────

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };
  const rotateItem = (id: string, dir: -90 | 90) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, rotation: (it.rotation + dir + 360) % 360 } : it,
      ),
    );
  };
  const duplicateItem = (id: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id);
      if (idx < 0) return prev;
      const src = prev[idx];
      const copy: MergeItem = { ...src, id: uid() };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const reorderItems = (from: number, to: number) => {
    if (from === to) return;
    setItems((prev) => {
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  };

  const sortItems = (mode: "az" | "za" | "reverse" | "shuffle") => {
    setItems((prev) => {
      const next = [...prev];
      if (mode === "az") next.sort((a, b) => a.name.localeCompare(b.name));
      else if (mode === "za") next.sort((a, b) => b.name.localeCompare(a.name));
      else if (mode === "reverse") next.reverse();
      else {
        for (let i = next.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [next[i], next[j]] = [next[j], next[i]];
        }
      }
      return next;
    });
  };

  // ───────────────────────── Pages ops ─────────────────────────

  const reorderPages = (from: number, to: number) => {
    if (from === to) return;
    setPages((prev) => {
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  };
  const removePage = (uidStr: string) => {
    setPages((prev) => prev.filter((p) => p.uid !== uidStr));
  };
  const rotatePage = (uidStr: string, dir: -90 | 90) => {
    setPages((prev) =>
      prev.map((p) =>
        p.uid === uidStr
          ? { ...p, rotation: (p.rotation + dir + 360) % 360 }
          : p,
      ),
    );
  };

  const totalPages = useMemo(
    () => items.reduce((sum, it) => sum + it.pageCount, 0),
    [items],
  );
  const livePagesCount = view === "pages" ? pages.length : totalPages;

  // ───────────────────────── Merge ─────────────────────────

  const merge = async () => {
    if (items.length < 1) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    setProgressLabel("Pages merge કરી રહ્યા છીએ…");

    try {
      const out = await PDFDocument.create();
      const helv = await out.embedFont(StandardFonts.Helvetica);

      // Load all source PDFs once
      const srcCache = new Map<string, PDFDocument>();
      for (const it of items) {
        if (it.kind === "pdf" && it.file) {
          const bytes = new Uint8Array(await it.file.arrayBuffer());
          srcCache.set(
            it.id,
            await PDFDocument.load(bytes, { ignoreEncryption: true }),
          );
        }
      }

      // Working order: Pages view uses live page list; Files view = items in order
      const work: PageEntry[] =
        view === "pages"
          ? pages.slice()
          : items.flatMap((it) =>
              Array.from({ length: it.pageCount }, (_, i) => ({
                uid: uid(),
                itemId: it.id,
                pageIndex: i,
                rotation: 0,
              })),
            );

      // Optional: cover-first reorders item[0] pages to absolute beginning
      const ordered: PageEntry[] = (() => {
        if (!coverFirst || items.length === 0) return work;
        const firstId = items[0].id;
        return [
          ...work.filter((w) => w.itemId === firstId),
          ...work.filter((w) => w.itemId !== firstId),
        ];
      })();

      // Common size detection (Same size option)
      let commonSize: [number, number] | null = null;
      if (sameSize) {
        for (const w of ordered) {
          const it = items.find((x) => x.id === w.itemId);
          if (it?.kind === "pdf") {
            const src = srcCache.get(it.id);
            if (src) {
              const p = src.getPage(w.pageIndex);
              commonSize = [p.getWidth(), p.getHeight()];
              break;
            }
          }
        }
        if (!commonSize) commonSize = A4_PT;
      }

      // Track item-id per output page index (for footer alignment after blank padding)
      const pageItemIds: string[] = [];

      // Group ordered list by item segment so we know where blanks go
      const segments: { itemId: string; entries: PageEntry[] }[] = [];
      for (const w of ordered) {
        const last = segments[segments.length - 1];
        if (last && last.itemId === w.itemId) last.entries.push(w);
        else segments.push({ itemId: w.itemId, entries: [w] });
      }

      const totalEntries = ordered.length;
      let processed = 0;

      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si];
        const it = items.find((x) => x.id === seg.itemId);
        if (!it) continue;

        for (const w of seg.entries) {
          const rot = (it.rotation + w.rotation) % 360;

          if (it.kind === "pdf" && it.file) {
            const src = srcCache.get(it.id)!;
            const [copied] = await out.copyPages(src, [w.pageIndex]);
            const existing = copied.getRotation().angle ?? 0;
            if (rot) copied.setRotation(degrees((existing + rot) % 360));
            if (commonSize) copied.setSize(commonSize[0], commonSize[1]);
            out.addPage(copied);
          } else if (it.kind === "image" && it.file) {
            // Normalise to PNG/JPG via canvas (handles WEBP, rotation safely)
            const { bytes, mime, w: imgW, h: imgH } = await prepareImage(
              it.file,
              rot,
            );
            const img =
              mime === "image/png"
                ? await out.embedPng(bytes)
                : await out.embedJpg(bytes);
            const [pw, ph] = commonSize ?? A4_PT;
            const page = out.addPage([pw, ph]);
            const margin = 24;
            const r = Math.min(
              (pw - margin * 2) / imgW,
              (ph - margin * 2) / imgH,
            );
            const dw = imgW * r;
            const dh = imgH * r;
            page.drawImage(img, {
              x: (pw - dw) / 2,
              y: (ph - dh) / 2,
              width: dw,
              height: dh,
            });
          } else if (it.kind === "blank") {
            const sz = commonSize ?? it.blankSizePt ?? A4_PT;
            out.addPage(sz);
          }
          pageItemIds.push(it.id);
          processed++;
          setProgress((processed / totalEntries) * 90);
        }

        // Double-sided pad: each segment ends on even page (except last)
        if (
          doubleSided &&
          seg.entries.length % 2 === 1 &&
          si < segments.length - 1
        ) {
          out.addPage(commonSize ?? A4_PT);
          pageItemIds.push("__blank__");
        }
      }

      // Footer (filename centered at bottom)
      if (filenameFooter) {
        const totalOut = out.getPageCount();
        for (let p = 0; p < totalOut; p++) {
          const itemId = pageItemIds[p];
          if (!itemId || itemId === "__blank__") continue;
          const it = items.find((x) => x.id === itemId);
          if (!it) continue;
          const name = it.name.length > 80 ? it.name.slice(0, 77) + "…" : it.name;
          const page = out.getPage(p);
          const { width } = page.getSize();
          const fontSize = 8;
          const tw = helv.widthOfTextAtSize(name, fontSize);
          page.drawText(name, {
            x: (width - tw) / 2,
            y: 14,
            size: fontSize,
            font: helv,
            color: rgb(0.4, 0.4, 0.4),
          });
        }
      }

      setProgress(95);
      const saved = await out.save();
      const blob = new Blob([saved as unknown as ArrayBuffer], {
        type: "application/pdf",
      });
      downloadBlob(blob, makeFilename(items));
      setProgress(100);
    } catch (e: any) {
      console.error(e);
      setError(
        "Merge fail થયું — એક અથવા વધુ files encrypted/corrupted છે.",
      );
    } finally {
      setBusy(false);
      setProgressLabel("");
      setTimeout(() => setProgress(0), 800);
    }
  };

  // ───────────────────────── UI helpers ─────────────────────────

  const thumbW = Math.round((BASE_THUMB_W * zoom) / 100);

  return (
    <PrimeToolShell tool={tool}>
      <div className="space-y-5">
        {/* Hidden inputs */}
        <input
          ref={fileInputPdfRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) ingestFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={fileInputImgRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) ingestFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {/* Empty state */}
        {items.length === 0 && (
          <DropZoneCard onFiles={ingestFiles} />
        )}

        {/* Toolbar */}
        {items.length > 0 && (
          <div className="rounded-2xl border border-amber-300/30 bg-purple-950/40 backdrop-blur p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* View toggle */}
              <div className="inline-flex rounded-xl border border-amber-300/30 bg-purple-950/60 p-1">
                <button
                  onClick={() => setView("pages")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition ${
                    view === "pages"
                      ? "bg-amber-300 text-purple-950"
                      : "text-amber-200/80 hover:text-amber-100"
                  }`}
                  data-testid="view-pages"
                >
                  <Layers className="h-3.5 w-3.5" /> Pages view
                </button>
                <button
                  onClick={() => setView("files")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition ${
                    view === "files"
                      ? "bg-amber-300 text-purple-950"
                      : "text-amber-200/80 hover:text-amber-100"
                  }`}
                  data-testid="view-files"
                >
                  <FilesIcon className="h-3.5 w-3.5" /> Files view
                </button>
              </div>

              {/* Zoom */}
              <div className="flex items-center gap-2 text-amber-200">
                <button
                  onClick={() => setZoom((z) => Math.max(50, z - 25))}
                  disabled={zoom <= 50}
                  className="rounded-lg p-1.5 hover:bg-amber-300/10 disabled:opacity-40"
                  aria-label="Zoom out"
                  data-testid="zoom-out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <input
                  type="range"
                  min={50}
                  max={200}
                  step={25}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-32 accent-amber-400"
                  data-testid="zoom-slider"
                />
                <button
                  onClick={() => setZoom((z) => Math.min(200, z + 25))}
                  disabled={zoom >= 200}
                  className="rounded-lg p-1.5 hover:bg-amber-300/10 disabled:opacity-40"
                  aria-label="Zoom in"
                  data-testid="zoom-in"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <span className="text-xs font-mono text-amber-200/80 w-10 text-right">
                  {zoom}%
                </span>
              </div>
            </div>

            {/* Action buttons row */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <DropdownButton
                label="Add Files"
                icon={<Plus className="h-4 w-4" />}
                open={openMenu === "addFiles"}
                onToggle={() =>
                  setOpenMenu(openMenu === "addFiles" ? null : "addFiles")
                }
              >
                <MenuItem
                  icon={<FileText className="h-4 w-4" />}
                  onClick={() => {
                    setOpenMenu(null);
                    fileInputPdfRef.current?.click();
                  }}
                  testId="menu-add-pdf"
                >
                  PDF files…
                </MenuItem>
                <MenuItem
                  icon={<ImageIcon className="h-4 w-4" />}
                  onClick={() => {
                    setOpenMenu(null);
                    fileInputImgRef.current?.click();
                  }}
                  testId="menu-add-image"
                >
                  Image files (JPG/PNG)…
                </MenuItem>
              </DropdownButton>

              <DropdownButton
                label="Add Pages"
                icon={<FileStack className="h-4 w-4" />}
                open={openMenu === "addPages"}
                onToggle={() =>
                  setOpenMenu(openMenu === "addPages" ? null : "addPages")
                }
              >
                <MenuItem
                  onClick={() => {
                    setOpenMenu(null);
                    addBlankPage("a4-p");
                  }}
                  testId="menu-blank-a4p"
                >
                  Blank A4 (Portrait)
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setOpenMenu(null);
                    addBlankPage("a4-l");
                  }}
                  testId="menu-blank-a4l"
                >
                  Blank A4 (Landscape)
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setOpenMenu(null);
                    addBlankPage("letter");
                  }}
                  testId="menu-blank-letter"
                >
                  Blank Letter
                </MenuItem>
              </DropdownButton>

              <DropdownButton
                label="Reorder"
                icon={<ArrowDownAZ className="h-4 w-4" />}
                open={openMenu === "reorder"}
                onToggle={() =>
                  setOpenMenu(openMenu === "reorder" ? null : "reorder")
                }
              >
                <MenuItem
                  icon={<ArrowDownAZ className="h-4 w-4" />}
                  onClick={() => {
                    setOpenMenu(null);
                    sortItems("az");
                  }}
                  testId="menu-sort-az"
                >
                  Name A → Z
                </MenuItem>
                <MenuItem
                  icon={<ArrowUpZA className="h-4 w-4" />}
                  onClick={() => {
                    setOpenMenu(null);
                    sortItems("za");
                  }}
                  testId="menu-sort-za"
                >
                  Name Z → A
                </MenuItem>
                <MenuItem
                  icon={<RotateCcw className="h-4 w-4" />}
                  onClick={() => {
                    setOpenMenu(null);
                    sortItems("reverse");
                  }}
                  testId="menu-sort-reverse"
                >
                  Reverse order
                </MenuItem>
                <MenuItem
                  icon={<Shuffle className="h-4 w-4" />}
                  onClick={() => {
                    setOpenMenu(null);
                    sortItems("shuffle");
                  }}
                  testId="menu-sort-shuffle"
                >
                  Shuffle
                </MenuItem>
              </DropdownButton>

              <div className="flex-1" />

              <span className="text-xs text-amber-200/70 font-mono">
                {items.length} files · {livePagesCount} pages
              </span>
            </div>
          </div>
        )}

        {/* Files / Pages grid */}
        {items.length > 0 && (
          <div className="min-h-[200px] rounded-2xl border border-white/10 bg-purple-950/30 p-4 sm:p-5">
            {view === "files" ? (
              <FilesGrid
                items={items}
                thumbW={thumbW}
                overIdx={overIdx}
                onRemove={removeItem}
                onRotate={rotateItem}
                onDuplicate={duplicateItem}
                onDragStart={(i) => {
                  dragSrc.current = { type: "file", index: i };
                }}
                onDragOver={(i) => setOverIdx(i)}
                onDrop={(i) => {
                  if (dragSrc.current?.type === "file") {
                    reorderItems(dragSrc.current.index, i);
                  }
                  dragSrc.current = null;
                  setOverIdx(null);
                }}
                onDragEnd={() => {
                  dragSrc.current = null;
                  setOverIdx(null);
                }}
              />
            ) : (
              <PagesGrid
                items={items}
                pages={pages}
                thumbW={thumbW}
                overIdx={overIdx}
                onRemove={removePage}
                onRotate={rotatePage}
                onDragStart={(i) => {
                  dragSrc.current = { type: "page", index: i };
                }}
                onDragOver={(i) => setOverIdx(i)}
                onDrop={(i) => {
                  if (dragSrc.current?.type === "page") {
                    reorderPages(dragSrc.current.index, i);
                  }
                  dragSrc.current = null;
                  setOverIdx(null);
                }}
                onDragEnd={() => {
                  dragSrc.current = null;
                  setOverIdx(null);
                }}
              />
            )}
          </div>
        )}

        {/* Inline-add hint */}
        {items.length > 0 && (
          <button
            onClick={() => fileInputPdfRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-amber-300/30 bg-purple-950/20 hover:border-amber-300/60 hover:bg-purple-950/40 py-4 text-amber-200/80 text-sm font-medium flex items-center justify-center gap-2 transition"
            data-testid="add-more-files"
          >
            <Upload className="h-4 w-4" /> વધુ PDF/Image files Add કરો
          </button>
        )}

        {/* More options panel */}
        {items.length > 0 && (
          <div className="rounded-2xl border border-amber-300/20 bg-purple-950/30">
            <button
              onClick={() => setShowOptions((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-amber-200 hover:bg-purple-950/50 transition rounded-2xl"
              data-testid="toggle-options"
            >
              <span className="flex items-center gap-2 text-sm font-bold">
                <Settings2 className="h-4 w-4" /> More options
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  showOptions ? "rotate-180" : ""
                }`}
              />
            </button>
            <AnimatePresence>
              {showOptions && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 sm:p-5 space-y-5 border-t border-amber-300/10">
                    {/* Pages */}
                    <Section title="Pages">
                      <CheckRow
                        checked={doubleSided}
                        onChange={setDoubleSided}
                        label="Double sided printing"
                        hint="દરેક document right-side પર શરૂ થાય તે માટે જરૂર પડે ત્યાં blank page ઉમેરો."
                        testId="opt-doublesided"
                      />
                      <CheckRow
                        checked={sameSize}
                        onChange={setSameSize}
                        label="Make all pages same size"
                        hint="પહેલા PDF ની page size સાથે બધી pages match કરો."
                        testId="opt-samesize"
                      />
                      <CheckRow
                        checked={coverFirst}
                        onChange={setCoverFirst}
                        label="First document is a cover/title"
                        hint="પહેલી file ની pages output ની શરૂઆત માં મૂકાશે."
                        testId="opt-cover"
                      />
                      <CheckRow
                        checked={filenameFooter}
                        onChange={setFilenameFooter}
                        label="Add filename to page footer"
                        hint="દરેક page ના footer માં source filename print થશે."
                        testId="opt-footer"
                      />
                    </Section>

                    <Section title="Bookmarks (outline)">
                      <PillGroup
                        value={bookmarkMode}
                        onChange={(v) => setBookmarkMode(v as BookmarkMode)}
                        options={[
                          { value: "keep", label: "Keep all" },
                          { value: "discard", label: "Discard all" },
                          { value: "perDoc", label: "One entry each doc" },
                          {
                            value: "groupPerDoc",
                            label: "Keep all, under one entry each doc",
                          },
                        ]}
                      />
                      <p className="text-[11px] text-amber-200/50 mt-1">
                        નોંધ: pdf-lib browser-side bookmarks લખતું નથી — output PDF માં bookmark structure preserve થશે નહીં.
                      </p>
                    </Section>

                    <Section title="Table of Contents">
                      <PillGroup
                        value={tocMode}
                        onChange={(v) => setTocMode(v as TocMode)}
                        options={[
                          { value: "none", label: "None" },
                          { value: "filenames", label: "Based on file names" },
                          {
                            value: "titles",
                            label: "Based on document titles",
                          },
                        ]}
                      />
                    </Section>

                    <Section title="Form Fields">
                      <PillGroup
                        value={formFieldsMode}
                        onChange={(v) =>
                          setFormFieldsMode(v as FormFieldsMode)
                        }
                        options={[
                          { value: "discard", label: "Discard" },
                          { value: "merge", label: "Merge" },
                          { value: "rename", label: "Merge (Rename existing)" },
                          { value: "flatten", label: "Flatten" },
                        ]}
                      />
                    </Section>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Loader */}
        {busy && progress > 0 && (
          <GoldLoader progress={progress} label={progressLabel} />
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Sticky action bar */}
        {items.length > 0 && (
          <div className="sticky bottom-3 z-10">
            <div className="rounded-2xl border border-amber-300/40 bg-gradient-to-r from-purple-950/95 via-purple-900/95 to-purple-950/95 backdrop-blur p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.7)]">
              <div className="flex items-center gap-2 text-amber-200 text-sm">
                <Sparkles className="h-4 w-4" />
                <span className="font-semibold">
                  {items.length} {items.length === 1 ? "file" : "files"} →{" "}
                  {livePagesCount} pages
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setItems([]);
                    setPages([]);
                  }}
                  className="rounded-xl border border-amber-300/30 bg-purple-950/40 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-purple-950/60"
                  data-testid="clear-all"
                >
                  <Trash2 className="h-3.5 w-3.5 inline mr-1" /> Clear
                </button>
                <GoldButton
                  onClick={merge}
                  disabled={busy || items.length === 0}
                  testId="btn-merge"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Merge PDF files
                </GoldButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </PrimeToolShell>
  );
}

// ═══════════════════════════════════════════════════════════════
// Helper components
// ═══════════════════════════════════════════════════════════════

function DropZoneCard({
  onFiles,
}: {
  onFiles: (fl: FileList | File[]) => void;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files) onFiles(e.dataTransfer.files);
      }}
      className={`rounded-3xl border-2 border-dashed p-10 text-center transition cursor-pointer ${
        over
          ? "border-amber-300 bg-amber-300/10"
          : "border-amber-300/40 bg-purple-950/30 hover:bg-purple-950/50"
      }`}
      onClick={() => inputRef.current?.click()}
      data-testid="initial-dropzone"
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-300 to-yellow-500 flex items-center justify-center mb-4 shadow-lg">
        <Upload className="h-8 w-8 text-purple-950" />
      </div>
      <h3 className="text-amber-100 text-lg font-bold">
        Drop PDFs અને Images અહીં
      </h3>
      <p className="text-amber-200/70 text-sm mt-1">
        અથવા click કરીને files select કરો — Multiple PDFs + Images સાથે મિક્સ
        કરી શકો છો
      </p>
    </div>
  );
}

function DropdownButton({
  label,
  icon,
  open,
  onToggle,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/40 bg-purple-950/40 px-3 py-1.5 text-xs font-bold text-amber-100 hover:bg-purple-950/70 hover:border-amber-300/70"
        data-testid={`dd-${label.toLowerCase().replace(/\s/g, "-")}`}
      >
        {icon}
        {label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 min-w-[200px] rounded-xl border border-amber-300/30 bg-[#1a0b2e] shadow-2xl overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  onClick,
  children,
  testId,
}: {
  icon?: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-100 hover:bg-amber-300/10 text-left"
      data-testid={testId}
    >
      {icon}
      {children}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-amber-200 text-xs font-bold uppercase tracking-wider mb-2">
        {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  hint,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-2 text-left rounded-lg p-2 hover:bg-purple-950/40"
      data-testid={testId}
    >
      {checked ? (
        <CheckSquare className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
      ) : (
        <Square className="h-4 w-4 text-amber-300/60 mt-0.5 flex-shrink-0" />
      )}
      <div className="flex-1">
        <div className="text-sm text-amber-100 font-medium">{label}</div>
        {hint && (
          <div className="text-[11px] text-amber-200/60 mt-0.5">{hint}</div>
        )}
      </div>
    </button>
  );
}

function PillGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${
            value === o.value
              ? "bg-amber-300 text-purple-950 border-amber-300"
              : "bg-purple-950/40 text-amber-200 border-amber-300/30 hover:border-amber-300/60"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FilesGrid({
  items,
  thumbW,
  overIdx,
  onRemove,
  onRotate,
  onDuplicate,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  items: MergeItem[];
  thumbW: number;
  overIdx: number | null;
  onRemove: (id: string) => void;
  onRotate: (id: string, dir: -90 | 90) => void;
  onDuplicate: (id: string) => void;
  onDragStart: (i: number) => void;
  onDragOver: (i: number) => void;
  onDrop: (i: number) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-4 justify-start"
      data-testid="files-grid"
    >
      {items.map((it, i) => {
        const t = it.thumbs[0];
        const aspect = t ? t.height / t.width : 1.4;
        const h = Math.round(thumbW * aspect);
        const isOver = overIdx === i;
        return (
          <div
            key={it.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              onDragStart(i);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              onDragOver(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(i);
            }}
            onDragEnd={onDragEnd}
            className={`group relative rounded-xl overflow-hidden bg-white shadow-md transition-all cursor-move ${
              isOver
                ? "ring-4 ring-amber-300 scale-[1.03]"
                : "ring-1 ring-amber-300/30 hover:ring-amber-300/70"
            }`}
            style={{ width: thumbW + 8 }}
            data-testid={`file-card-${i}`}
          >
            <div className="absolute top-1 left-1 z-10 rounded-full bg-amber-400 text-purple-950 text-xs font-bold w-6 h-6 flex items-center justify-center shadow">
              {i + 1}
            </div>
            <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition flex gap-0.5">
              <IconBtn
                onClick={() => onRotate(it.id, -90)}
                aria-label="Rotate left"
                testId={`rotate-l-${i}`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                onClick={() => onRotate(it.id, 90)}
                aria-label="Rotate right"
                testId={`rotate-r-${i}`}
              >
                <RotateCw className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                onClick={() => onDuplicate(it.id)}
                aria-label="Duplicate"
                testId={`dup-${i}`}
              >
                <FileStack className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                onClick={() => onRemove(it.id)}
                aria-label="Remove"
                danger
                testId={`del-${i}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconBtn>
            </div>

            {/* Thumbnail */}
            <div
              className="bg-gray-100 flex items-center justify-center overflow-hidden"
              style={{ width: thumbW + 8, height: h + 8, padding: 4 }}
            >
              {t ? (
                <img
                  src={t.dataUrl}
                  alt={it.name}
                  style={{
                    transform: `rotate(${it.rotation}deg)`,
                    maxWidth: "100%",
                    maxHeight: "100%",
                  }}
                />
              ) : (
                <FileText className="h-12 w-12 text-gray-300" />
              )}
            </div>

            {/* Footer */}
            <div className="px-2 py-2 bg-white border-t border-gray-100">
              <div
                className="text-[11px] font-semibold text-gray-800 truncate"
                title={it.name}
              >
                {it.name}
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-500 mt-0.5">
                <span className="flex items-center gap-1">
                  {it.kind === "pdf" && (
                    <FileText className="h-3 w-3 text-rose-500" />
                  )}
                  {it.kind === "image" && (
                    <ImageIcon className="h-3 w-3 text-emerald-500" />
                  )}
                  {it.kind === "blank" && (
                    <FileStack className="h-3 w-3 text-amber-500" />
                  )}
                  {it.pageCount} {it.pageCount === 1 ? "page" : "pages"}
                </span>
                {it.size > 0 && <span>{formatBytes(it.size)}</span>}
              </div>
            </div>

            <GripVertical className="absolute bottom-1 right-1 h-3 w-3 text-gray-300 opacity-60" />
          </div>
        );
      })}
    </div>
  );
}

function PagesGrid({
  items,
  pages,
  thumbW,
  overIdx,
  onRemove,
  onRotate,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  items: MergeItem[];
  pages: PageEntry[];
  thumbW: number;
  overIdx: number | null;
  onRemove: (uid: string) => void;
  onRotate: (uid: string, dir: -90 | 90) => void;
  onDragStart: (i: number) => void;
  onDragOver: (i: number) => void;
  onDrop: (i: number) => void;
  onDragEnd: () => void;
}) {
  const itemMap = useMemo(
    () => new Map(items.map((it) => [it.id, it])),
    [items],
  );

  return (
    <div className="flex flex-wrap gap-3" data-testid="pages-grid">
      {pages.map((p, i) => {
        const it = itemMap.get(p.itemId);
        if (!it) return null;
        const t = it.thumbs[p.pageIndex] ?? it.thumbs[0];
        const totalRot = (it.rotation + p.rotation) % 360;
        const aspect = t ? t.height / t.width : 1.4;
        const h = Math.round(thumbW * aspect);
        const isOver = overIdx === i;
        return (
          <div
            key={p.uid}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              onDragStart(i);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              onDragOver(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(i);
            }}
            onDragEnd={onDragEnd}
            className={`group relative rounded-xl overflow-hidden bg-white shadow-md transition-all cursor-move ${
              isOver
                ? "ring-4 ring-amber-300 scale-[1.03]"
                : "ring-1 ring-amber-300/30 hover:ring-amber-300/70"
            }`}
            style={{ width: thumbW + 8 }}
            data-testid={`page-card-${i}`}
          >
            <div className="absolute top-1 left-1 z-10 rounded-full bg-amber-400 text-purple-950 text-[10px] font-bold px-1.5 py-0.5 shadow">
              {i + 1}
            </div>
            <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 flex gap-0.5">
              <IconBtn
                onClick={() => onRotate(p.uid, -90)}
                aria-label="Rotate left"
                testId={`prot-l-${i}`}
              >
                <RotateCcw className="h-3 w-3" />
              </IconBtn>
              <IconBtn
                onClick={() => onRotate(p.uid, 90)}
                aria-label="Rotate right"
                testId={`prot-r-${i}`}
              >
                <RotateCw className="h-3 w-3" />
              </IconBtn>
              <IconBtn
                onClick={() => onRemove(p.uid)}
                aria-label="Remove"
                danger
                testId={`pdel-${i}`}
              >
                <Trash2 className="h-3 w-3" />
              </IconBtn>
            </div>

            <div
              className="bg-gray-100 flex items-center justify-center overflow-hidden"
              style={{ width: thumbW + 8, height: h + 8, padding: 4 }}
            >
              {t ? (
                <img
                  src={t.dataUrl}
                  alt=""
                  style={{
                    transform: `rotate(${totalRot}deg)`,
                    maxWidth: "100%",
                    maxHeight: "100%",
                  }}
                />
              ) : (
                <FileText className="h-12 w-12 text-gray-300" />
              )}
            </div>

            <div className="px-2 py-1.5 bg-white border-t border-gray-100">
              <div
                className="text-[10px] text-gray-700 truncate"
                title={it.name}
              >
                {it.name}
              </div>
              <div className="text-[10px] text-gray-500">
                p.{p.pageIndex + 1}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  danger,
  testId,
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  testId?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      data-testid={testId}
      className={`rounded-md p-1 backdrop-blur transition shadow ${
        danger
          ? "bg-red-500/90 hover:bg-red-600 text-white"
          : "bg-purple-950/80 hover:bg-purple-900 text-amber-200"
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// Pure helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Normalise an image File to PNG/JPG bytes embeddable by pdf-lib.
 * Handles arbitrary input formats (WEBP, BMP, etc.) by re-rendering via canvas.
 * Also pre-applies rotation (0/90/180/270) so we don't have to rely on
 * pdf-lib's `rotate` (which rotates around the anchor and is fragile).
 */
async function prepareImage(
  file: File,
  rotationDeg: number,
): Promise<{ bytes: ArrayBuffer; mime: "image/png" | "image/jpeg"; w: number; h: number }> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("read fail"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("img fail"));
    im.src = dataUrl;
  });
  const rot = ((rotationDeg % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const ow = img.naturalWidth;
  const oh = img.naturalHeight;
  const cw = swap ? oh : ow;
  const ch = swap ? ow : oh;
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  // Preserve transparent PNG; otherwise we'll output JPG with white bg
  const looksPng =
    file.type === "image/png" ||
    file.name.toLowerCase().endsWith(".png");
  if (!looksPng) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
  }
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(img, -ow / 2, -oh / 2);
  const outMime: "image/png" | "image/jpeg" = looksPng ? "image/png" : "image/jpeg";
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error("canvas fail"))),
      outMime,
      0.92,
    ),
  );
  return { bytes: await blob.arrayBuffer(), mime: outMime, w: cw, h: ch };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read fail"));
    r.readAsDataURL(file);
  });
}

function imageDim(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 800, h: 1130 });
    img.src = dataUrl;
  });
}

function blankThumb(w: number, h: number): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.fillStyle = "#94a3b8";
  ctx.font = `bold ${Math.round(w * 0.1)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Blank", w / 2, h / 2);
  return c.toDataURL("image/jpeg", 0.85);
}

function makeFilename(items: MergeItem[]) {
  const first = items.find((it) => it.kind !== "blank");
  const base = first
    ? first.name.replace(/\.(pdf|jpg|jpeg|png|webp)$/i, "")
    : "merged";
  return `${base}-merged-${items.length}files.pdf`;
}

