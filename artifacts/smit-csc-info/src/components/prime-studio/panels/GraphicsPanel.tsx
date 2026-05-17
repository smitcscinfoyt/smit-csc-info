/**
 * Graphics panel — Pixabay vectors / illustrations only.
 *
 * Pulls from `/api/pixabay/search?image_type=vector` (with an
 * illustration fallback if the user's term has no vector results).
 * Renders as a 2-col masonry of transparent-background graphics.
 *
 * Click → adds the asset as an ImageElement on the active page.
 * Pixabay's CDN sets permissive CORS so Konva's `useImage(src,
 * "anonymous")` keeps the canvas un-tainted for export.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, X, AlertCircle, Shapes as ShapesIcon } from "lucide-react";
import { useStudio, useActivePage } from "../store";
import type { ElementData, ImageElement } from "../types";

interface PixabayHit {
  id: string;
  width: number;
  height: number;
  alt: string;
  thumb: string;
  small: string;
  regular: string;
  full: string;
  link: string;
  photographer: { name: string; profile: string };
}

interface SearchResponse {
  total: number;
  total_pages: number;
  results: Array<Omit<PixabayHit, "photographer"> & {
    photographer: { name: string; username: string; profile: string };
  }>;
}

/**
 * Category tiles shown when the search bar is empty — same visual
 * pattern as PhotosPanel's CategoryGrid: each tile carries a live
 * cover thumbnail (one Pixabay vector per category, fetched once
 * and cached at module scope), with a dark→transparent gradient
 * and a label pinned to the bottom-left.
 *
 * Search terms are intentionally tuned for vector hits ("vector"
 * suffix nudges Pixabay's relevance toward the transparent-bg
 * graphics we want as covers). The label, however, stays clean
 * for the user.
 */
const GRAPHICS_CATEGORIES: { label: string; search: string }[] = [
  { label: "Frame", search: "frame" },
  { label: "Ribbon", search: "ribbon" },
  { label: "Badge", search: "badge" },
  { label: "Arrow", search: "arrow" },
  { label: "Bharat", search: "bharat" },
  { label: "Diwali", search: "diwali" },
  { label: "Ganesha", search: "ganesha" },
  { label: "Modi", search: "modi" },
  { label: "Education", search: "education" },
  { label: "Agriculture", search: "agriculture" },
  { label: "Office", search: "office" },
  { label: "Tricolor", search: "tricolor" },
];

/**
 * Module-scope cache of category cover thumbnails so re-mounts of
 * GraphicsPanel (e.g. tab switches) don't re-fetch the same 12
 * Pixabay queries every time. Keyed by `search` term.
 */
const graphicsCategoryCoverCache = new Map<string, { thumb: string }>();

export function GraphicsPanel() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [hits, setHits] = useState<PixabayHit[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insertingId, setInsertingId] = useState<string | null>(null);

  const addElement = useStudio((s) => s.addElement);
  const activePage = useActivePage();
  const abortRef = useRef<AbortController | null>(null);
  /**
   * Monotonic id — closes the race window where a stale fetch could
   * resolve between query change and new fetch dispatch and overwrite
   * fresh state. Bumped on every debounced-query change AND every
   * runSearch start; handlers commit only if their captured id matches.
   */
  const requestIdRef = useRef(0);
  /**
   * Per-query "active media type" so pagination stays coherent.
   *
   * On a brand-new query we always start with `vector` — and if page 1
   * comes back empty we transparently fall back to `illustration`. Once
   * a mode is picked for that query, every subsequent "Show more" page
   * MUST keep using the same mode, otherwise the user would see vector
   * art on page 1 then totally unrelated illustrations on page 2.
   */
  const activeModeRef = useRef<"vector" | "illustration">("vector");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    requestIdRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    activeModeRef.current = "vector";
    setPage(1);
    setHits([]);
    setHasMore(false);
    setError(null);
    if (!debounced) setLoading(false);
  }, [debounced]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  /**
   * Vector-first, illustration-fallback. The fallback only happens on
   * the very first page of a new query; once a mode is locked into
   * `activeModeRef`, every loadMore reuses it.
   */
  const runSearch = useCallback(async (q: string, p: number, append: boolean) => {
    if (!q) return;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    const id = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const fetchType = async (type: "vector" | "illustration") => {
        const res = await fetch(
          `/api/pixabay/search?q=${encodeURIComponent(q)}&page=${p}&per_page=24&image_type=${type}`,
          { signal: ctl.signal },
        );
        if (!res.ok) {
          if (res.status === 503)
            throw new Error("Pixabay is not configured. Please ask the admin to add PIXABAY_API_KEY.");
          throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as SearchResponse;
      };

      let mode = activeModeRef.current;
      let data: SearchResponse;
      if (p === 1) {
        // Fresh page-1 fetch: try vector first, fall back to illustration.
        data = await fetchType("vector");
        mode = "vector";
        if (data.results.length === 0) {
          data = await fetchType("illustration");
          mode = "illustration";
        }
        // Lock mode for subsequent pages of this query.
        activeModeRef.current = mode;
      } else {
        // Continuation page: reuse whichever mode page-1 settled on.
        data = await fetchType(mode);
      }
      if (ctl.signal.aborted || id !== requestIdRef.current) return;
      const nextHits: PixabayHit[] = data.results.map((r) => ({
        id: r.id,
        width: r.width,
        height: r.height,
        alt: r.alt,
        thumb: r.thumb,
        small: r.small,
        regular: r.regular,
        full: r.full,
        link: r.link,
        photographer: { name: r.photographer.name, profile: r.photographer.profile },
      }));
      setHits((prev) => (append ? [...prev, ...nextHits] : nextHits));
      setHasMore(p < data.total_pages);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      if (id !== requestIdRef.current) return;
      setError((e as Error).message);
    } finally {
      if (!ctl.signal.aborted && id === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!debounced) return;
    runSearch(debounced, 1, false);
  }, [debounced, runSearch]);

  const loadMore = () => {
    if (loading || !hasMore || !debounced) return;
    const next = page + 1;
    setPage(next);
    runSearch(debounced, next, true);
  };

  const insertGraphic = useCallback(
    (hit: PixabayHit) => {
      setInsertingId(hit.id);
      try {
        const pageW = activePage?.width ?? 1280;
        const pageH = activePage?.height ?? 720;
        const maxW = pageW * 0.5;
        const maxH = pageH * 0.5;
        const scale = Math.min(maxW / hit.width, maxH / hit.height, 1);
        const w = hit.width * scale;
        const h = hit.height * scale;
        const el: Omit<ImageElement, "id"> = {
          type: "image",
          x: (pageW - w) / 2,
          y: (pageH - h) / 2,
          width: w,
          height: h,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          src: hit.regular,
        };
        addElement(el as Omit<ElementData, "id">);
      } finally {
        setInsertingId(null);
      }
    },
    [activePage, addElement],
  );

  const masonry = useMemo(() => {
    const a: PixabayHit[] = [];
    const b: PixabayHit[] = [];
    let aH = 0,
      bH = 0;
    for (const p of hits) {
      const ar = p.height / p.width;
      if (aH <= bH) {
        a.push(p);
        aH += ar;
      } else {
        b.push(p);
        bH += ar;
      }
    }
    return [a, b];
  }, [hits]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShapesIcon className="h-5 w-5 text-purple-700" />
        <h3 className="text-base font-bold text-purple-950">Graphics</h3>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vectors / illustrations..."
          className="w-full pl-8 pr-8 py-2 text-sm rounded-lg bg-purple-50 border border-purple-200 focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition"
          data-testid="graphics-search-input"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-purple-100 rounded"
            aria-label="Clear"
          >
            <X className="h-3.5 w-3.5 text-purple-500" />
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="leading-relaxed">{error}</div>
        </div>
      )}

      {!debounced && !error && (
        <GraphicsCategoryGrid
          categories={GRAPHICS_CATEGORIES}
          cache={graphicsCategoryCoverCache}
          onPick={(t) => setQuery(t)}
        />
      )}

      {hits.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {masonry.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-2">
              {col.map((hit) => (
                <GraphicCard
                  key={hit.id}
                  hit={hit}
                  inserting={insertingId === hit.id}
                  onInsert={insertGraphic}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-3 text-sm text-purple-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {!loading && debounced && hits.length === 0 && !error && (
        <div className="text-center py-6 text-purple-500 text-xs">
          No graphics found. Try a different keyword.
        </div>
      )}
      {!loading && hasMore && (
        <button
          type="button"
          onClick={loadMore}
          className="w-full py-2 rounded-lg text-sm font-semibold text-purple-800 bg-purple-100 hover:bg-purple-200 transition"
        >
          Show more
        </button>
      )}
    </div>
  );
}

/**
 * Visual category grid for the empty-search state.
 *
 * Mirrors the contract of PhotosPanel's `CategoryGrid` (label/search
 * pair + a module-scope cover cache + onPick callback) but pulls
 * covers from Pixabay's vector index instead of Unsplash, and uses
 * the same checker-pattern background as `GraphicCard` so the
 * transparent cut-out vectors read correctly without us having to
 * track a per-cover dominant colour.
 *
 * Each missing cover spawns an aborted-on-unmount fetch; on success
 * the cache + local state are both updated so subsequent visits are
 * instant. A failed / empty fetch silently leaves the placeholder
 * pattern visible — the label still tells the user what they'll get.
 */
interface GraphicsCategoryGridProps {
  categories: { label: string; search: string }[];
  cache: Map<string, { thumb: string }>;
  onPick: (term: string) => void;
}

function GraphicsCategoryGrid({ categories, cache, onPick }: GraphicsCategoryGridProps) {
  const [covers, setCovers] = useState<Record<string, { thumb: string }>>(() => {
    const init: Record<string, { thumb: string }> = {};
    for (const c of categories) {
      const cached = cache.get(c.search);
      if (cached) init[c.search] = cached;
    }
    return init;
  });

  useEffect(() => {
    const ctl = new AbortController();
    const missing = categories.filter((c) => !cache.has(c.search));
    if (missing.length === 0) return;
    missing.forEach(async (c) => {
      try {
        // Vector first (matches the panel's primary mode); if Pixabay
        // returns nothing, retry as illustration so the tile still
        // gets a visual cover instead of a blank checker square.
        let res = await fetch(
          `/api/pixabay/search?q=${encodeURIComponent(c.search)}&per_page=1&image_type=vector`,
          { signal: ctl.signal },
        );
        if (!res.ok) return;
        let data = (await res.json()) as { results: Array<{ thumb: string; small: string }> };
        if (data.results.length === 0) {
          res = await fetch(
            `/api/pixabay/search?q=${encodeURIComponent(c.search)}&per_page=1&image_type=illustration`,
            { signal: ctl.signal },
          );
          if (!res.ok) return;
          data = (await res.json()) as { results: Array<{ thumb: string; small: string }> };
        }
        const hit = data.results[0];
        if (!hit) return;
        // Use `thumb` (mapped from Pixabay's `previewURL` on
        // cdn.pixabay.com), NOT `small` (mapped from `webformatURL` on
        // pixabay.com/get/...). The `/get/` host enforces hotlink
        // protection and rejects most embedded loads, leaving the
        // tile with a broken-image icon. The cdn host is hotlink-
        // friendly — same source the working GraphicCard uses below.
        const cover = { thumb: hit.thumb };
        cache.set(c.search, cover);
        if (!ctl.signal.aborted) {
          setCovers((prev) => ({ ...prev, [c.search]: cover }));
        }
      } catch {
        /* ignore — placeholder pattern stays */
      }
    });
    return () => ctl.abort();
  }, [categories, cache]);

  return (
    <div className="grid grid-cols-2 gap-2 pt-1">
      {categories.map((c) => {
        const cover = covers[c.search];
        return (
          <button
            key={c.search}
            type="button"
            onClick={() => onPick(c.search)}
            className="relative h-24 rounded-lg overflow-hidden ring-1 ring-purple-200 hover:ring-2 hover:ring-purple-500 transition group bg-[conic-gradient(at_50%_50%,_#f5f3ff_25%,_#ede9fe_25%_50%,_#f5f3ff_50%_75%,_#ede9fe_75%)] bg-[length:16px_16px]"
            data-testid={`graphics-category-${c.search}`}
          >
            {cover?.thumb && (
              <img
                src={cover.thumb}
                alt={c.label}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-contain p-2 transition-transform group-hover:scale-105"
              />
            )}
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
            <span className="absolute left-2 bottom-1.5 right-2 text-white text-xs font-bold drop-shadow-md text-left">
              {c.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function GraphicCard({
  hit,
  inserting,
  onInsert,
}: {
  hit: PixabayHit;
  inserting: boolean;
  onInsert: (h: PixabayHit) => void;
}) {
  const ratio = hit.height / hit.width;
  return (
    <div
      className="relative group rounded-lg overflow-hidden cursor-pointer ring-1 ring-purple-100 hover:ring-2 hover:ring-purple-500 transition bg-[conic-gradient(at_50%_50%,_#f5f3ff_25%,_#ede9fe_25%_50%,_#f5f3ff_50%_75%,_#ede9fe_75%)] bg-[length:16px_16px]"
      style={{ paddingBottom: `${ratio * 100}%` }}
      onClick={() => !inserting && onInsert(hit)}
      data-testid={`graphic-${hit.id}`}
    >
      <img
        src={hit.thumb}
        alt={hit.alt || "Graphic"}
        loading="lazy"
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-contain p-1.5"
      />
      {inserting && (
        <div className="absolute inset-0 bg-purple-900/60 flex items-center justify-center">
          <Loader2 className="h-5 w-5 text-amber-300 animate-spin" />
        </div>
      )}
    </div>
  );
}
