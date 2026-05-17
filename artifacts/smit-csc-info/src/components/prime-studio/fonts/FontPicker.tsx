/**
 * Searchable Google Fonts picker for Prime Studio.
 *
 * Features
 *  • Popover + cmdk Command (filter as you type)
 *  • Renders each option in its own font (lazy-loads previews so a
 *    2000-item dropdown doesn't hammer Google Fonts at once)
 *  • Category filter chips (All / Sans / Serif / Display / Hand /
 *    Mono / Gujarati)
 *  • Triggers `loadGoogleFont` on selection so Konva re-renders
 *    using the chosen typeface.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ensureFullCatalog,
  getCatalogSync,
  loadGoogleFont,
  type FontMeta,
} from "./catalog";

interface Props {
  value: string;
  onChange: (family: string) => void;
  /** Called when the chosen font finishes loading — for re-render hooks. */
  onLoaded?: (family: string) => void;
  className?: string;
  triggerWidth?: string;
}

const CATEGORY_FILTERS: Array<{ id: string; label: string; match: (f: FontMeta) => boolean }> = [
  { id: "all", label: "All", match: () => true },
  { id: "gujarati", label: "Gujarati", match: (f) => f.subsets?.includes("gujarati") },
  { id: "sans-serif", label: "Sans", match: (f) => f.category === "sans-serif" },
  { id: "serif", label: "Serif", match: (f) => f.category === "serif" },
  { id: "display", label: "Display", match: (f) => f.category === "display" },
  { id: "handwriting", label: "Hand", match: (f) => f.category === "handwriting" },
  { id: "monospace", label: "Mono", match: (f) => f.category === "monospace" },
];

export function FontPicker({ value, onChange, onLoaded, className, triggerWidth }: Props) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<FontMeta[]>(() => getCatalogSync());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");

  // Kick off full-catalog fetch on first mount.
  useEffect(() => {
    let live = true;
    ensureFullCatalog().then((list) => { if (live) setCatalog(list); });
    return () => { live = false; };
  }, []);

  // Pre-load the currently-selected font so its trigger label looks right.
  useEffect(() => {
    if (value) loadGoogleFont(value).then(() => onLoaded?.(value));
  }, [value, onLoaded]);

  const filtered = useMemo(() => {
    const f = CATEGORY_FILTERS.find((x) => x.id === filter)!;
    const q = query.trim().toLowerCase();
    return catalog.filter((font) => {
      if (!f.match(font)) return false;
      if (!q) return true;
      return font.family.toLowerCase().includes(q);
    });
  }, [catalog, filter, query]);

  const handlePick = async (family: string) => {
    onChange(family);
    setOpen(false);
    await loadGoogleFont(family);
    onLoaded?.(family);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            className ??
            "flex items-center justify-between gap-1 text-xs border border-purple-200 rounded px-2 py-1 hover:bg-purple-50 max-w-[160px] min-w-[110px]"
          }
          style={{ fontFamily: value, width: triggerWidth }}
          title={value}
        >
          <span className="truncate">{value || "Select font"}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="p-0 w-[320px] max-w-[92vw] border-purple-200 shadow-2xl"
      >
        {/* Search */}
        <div className="flex items-center border-b px-3 py-2 gap-2">
          <Search className="h-3.5 w-3.5 text-purple-500 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 2000+ fonts…"
            className="flex-1 outline-none text-sm bg-transparent"
          />
        </div>
        {/* Category chips */}
        <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b bg-purple-50/30">
          {CATEGORY_FILTERS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                filter === c.id
                  ? "bg-purple-600 text-white border-purple-600"
                  : "bg-white text-purple-700 border-purple-200 hover:border-purple-400"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {/* Results */}
        <FontList
          fonts={filtered}
          value={value}
          onPick={handlePick}
          gujarati={filter === "gujarati"}
        />
        <div className="px-3 py-1.5 text-[10px] text-purple-500 border-t bg-purple-50/40">
          {filtered.length.toLocaleString()} fonts • powered by Google Fonts
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

interface FontListProps {
  fonts: FontMeta[];
  value: string;
  onPick: (family: string) => void;
  gujarati: boolean;
}

const ROW_H = 44;
const VISIBLE = 8;        // rough overscan for virtualization
const PREVIEW_LIMIT = 200; // how many previews we lazy-load on screen

function FontList({ fonts, value, onPick, gujarati }: FontListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(360);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    setViewportH(el.clientHeight || 360);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const total = fonts.length;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - VISIBLE);
  const endIdx = Math.min(total, Math.ceil((scrollTop + viewportH) / ROW_H) + VISIBLE);
  const visible = fonts.slice(startIdx, endIdx);

  // Lazy preview-load: load the font for each visible row so the user
  // can SEE what each typeface looks like. Capped to PREVIEW_LIMIT
  // simultaneous loads to avoid hammering Google.
  useEffect(() => {
    let cancelled = false;
    const slice = visible.slice(0, PREVIEW_LIMIT);
    (async () => {
      for (const f of slice) {
        if (cancelled) return;
        loadGoogleFont(f.family, [400]).catch(() => {});
      }
    })();
    return () => { cancelled = true; };
  }, [visible.map((f) => f.family).join("|")]);

  if (total === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-purple-500">
        No fonts match your search.
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="overflow-y-auto overflow-x-hidden"
      style={{ height: 360 }}
    >
      <div style={{ height: total * ROW_H, position: "relative" }}>
        {visible.map((font, i) => {
          const idx = startIdx + i;
          const selected = font.family === value;
          return (
            <button
              key={font.family}
              type="button"
              onClick={() => onPick(font.family)}
              className={`absolute left-0 right-0 flex items-center justify-between px-3 text-left hover:bg-purple-50 transition-colors ${
                selected ? "bg-purple-100" : ""
              }`}
              style={{
                top: idx * ROW_H,
                height: ROW_H,
                fontFamily: font.family,
              }}
            >
              <span className="flex-1 truncate text-base text-purple-950">
                {font.family}
              </span>
              <span className="text-[10px] text-purple-400 ml-2 truncate max-w-[120px]">
                {font.family}
              </span>
              {selected && <Check className="h-3.5 w-3.5 text-purple-700 ml-1.5 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
