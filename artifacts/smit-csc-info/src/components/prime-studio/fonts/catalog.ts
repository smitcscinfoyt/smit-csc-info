/**
 * Google Fonts catalog + lazy-loader for Prime Studio.
 *
 * Strategy:
 *  • Fetches the FULL Google Fonts catalog (~2000 fonts) once from
 *    Fontsource's free public API (https://api.fontsource.org/v1/fonts).
 *    No API key required.
 *  • Caches the catalog in localStorage for 7 days so subsequent loads
 *    are instant and offline-friendly.
 *  • Ships with a hard-coded "popular fonts" subset so the picker is
 *    populated immediately on first visit, even before the network
 *    request resolves.
 *  • `loadGoogleFont(family)` injects a <link rel="stylesheet"> to
 *    Google Fonts CSS API on demand, then waits for the actual font
 *    file via FontFaceObserver before resolving — so Konva can re-render
 *    text crisply with the new typeface.
 */

// @ts-expect-error — fontfaceobserver ships no .d.ts
import FontFaceObserver from "fontfaceobserver";

export interface FontMeta {
  family: string;
  category: string;
  subsets: string[];
  weights: number[];
  styles?: string[];
}

const STORAGE_KEY = "ps:google-fonts:v1";
const STORAGE_TS_KEY = "ps:google-fonts:v1:ts";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Hand-curated list — guaranteed to be available the moment Prime Studio mounts. */
export const POPULAR_GOOGLE_FONTS: FontMeta[] = [
  // Sans-serif (most-used)
  { family: "Inter", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800] },
  { family: "Roboto", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 700, 900] },
  { family: "Open Sans", category: "sans-serif", subsets: ["latin"], weights: [400, 600, 700, 800] },
  { family: "Poppins", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800, 900] },
  { family: "Montserrat", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800, 900] },
  { family: "Lato", category: "sans-serif", subsets: ["latin"], weights: [400, 700, 900] },
  { family: "Nunito", category: "sans-serif", subsets: ["latin"], weights: [400, 600, 700, 800, 900] },
  { family: "Nunito Sans", category: "sans-serif", subsets: ["latin"], weights: [400, 600, 700, 800] },
  { family: "Raleway", category: "sans-serif", subsets: ["latin"], weights: [400, 600, 700, 800] },
  { family: "Work Sans", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "Source Sans 3", category: "sans-serif", subsets: ["latin"], weights: [400, 600, 700] },
  { family: "PT Sans", category: "sans-serif", subsets: ["latin"], weights: [400, 700] },
  { family: "Oswald", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "Mulish", category: "sans-serif", subsets: ["latin"], weights: [400, 600, 700, 800] },
  { family: "Manrope", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800] },
  { family: "DM Sans", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 700] },
  { family: "Outfit", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800] },
  { family: "Plus Jakarta Sans", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800] },
  { family: "Sora", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800] },
  { family: "Quicksand", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "Rubik", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800] },
  { family: "Karla", category: "sans-serif", subsets: ["latin"], weights: [400, 600, 700, 800] },
  { family: "Cabin", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "Barlow", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800] },
  { family: "Bebas Neue", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Anton", category: "sans-serif", subsets: ["latin"], weights: [400] },
  { family: "Archivo", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800] },
  { family: "Archivo Black", category: "sans-serif", subsets: ["latin"], weights: [400] },
  { family: "Fira Sans", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "Hind", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "Public Sans", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800] },
  { family: "Be Vietnam Pro", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800] },
  { family: "Space Grotesk", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "Urbanist", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800, 900] },

  // Serif
  { family: "Playfair Display", category: "serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800, 900] },
  { family: "Merriweather", category: "serif", subsets: ["latin"], weights: [400, 700, 900] },
  { family: "Lora", category: "serif", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "PT Serif", category: "serif", subsets: ["latin"], weights: [400, 700] },
  { family: "Source Serif 4", category: "serif", subsets: ["latin"], weights: [400, 600, 700] },
  { family: "Roboto Slab", category: "serif", subsets: ["latin"], weights: [400, 500, 700, 900] },
  { family: "EB Garamond", category: "serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800] },
  { family: "Cormorant Garamond", category: "serif", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "Crimson Text", category: "serif", subsets: ["latin"], weights: [400, 600, 700] },
  { family: "Libre Baskerville", category: "serif", subsets: ["latin"], weights: [400, 700] },
  { family: "Bitter", category: "serif", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "Cormorant", category: "serif", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "DM Serif Display", category: "serif", subsets: ["latin"], weights: [400] },
  { family: "Noto Serif", category: "serif", subsets: ["latin"], weights: [400, 700] },
  { family: "Spectral", category: "serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800] },
  { family: "Cardo", category: "serif", subsets: ["latin"], weights: [400, 700] },

  // Display
  { family: "Shrikhand", category: "display", subsets: ["latin", "gujarati"], weights: [400] },
  { family: "Lobster", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Pacifico", category: "handwriting", subsets: ["latin"], weights: [400] },
  { family: "Righteous", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Permanent Marker", category: "handwriting", subsets: ["latin"], weights: [400] },
  { family: "Caveat", category: "handwriting", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "Dancing Script", category: "handwriting", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "Great Vibes", category: "handwriting", subsets: ["latin"], weights: [400] },
  { family: "Satisfy", category: "handwriting", subsets: ["latin"], weights: [400] },
  { family: "Sacramento", category: "handwriting", subsets: ["latin"], weights: [400] },
  { family: "Kaushan Script", category: "handwriting", subsets: ["latin"], weights: [400] },
  { family: "Indie Flower", category: "handwriting", subsets: ["latin"], weights: [400] },
  { family: "Shadows Into Light", category: "handwriting", subsets: ["latin"], weights: [400] },
  { family: "Amatic SC", category: "handwriting", subsets: ["latin"], weights: [400, 700] },
  { family: "Yellowtail", category: "handwriting", subsets: ["latin"], weights: [400] },
  { family: "Marck Script", category: "handwriting", subsets: ["latin"], weights: [400] },
  { family: "Alfa Slab One", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Russo One", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Bungee", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Fjalla One", category: "sans-serif", subsets: ["latin"], weights: [400] },
  { family: "Press Start 2P", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Monoton", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Abril Fatface", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Yeseva One", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Comfortaa", category: "display", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "Black Ops One", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Audiowide", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Orbitron", category: "sans-serif", subsets: ["latin"], weights: [400, 500, 600, 700, 800, 900] },
  { family: "Bowlby One", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Patua One", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Special Elite", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Creepster", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Rye", category: "display", subsets: ["latin"], weights: [400] },
  { family: "Ultra", category: "serif", subsets: ["latin"], weights: [400] },

  // Monospace
  { family: "JetBrains Mono", category: "monospace", subsets: ["latin"], weights: [400, 500, 600, 700, 800] },
  { family: "Fira Code", category: "monospace", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "Source Code Pro", category: "monospace", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "Roboto Mono", category: "monospace", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "IBM Plex Mono", category: "monospace", subsets: ["latin"], weights: [400, 500, 600, 700] },
  { family: "Space Mono", category: "monospace", subsets: ["latin"], weights: [400, 700] },
  { family: "Inconsolata", category: "monospace", subsets: ["latin"], weights: [400, 500, 600, 700, 800, 900] },

  // Gujarati / Indic — important for Smit CSC Info
  { family: "Noto Sans Gujarati", category: "sans-serif", subsets: ["gujarati", "latin"], weights: [400, 500, 600, 700, 800, 900] },
  { family: "Noto Serif Gujarati", category: "serif", subsets: ["gujarati", "latin"], weights: [400, 500, 600, 700, 800, 900] },
  { family: "Mukta Vaani", category: "sans-serif", subsets: ["gujarati", "latin"], weights: [400, 500, 600, 700, 800] },
  { family: "Anek Gujarati", category: "sans-serif", subsets: ["gujarati", "latin"], weights: [400, 500, 600, 700, 800] },
  { family: "Hind Vadodara", category: "sans-serif", subsets: ["gujarati", "latin"], weights: [400, 500, 600, 700] },
  { family: "Baloo Bhai 2", category: "display", subsets: ["gujarati", "latin"], weights: [400, 500, 600, 700, 800] },
  { family: "Farsan", category: "display", subsets: ["gujarati", "latin"], weights: [400] },
  { family: "Mogra", category: "display", subsets: ["gujarati", "latin"], weights: [400] },
  { family: "Kumar One", category: "display", subsets: ["gujarati", "latin"], weights: [400] },
  { family: "Kumar One Outline", category: "display", subsets: ["gujarati", "latin"], weights: [400] },
  { family: "Rasa", category: "serif", subsets: ["gujarati", "latin"], weights: [400, 500, 600, 700] },

  // Devanagari (Hindi/Marathi) — same script reach
  { family: "Hind", category: "sans-serif", subsets: ["devanagari", "latin"], weights: [400, 500, 600, 700] },
  { family: "Mukta", category: "sans-serif", subsets: ["devanagari", "latin"], weights: [400, 500, 600, 700, 800] },
  { family: "Noto Sans Devanagari", category: "sans-serif", subsets: ["devanagari", "latin"], weights: [400, 500, 600, 700, 800, 900] },
  { family: "Tiro Devanagari Hindi", category: "serif", subsets: ["devanagari", "latin"], weights: [400] },
];

// Loaded variants per family: Map<family, Set<"weight:style">> e.g. "700:normal"
const loadedVariants = new Map<string, Set<string>>();
// Per-(family, variant-set) load promise — deduped, deleted on settle to
// prevent unbounded growth in long sessions.
const loadingPromises = new Map<string, Promise<void>>();
// Family-load listeners (used by Stage to bump a rev so Konva re-measures)
const onLoadListeners = new Set<(family: string) => void>();

const variantKey = (w: number, style: "normal" | "italic" = "normal") => `${w}:${style}`;

export function isFontLoaded(family: string, weight = 400, style: "normal" | "italic" = "normal"): boolean {
  return loadedVariants.get(family)?.has(variantKey(weight, style)) ?? false;
}

export function onFontLoaded(cb: (family: string) => void): () => void {
  onLoadListeners.add(cb);
  return () => onLoadListeners.delete(cb);
}

/**
 * Lazily inject a Google Fonts <link> for the given family + variants
 * and resolve once the font is actually painted (FontFaceObserver).
 *
 * Tracks loaded weight/style variants per-family — so a quick preview
 * load of (Roboto, [400]) does NOT block a later usage of bold weight
 * (Roboto, [700]) from fetching the missing variant.
 */
export async function loadGoogleFont(
  family: string,
  weights: number[] = [400, 700],
  styles: Array<"normal" | "italic"> = ["normal"],
): Promise<void> {
  if (!family || typeof document === "undefined") return;

  // Determine which (weight, style) variants are not yet loaded.
  const have = loadedVariants.get(family) ?? new Set<string>();
  const missing: Array<{ w: number; s: "normal" | "italic" }> = [];
  for (const w of weights) {
    for (const s of styles) {
      if (!have.has(variantKey(w, s))) missing.push({ w, s });
    }
  }
  if (missing.length === 0) return;

  // Cache key includes the variants requested so two parallel callers
  // for different variants don't collide.
  const cacheKey = `${family}|${missing.map((m) => `${m.w}${m.s[0]}`).sort().join(",")}`;
  const existing = loadingPromises.get(cacheKey);
  if (existing) return existing;

  const p = (async () => {
    // Build axis spec. CSS2 syntax: ital,wght@0,400;0,700;1,400;1,700
    const hasItalic = missing.some((m) => m.s === "italic");
    let axis: string;
    if (hasItalic) {
      const tuples = missing
        .map((m) => `${m.s === "italic" ? 1 : 0},${m.w}`)
        .sort();
      axis = `ital,wght@${tuples.join(";")}`;
    } else {
      const ws = [...new Set(missing.map((m) => m.w))].sort((a, b) => a - b);
      axis = `wght@${ws.join(";")}`;
    }
    // Each (family,variant-set) gets its own <link> so additional
    // variants for an already-loaded family stack rather than replace.
    const id = `gf-${family.replace(/\s+/g, "-").toLowerCase()}-${missing.map((m) => `${m.w}${m.s[0]}`).sort().join("")}`;
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${axis}&display=swap`;
      document.head.appendChild(link);
    }
    try {
      // Observe each variant in parallel so we resolve only when the
      // browser has actually painted them. Failures (unusual scripts /
      // 8s timeout) are swallowed — we still mark variants as
      // "loaded" so we don't spin trying again.
      await Promise.allSettled(
        missing.map((m) =>
          new FontFaceObserver(family, { weight: m.w, style: m.s }).load(null, 8000),
        ),
      );
    } catch {/* swallow */}
    const next = loadedVariants.get(family) ?? new Set<string>();
    for (const m of missing) next.add(variantKey(m.w, m.s));
    loadedVariants.set(family, next);
    onLoadListeners.forEach((l) => l(family));
  })().finally(() => {
    // Prune cache entry — important so loadingPromises doesn't grow
    // unbounded across a long editing session.
    loadingPromises.delete(cacheKey);
  });
  loadingPromises.set(cacheKey, p);
  return p;
}

/**
 * Returns the in-memory full catalog. On first call, kicks off a
 * background fetch of the full Google Fonts list from Fontsource API.
 * The promise resolves with the merged catalog (popular + fetched).
 */
let cachedCatalog: FontMeta[] | null = null;
let catalogPromise: Promise<FontMeta[]> | null = null;

export function getCatalogSync(): FontMeta[] {
  return cachedCatalog ?? POPULAR_GOOGLE_FONTS;
}

export async function ensureFullCatalog(): Promise<FontMeta[]> {
  if (cachedCatalog) return cachedCatalog;
  if (catalogPromise) return catalogPromise;

  catalogPromise = (async () => {
    // 1) Try localStorage
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const ts = Number(localStorage.getItem(STORAGE_TS_KEY) ?? "0");
      if (raw && Date.now() - ts < TTL_MS) {
        const parsed = JSON.parse(raw) as FontMeta[];
        if (Array.isArray(parsed) && parsed.length > 100) {
          cachedCatalog = parsed;
          return parsed;
        }
      }
    } catch {/* ignore */}

    // 2) Fetch from Fontsource public API
    try {
      const res = await fetch("https://api.fontsource.org/v1/fonts");
      if (!res.ok) throw new Error("fontsource list failed");
      const data: any[] = await res.json();
      const fonts: FontMeta[] = data
        .filter((f) => f.type === "google")
        .map((f) => ({
          family: f.family,
          category: f.category ?? "sans-serif",
          subsets: f.subsets ?? ["latin"],
          weights: (f.weights ?? [400]).map(Number),
          styles: f.styles,
        }))
        .sort((a, b) => a.family.localeCompare(b.family));
      cachedCatalog = fonts;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fonts));
        localStorage.setItem(STORAGE_TS_KEY, String(Date.now()));
      } catch {/* quota exceeded etc. */}
      return fonts;
    } catch {
      // 3) Fallback: just the popular set
      cachedCatalog = POPULAR_GOOGLE_FONTS;
      return POPULAR_GOOGLE_FONTS;
    }
  })();

  return catalogPromise;
}
