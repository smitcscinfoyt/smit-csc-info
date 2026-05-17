/**
 * Icons panel — Iconify search.
 *
 * Iconify hosts ~200,000 free open-source icons (Material, Phosphor,
 * Tabler, Heroicons, …). Their search + SVG endpoints are fully public
 * (no auth, CDN-cached, CORS-enabled), so we call them straight from
 * the browser — no server proxy needed.
 *
 *   Search:  https://api.iconify.design/search?query=...&limit=48
 *   Preview: https://api.iconify.design/<prefix>/<name>.svg?color=%23...
 *   Insert:  fetch the SVG text, store as IconElement.svg (which is
 *            already the contract used by Konva's icon node — see
 *            elements/IconNode.tsx). The icon colour is bound at the
 *            URL level so one re-tint requires only a single re-fetch.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, X, AlertCircle, Sparkles } from "lucide-react";
import { useStudio, useActivePage } from "../store";
import type { ElementData, IconElement } from "../types";

interface IconHit {
  prefix: string;
  name: string;
  full: string; // "<prefix>:<name>"
}

interface IconifySearchResponse {
  icons: string[]; // ["mdi:star", "ph:flag", ...]
  total: number;
  limit: number;
  start: number;
}

/**
 * Visual category tiles shown when the search bar is empty.
 *
 * Each entry pairs the user-facing label and Iconify search term
 * with a representative icon (`preview`) used as the tile's cover
 * art. Iconify renders single-icon SVGs straight from a URL with
 * the chosen colour baked in — no API key, no network call beyond
 * the inline <img>. That means the cover grid is essentially free
 * to render and stays in sync with the active colour swatch.
 */
const ICON_CATEGORIES: { label: string; search: string; preview: string }[] = [
  { label: "Star", search: "star", preview: "mdi:star" },
  { label: "Heart", search: "heart", preview: "mdi:heart" },
  { label: "Flag", search: "flag", preview: "mdi:flag" },
  { label: "Phone", search: "phone", preview: "mdi:phone" },
  { label: "Email", search: "email", preview: "mdi:email" },
  { label: "Map", search: "map", preview: "mdi:map-marker" },
  { label: "Calendar", search: "calendar", preview: "mdi:calendar" },
  { label: "User", search: "user", preview: "mdi:account" },
  { label: "Shield", search: "shield", preview: "mdi:shield-check" },
  { label: "Rupee", search: "rupee", preview: "mdi:currency-inr" },
  { label: "Education", search: "education", preview: "mdi:school" },
  { label: "Agriculture", search: "agriculture", preview: "mdi:tractor" },
];

const DEFAULT_COLOR = "#7c3aed"; // royal purple — matches studio brand

export function IconsPanel() {
  // Empty defaults so the user lands on the visual category grid
  // (mirrors PhotosPanel's "browse first, search on demand" flow)
  // instead of an auto-loaded "star" results page.
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [icons, setIcons] = useState<IconHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insertingId, setInsertingId] = useState<string | null>(null);

  const addElement = useStudio((s) => s.addElement);
  const activePage = useActivePage();
  const abortRef = useRef<AbortController | null>(null);
  /**
   * Monotonic id incremented on every search / clear. Each in-flight
   * handler captures its id at start and commits state only if the id
   * still matches `requestIdRef.current`. Closes the race where a
   * stale fetch resolves *after* the user has cleared the search box
   * — which would otherwise overlay stale results on top of the
   * freshly-rendered category grid.
   */
  const requestIdRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Abort + invalidate any in-flight request on EVERY debounced
    // change, including clears. Without this, a slow Iconify response
    // for "star" can resolve after the user empties the search box
    // and overlay stale icon results on top of the category grid.
    abortRef.current?.abort();
    abortRef.current = null;
    const id = ++requestIdRef.current;

    if (!debounced) {
      setIcons([]);
      setLoading(false);
      setError(null);
      return;
    }

    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoading(true);
    setError(null);
    fetch(
      `https://api.iconify.design/search?query=${encodeURIComponent(debounced)}&limit=48`,
      { signal: ctl.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as IconifySearchResponse;
      })
      .then((data) => {
        if (ctl.signal.aborted || id !== requestIdRef.current) return;
        setIcons(
          data.icons.map((full) => {
            const [prefix, name] = full.split(":");
            return { prefix: prefix ?? "", name: name ?? "", full };
          }),
        );
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        if (id !== requestIdRef.current) return;
        setError((e as Error).message);
      })
      .finally(() => {
        if (!ctl.signal.aborted && id === requestIdRef.current) setLoading(false);
      });
  }, [debounced]);

  const insertIcon = useCallback(
    async (icon: IconHit) => {
      setInsertingId(icon.full);
      try {
        // Fetch the rendered SVG with the chosen colour baked in.
        const url = `https://api.iconify.design/${icon.prefix}/${icon.name}.svg?color=${encodeURIComponent(color)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Icon load failed: ${res.status}`);
        const svg = await res.text();
        const pageW = activePage?.width ?? 1280;
        const pageH = activePage?.height ?? 720;
        const SIZE = 160;
        const el: Omit<IconElement, "id"> = {
          type: "icon",
          x: pageW / 2 - SIZE / 2,
          y: pageH / 2 - SIZE / 2,
          width: SIZE,
          height: SIZE,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          svg,
          color,
        };
        addElement(el as Omit<ElementData, "id">);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setInsertingId(null);
      }
    },
    [activePage, addElement, color],
  );

  const previewParam = useMemo(() => `color=${encodeURIComponent(color)}`, [color]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-purple-700" />
        <h3 className="text-base font-bold text-purple-950">Icons</h3>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons..."
          className="w-full pl-8 pr-8 py-2 text-sm rounded-lg bg-purple-50 border border-purple-200 focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition"
          data-testid="icons-search-input"
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

      {/* Colour picker — re-tints both previews and inserted icons. */}
      <div className="flex items-center gap-2">
        <label className="text-[11px] uppercase tracking-wider font-bold text-purple-700">
          Colour
        </label>
        <div className="flex items-center gap-1">
          {["#7c3aed", "#0f172a", "#dc2626", "#16a34a", "#0ea5e9", "#f59e0b", "#ec4899"].map(
            (c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-5 w-5 rounded-full ring-2 transition ${
                  color === c ? "ring-purple-600 scale-110" : "ring-transparent"
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ),
          )}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-5 w-7 rounded cursor-pointer border-0 bg-transparent ml-1"
            aria-label="Custom color"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="leading-relaxed">{error}</div>
        </div>
      )}

      {/* Empty-search state → visual category grid (mirrors Photos /
          Graphics). Each tile shows a representative Iconify icon
          tinted in the active colour and triggers a real search on
          click. */}
      {!debounced && !error && (
        <IconCategoryGrid
          categories={ICON_CATEGORIES}
          color={color}
          onPick={(t) => setQuery(t)}
        />
      )}

      {loading && icons.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-purple-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading icons…
        </div>
      )}

      {!loading && debounced && icons.length === 0 && !error && (
        <div className="text-center py-6 text-purple-500 text-xs">
          No icons found.
        </div>
      )}

      {icons.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {icons.map((icon) => (
            <button
              key={icon.full}
              type="button"
              onClick={() => insertIcon(icon)}
              disabled={insertingId === icon.full}
              className="aspect-square rounded-lg border border-purple-200 bg-purple-50/40 hover:bg-purple-100 hover:border-purple-400 hover:scale-[1.05] transition-all flex items-center justify-center p-2 disabled:opacity-50"
              title={icon.full}
              data-testid={`icon-${icon.full}`}
            >
              {insertingId === icon.full ? (
                <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
              ) : (
                <img
                  src={`https://api.iconify.design/${icon.prefix}/${icon.name}.svg?${previewParam}`}
                  alt={icon.full}
                  loading="lazy"
                  className="w-full h-full object-contain"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Visual category grid for the empty-search state. Static covers
 * (single Iconify URL per category) — no fetching needed because
 * Iconify serves the SVG directly. The active colour is propagated
 * down so cover icons stay visually in sync with the colour swatch
 * users will pick from a moment later.
 */
interface IconCategoryGridProps {
  categories: { label: string; search: string; preview: string }[];
  color: string;
  onPick: (term: string) => void;
}

function IconCategoryGrid({ categories, color, onPick }: IconCategoryGridProps) {
  const colorParam = `color=${encodeURIComponent(color)}`;
  return (
    <div className="grid grid-cols-2 gap-2 pt-1">
      {categories.map((c) => (
        <button
          key={c.search}
          type="button"
          onClick={() => onPick(c.search)}
          className="relative h-24 rounded-lg overflow-hidden ring-1 ring-purple-200 hover:ring-2 hover:ring-purple-500 transition group bg-gradient-to-br from-purple-50 to-indigo-50"
          data-testid={`icon-category-${c.search}`}
        >
          <img
            src={`https://api.iconify.design/${c.preview}.svg?${colorParam}`}
            alt={c.label}
            loading="lazy"
            className="absolute inset-0 m-auto h-12 w-12 object-contain transition-transform group-hover:scale-110"
          />
          <div className="absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <span className="absolute left-2 bottom-1.5 right-2 text-white text-xs font-bold drop-shadow-md text-left">
            {c.label}
          </span>
        </button>
      ))}
    </div>
  );
}
