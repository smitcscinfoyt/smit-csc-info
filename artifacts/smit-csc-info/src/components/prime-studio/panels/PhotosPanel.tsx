/**
 * Photos panel — combined Unsplash + Pixabay search.
 *
 *  • Search bar at top → fires queries to BOTH /api/unsplash/search and
 *    /api/pixabay/search?image_type=photo in parallel, then interleaves
 *    results (round-robin) for a diverse mix.
 *  • Default browse state shows category tiles with live cover thumbs
 *    sourced from Unsplash (already cached at module scope).
 *  • Click a thumbnail → adds the image at full-fit on the active page.
 *    Konva's `useImage(src, "anonymous")` guarantees CORS-clean exports
 *    for both providers (Unsplash + Pixabay both serve permissive CORS
 *    on their CDN).
 *  • Photographer credit appears on hover; Pixabay tracking is not
 *    required, Unsplash download_location ping is fired on insert.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Search, X, ExternalLink, AlertCircle } from "lucide-react";
import { useStudio, useActivePage } from "../store";
import type { ElementData, ImageElement } from "../types";

export interface MediaPhoto {
  id: string;
  source: "unsplash" | "pixabay";
  width: number;
  height: number;
  color: string | null;
  alt: string;
  thumb: string;
  small: string;
  regular: string;
  full: string;
  link: string;
  downloadLocation: string | null;
  photographer: { name: string; username: string; profile: string };
}

interface SearchResponse {
  total: number;
  total_pages: number;
  results: Array<Omit<MediaPhoto, "source"> & { source?: "pixabay" }>;
}

const CATEGORIES: { label: string; search: string }[] = [
  { label: "Background", search: "background" },
  { label: "Gradient", search: "gradient background" },
  { label: "Texture", search: "texture" },
  { label: "Pattern", search: "pattern" },
  { label: "Nature", search: "nature" },
  { label: "Farmer", search: "indian farmer" },
  { label: "Education", search: "education" },
  { label: "Business", search: "business" },
  { label: "Office", search: "office" },
  { label: "Festival", search: "indian festival" },
  { label: "Tricolour", search: "indian flag" },
  { label: "Food", search: "indian food" },
];

const categoryCoverCache = new Map<string, { thumb: string; color: string | null }>();

/**
 * Round-robin interleave of N source arrays. Keeps the visual feed
 * varied between providers instead of "all Unsplash, then all Pixabay".
 */
function interleave<T>(...arrays: T[][]): T[] {
  const out: T[] = [];
  const max = Math.max(...arrays.map((a) => a.length));
  for (let i = 0; i < max; i++) {
    for (const a of arrays) if (a[i] !== undefined) out.push(a[i] as T);
  }
  return out;
}

/**
 * Fetches both providers in parallel. A failure from either side is
 * downgraded to "no results from that source" rather than failing the
 * whole search — only if BOTH fail do we surface an error.
 */
async function searchAllProviders(
  q: string,
  page: number,
  signal: AbortSignal,
): Promise<{ photos: MediaPhoto[]; hasMore: boolean; error: string | null }> {
  const perPage = 12;
  const [unsplashRes, pixabayRes] = await Promise.allSettled([
    fetch(`/api/unsplash/search?q=${encodeURIComponent(q)}&page=${page}&per_page=${perPage}`, {
      signal,
    }).then(async (r) => {
      if (!r.ok) throw new Error(`unsplash:${r.status}`);
      return (await r.json()) as SearchResponse;
    }),
    fetch(
      `/api/pixabay/search?q=${encodeURIComponent(q)}&page=${page}&per_page=${perPage}&image_type=photo`,
      { signal },
    ).then(async (r) => {
      if (!r.ok) throw new Error(`pixabay:${r.status}`);
      return (await r.json()) as SearchResponse;
    }),
  ]);

  const unsplashOk = unsplashRes.status === "fulfilled";
  const pixabayOk = pixabayRes.status === "fulfilled";

  const unsplash: MediaPhoto[] = unsplashOk
    ? unsplashRes.value.results.map((r) => ({ ...r, source: "unsplash" as const }))
    : [];
  const pixabay: MediaPhoto[] = pixabayOk
    ? pixabayRes.value.results.map((r) => ({ ...r, source: "pixabay" as const }))
    : [];

  if (!unsplashOk && !pixabayOk) {
    return {
      photos: [],
      hasMore: false,
      error:
        "Both photo sources are unreachable. Please try again in a moment — or ask the admin to check UNSPLASH_ACCESS_KEY / PIXABAY_API_KEY.",
    };
  }

  const hasMore =
    (unsplashOk && page < unsplashRes.value.total_pages) ||
    (pixabayOk && page < pixabayRes.value.total_pages);

  return { photos: interleave(unsplash, pixabay), hasMore, error: null };
}

export function PhotosPanel() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [photos, setPhotos] = useState<MediaPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insertingId, setInsertingId] = useState<string | null>(null);

  const addElement = useStudio((s) => s.addElement);
  const activePage = useActivePage();
  const abortRef = useRef<AbortController | null>(null);
  /**
   * Monotonic request id. Incremented every time a new search starts AND
   * every time the debounced query changes. Each in-flight handler
   * captures the id at start; on resolve it commits state only if the id
   * still matches `requestIdRef.current`. This closes the window where a
   * stale fetch could resolve between "user typed new query" and "new
   * fetch is dispatched", overwriting fresh state with old data.
   */
  const requestIdRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    // Invalidate any in-flight result *immediately* on every query
    // change — including non-empty → non-empty, which the previous
    // implementation missed.
    requestIdRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    setPage(1);
    setPhotos([]);
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

  const runSearch = useCallback(async (q: string, p: number, append: boolean) => {
    if (!q) return;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    const id = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const { photos: next, hasMore: more, error: err } = await searchAllProviders(
        q,
        p,
        ctl.signal,
      );
      if (ctl.signal.aborted || id !== requestIdRef.current) return;
      if (err) {
        setError(err);
        return;
      }
      setPhotos((prev) => (append ? [...prev, ...next] : next));
      setHasMore(more);
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

  const insertPhoto = useCallback(
    async (photo: MediaPhoto) => {
      setInsertingId(photo.id);
      try {
        const pageW = activePage?.width ?? 1280;
        const pageH = activePage?.height ?? 720;
        const maxW = pageW * 0.6;
        const maxH = pageH * 0.6;
        const scale = Math.min(maxW / photo.width, maxH / photo.height, 1);
        const w = photo.width * scale;
        const h = photo.height * scale;
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
          src: photo.regular,
        };
        addElement(el as Omit<ElementData, "id">);

        // Fire-and-forget Unsplash tracking ping (Pixabay doesn't need one).
        if (photo.source === "unsplash" && photo.downloadLocation) {
          fetch(
            `/api/unsplash/track-download?url=${encodeURIComponent(photo.downloadLocation)}`,
          ).catch(() => {});
        }
      } finally {
        setInsertingId(null);
      }
    },
    [activePage, addElement],
  );

  const masonry = useMemo(() => {
    const a: MediaPhoto[] = [];
    const b: MediaPhoto[] = [];
    let aH = 0,
      bH = 0;
    for (const p of photos) {
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
  }, [photos]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ImagePlus className="h-5 w-5 text-purple-700" />
        <h3 className="text-base font-bold text-purple-950">Photos</h3>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search photos..."
          className="w-full pl-8 pr-8 py-2 text-sm rounded-lg bg-purple-50 border border-purple-200 focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition"
          data-testid="photos-search-input"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-purple-100 rounded"
            aria-label="Clear search"
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
        <CategoryGrid
          categories={CATEGORIES}
          cache={categoryCoverCache}
          onPick={(t) => setQuery(t)}
        />
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {masonry.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-2">
              {col.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  inserting={insertingId === photo.id}
                  onInsert={insertPhoto}
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
      {!loading && debounced && photos.length === 0 && !error && (
        <div className="text-center py-6 text-purple-500 text-xs">
          No photos found. Try a different keyword.
        </div>
      )}
      {!loading && hasMore && (
        <button
          type="button"
          onClick={loadMore}
          className="w-full py-2 rounded-lg text-sm font-semibold text-purple-800 bg-purple-100 hover:bg-purple-200 transition"
        >
          Show more photos
        </button>
      )}
    </div>
  );
}

interface PhotoCardProps {
  photo: MediaPhoto;
  inserting: boolean;
  onInsert: (p: MediaPhoto) => void;
}

function PhotoCard({ photo, inserting, onInsert }: PhotoCardProps) {
  const ratio = photo.height / photo.width;
  return (
    <div
      className="relative group rounded-lg overflow-hidden cursor-pointer ring-1 ring-purple-100 hover:ring-2 hover:ring-purple-500 transition"
      style={{
        backgroundColor: photo.color ?? "#e9e3ff",
        paddingBottom: `${ratio * 100}%`,
      }}
      onClick={() => !inserting && onInsert(photo)}
      data-testid={`photo-${photo.id}`}
    >
      <img
        src={photo.thumb}
        alt={photo.alt || "Photo"}
        loading="lazy"
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity" />
      <a
        href={photo.photographer.profile}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute left-1 right-1 bottom-1 flex items-center justify-between text-[9px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity"
        title={`Photo by ${photo.photographer.name}`}
      >
        <span className="truncate">{photo.photographer.name}</span>
        <ExternalLink className="h-2.5 w-2.5 shrink-0 ml-1" />
      </a>
      {inserting && (
        <div className="absolute inset-0 bg-purple-900/60 flex items-center justify-center">
          <Loader2 className="h-5 w-5 text-amber-300 animate-spin" />
        </div>
      )}
    </div>
  );
}

/**
 * Reusable category grid (also exported for the Graphics panel).
 * Tiles fetch their cover from /api/unsplash/search?per_page=1 once
 * per session and cache at module scope.
 */
interface CategoryGridProps {
  categories: { label: string; search: string }[];
  cache: Map<string, { thumb: string; color: string | null }>;
  onPick: (term: string) => void;
}

export function CategoryGrid({ categories, cache, onPick }: CategoryGridProps) {
  const [covers, setCovers] = useState<Record<string, { thumb: string; color: string | null }>>(
    () => {
      const init: Record<string, { thumb: string; color: string | null }> = {};
      for (const c of categories) {
        const cached = cache.get(c.search);
        if (cached) init[c.search] = cached;
      }
      return init;
    },
  );

  useEffect(() => {
    const ctl = new AbortController();
    const missing = categories.filter((c) => !cache.has(c.search));
    if (missing.length === 0) return;
    missing.forEach(async (c) => {
      try {
        const res = await fetch(
          `/api/unsplash/search?q=${encodeURIComponent(c.search)}&per_page=1`,
          { signal: ctl.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          results: Array<{ thumb: string; small: string; color: string | null }>;
        };
        const photo = data.results[0];
        if (!photo) return;
        const cover = { thumb: photo.small, color: photo.color };
        cache.set(c.search, cover);
        if (!ctl.signal.aborted) {
          setCovers((prev) => ({ ...prev, [c.search]: cover }));
        }
      } catch {
        /* ignore — placeholder colour stays */
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
            className="relative h-24 rounded-lg overflow-hidden ring-1 ring-purple-200 hover:ring-2 hover:ring-purple-500 transition group"
            style={{ backgroundColor: cover?.color ?? "#e9e3ff" }}
            data-testid={`category-${c.search}`}
          >
            {cover?.thumb && (
              <img
                src={cover.thumb}
                alt={c.label}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
            <span className="absolute left-2 bottom-1.5 right-2 text-white text-xs font-bold drop-shadow-md text-left">
              {c.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
