/**
 * Prime Studio — image effects engine.
 *
 * Encapsulates all the photo-editing maths that the Tools panel applies to
 * an `ImageElement`:
 *   • Custom Konva pixel filters (HighlightsShadows, TempTint, Vignette).
 *   • Apply / clear helpers that the `ImageNode` calls inside its effect.
 *   • Filter presets (Natural / Warm / Cool / Mono / Vintage) and shadow
 *     presets (Glow / Drop / Page-lift / Angled / Backdrop / Outline) used
 *     to render the preset-grid UI and to populate adjustment values when
 *     a preset is picked.
 *
 * Custom filters read their inputs from regular properties hung off the
 * Konva.Image node (e.g. `node._psHighlights`). We deliberately avoid
 * `Konva.Factory.addGetterSetter` so we don't pollute the global node
 * prototype across HMR reloads.
 */

import Konva from "konva";
import type { ImageElement } from "./types";

// ─── Custom Konva filters ────────────────────────────────────────────

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Highlights & Shadows (Lightroom-style). Each is -100..100; positive
 *  values lift the corresponding tonal range, negative values crush it. */
function highlightsShadowsFilter(this: any, imageData: ImageData) {
  const h = ((this._psHighlights as number | undefined) ?? 0) / 100;
  const s = ((this._psShadows as number | undefined) ?? 0) / 100;
  if (h === 0 && s === 0) return;
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // ITU-R BT.601 luma — quick and good enough for tonal weights.
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const hw = lum * lum; // peaks at lum=1
    const sw = (1 - lum) * (1 - lum); // peaks at lum=0
    const adj = h * 80 * hw + s * 80 * sw;
    data[i] = clamp255(r + adj);
    data[i + 1] = clamp255(g + adj);
    data[i + 2] = clamp255(b + adj);
  }
}

/** Temperature (warm/cool) and Tint (magenta/green) RGB shifts. Each
 *  -100..100. Subtle so the slider feels natural. */
function tempTintFilter(this: any, imageData: ImageData) {
  const t = (this._psTemperature as number | undefined) ?? 0;
  const tn = (this._psTint as number | undefined) ?? 0;
  if (t === 0 && tn === 0) return;
  const tR = t * 0.6;
  const tB = -t * 0.6;
  const tnG = -tn * 0.5;
  const tnRB = tn * 0.25;
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp255(data[i] + tR + tnRB);
    data[i + 1] = clamp255(data[i + 1] + tnG);
    data[i + 2] = clamp255(data[i + 2] + tB + tnRB);
  }
}

/** Vignette — radial darken from corners. 0..100. */
function vignetteFilter(this: any, imageData: ImageData) {
  const v = ((this._psVignette as number | undefined) ?? 0) / 100;
  if (v <= 0) return;
  const w = imageData.width;
  const h = imageData.height;
  const cx = w / 2;
  const cy = h / 2;
  const maxD = Math.sqrt(cx * cx + cy * cy);
  const data = imageData.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / maxD; // 0..1
      // ease-in: only darkens past mid-radius
      const t = Math.max(0, dist - 0.4) / 0.6;
      const factor = 1 - v * t * t;
      const i = (y * w + x) * 4;
      data[i] *= factor;
      data[i + 1] *= factor;
      data[i + 2] *= factor;
    }
  }
}

// Register once per browser session — re-registering on HMR is harmless.
const KF = Konva.Filters as any;
if (!KF._psRegistered) {
  KF.PSHighlightsShadows = highlightsShadowsFilter;
  KF.PSTempTint = tempTintFilter;
  KF.PSVignette = vignetteFilter;
  KF._psRegistered = true;
}

// ─── Apply / clear helpers ───────────────────────────────────────────

/** Convert a 0..1 fraction-style brightness (Konva's expected range) from
 *  our slider value (-100..100). */
const toBrighten = (v: number) => Math.max(-1, Math.min(1, v / 100));

/** Maps our -100..100 saturation to Konva HSL `saturation` getter (-2..10).
 *  100 → +2 (vivid), -100 → -2 (greyish). */
const toHslSat = (v: number) => Math.max(-2, Math.min(10, (v / 100) * 2));

/** Apply every active filter / adjustment from `el` onto the live Konva
 *  image node. Caches the node so filters take effect, or clears the cache
 *  when no filters are active. Always called from a `useEffect`. */
export function applyImageEffects(node: Konva.Image, el: ImageElement) {
  // Stash custom-filter inputs on the node so our filter callbacks find them.
  (node as any)._psTemperature = el.temperature ?? 0;
  (node as any)._psTint = el.tint ?? 0;
  (node as any)._psHighlights = el.highlights ?? 0;
  (node as any)._psShadows = el.shadowsAdj ?? 0;
  (node as any)._psVignette = el.vignette ?? 0;

  const filters: any[] = [];

  // Built-in legacy filter (kept for backward compat with old elements).
  if (el.filter === "grayscale") filters.push(Konva.Filters.Grayscale);
  if (el.filter === "sepia") filters.push(Konva.Filters.Sepia);
  if (el.filter === "invert") filters.push(Konva.Filters.Invert);

  if (typeof el.brightness === "number" && el.brightness !== 0) {
    filters.push(Konva.Filters.Brighten);
    node.brightness(el.brightness);
  } else {
    node.brightness(0);
  }

  if (typeof el.contrast === "number" && el.contrast !== 0) {
    filters.push(Konva.Filters.Contrast);
    node.contrast(el.contrast);
  } else {
    node.contrast(0);
  }

  // Saturation arrives as -100..100 from the Tools-panel sliders / presets
  // but Konva's HSL filter expects roughly -2..10. Map through `toHslSat`
  // so a slider value of "100" gives a tasteful vivid bump rather than a
  // blown-out pixel storm. Legacy elements that wrote raw -2..10 values
  // before this fix become slightly less saturated — acceptable.
  const hasSat = typeof el.saturation === "number" && el.saturation !== 0;
  const hasHue = typeof el.hue === "number" && el.hue !== 0;
  if (hasSat || hasHue) {
    filters.push(Konva.Filters.HSL);
    node.saturation(hasSat ? toHslSat(el.saturation as number) : 0);
    node.hue(el.hue ?? 0);
  } else {
    node.saturation(0);
    node.hue(0);
  }

  // Clarity → Konva.Filters.Enhance (-1..1). We clamp from -100..100.
  if (typeof el.clarity === "number" && el.clarity !== 0) {
    filters.push(Konva.Filters.Enhance);
    node.enhance(Math.max(-1, Math.min(1, el.clarity / 100)));
  } else {
    node.enhance(0);
  }

  // Blur — explicit slider OR legacy `filter==="blur"`.
  const blurR =
    el.filter === "blur" ? 8 : typeof el.blurAmount === "number" ? el.blurAmount : 0;
  if (blurR > 0) {
    filters.push(Konva.Filters.Blur);
    node.blurRadius(blurR);
  } else {
    node.blurRadius(0);
  }

  // Custom filters
  if ((el.temperature ?? 0) !== 0 || (el.tint ?? 0) !== 0) {
    filters.push(KF.PSTempTint);
  }
  if ((el.highlights ?? 0) !== 0 || (el.shadowsAdj ?? 0) !== 0) {
    filters.push(KF.PSHighlightsShadows);
  }
  if ((el.vignette ?? 0) > 0) {
    filters.push(KF.PSVignette);
  }

  if (filters.length) {
    node.filters(filters);
    // cache() is required for Konva to actually run the filter pipeline.
    // Use pixelRatio:1 so the cache size matches displayed pixels (faster
    // re-render) and `imageSmoothingEnabled:false` for sharper RGB filters.
    node.cache();
  } else {
    node.filters(null);
    node.clearCache();
  }

  // ── Shadow / outline ─────────────────────────────────────────────
  const sp = el.imageShadowPreset ?? null;
  if (sp === "outline") {
    node.shadowEnabled(false);
    node.stroke(el.imageOutline?.color ?? "#1f0a3c");
    node.strokeWidth(el.imageOutline?.width ?? 6);
    node.strokeEnabled(true);
  } else if (el.shadow) {
    node.strokeEnabled(false);
    node.shadowEnabled(true);
    node.shadowColor(el.shadow.color);
    node.shadowBlur(el.shadow.blur);
    node.shadowOffsetX(el.shadow.offsetX);
    node.shadowOffsetY(el.shadow.offsetY);
    node.shadowOpacity(el.shadow.opacity);
  } else {
    node.shadowEnabled(false);
    node.strokeEnabled(false);
  }

  node.getLayer()?.batchDraw();
}

// ─── Filter presets (Canva-style preset grid) ────────────────────────

export interface ImageFilterPreset {
  id: string;
  name: string;
  category: "natural" | "warm" | "cool" | "mono" | "vintage";
  /** CSS-filter equivalent for the thumbnail preview (close enough — the
   *  on-canvas Konva pipeline is the source of truth). */
  css: string;
  /** Adjustment values written into the ImageElement when picked. */
  params: Partial<
    Pick<
      ImageElement,
      | "brightness"
      | "contrast"
      | "saturation"
      | "temperature"
      | "tint"
      | "highlights"
      | "shadowsAdj"
      | "clarity"
      | "vignette"
      | "hue"
      | "filter"
    >
  >;
}

export const IMAGE_FILTER_PRESETS: ImageFilterPreset[] = [
  // ── Natural ────────────────────────────────────────────────────
  {
    id: "fresco",
    name: "Fresco",
    category: "natural",
    css: "brightness(1.05) contrast(1.08) saturate(1.15)",
    params: { brightness: 0.05, contrast: 8, saturation: 30, clarity: 15, temperature: 8 },
  },
  {
    id: "belvedere",
    name: "Belvedere",
    category: "natural",
    css: "brightness(1.02) contrast(0.95) saturate(0.95) hue-rotate(-8deg)",
    params: { brightness: 0.02, contrast: -5, saturation: -10, temperature: -10 },
  },
  {
    id: "verde",
    name: "Verde",
    category: "natural",
    css: "brightness(1.04) saturate(1.2) hue-rotate(8deg)",
    params: { brightness: 0.04, saturation: 25, tint: -25, clarity: 10 },
  },
  {
    id: "meadow",
    name: "Meadow",
    category: "natural",
    css: "brightness(1.06) contrast(1.05) saturate(1.1) hue-rotate(4deg)",
    params: { brightness: 0.06, contrast: 5, saturation: 15, tint: -10 },
  },

  // ── Warm ───────────────────────────────────────────────────────
  {
    id: "sunshine",
    name: "Sunshine",
    category: "warm",
    css: "brightness(1.08) saturate(1.2) sepia(0.15)",
    params: { brightness: 0.08, saturation: 25, temperature: 35, highlights: 10 },
  },
  {
    id: "glow",
    name: "Glow",
    category: "warm",
    css: "brightness(1.12) contrast(0.95) saturate(1.1) sepia(0.08)",
    params: { brightness: 0.12, contrast: -5, saturation: 15, temperature: 25, highlights: 20 },
  },
  {
    id: "sunset",
    name: "Sunset",
    category: "warm",
    css: "brightness(1.02) contrast(1.05) saturate(1.25) sepia(0.2)",
    params: { contrast: 5, saturation: 30, temperature: 50, tint: 10, vignette: 25 },
  },
  {
    id: "honey",
    name: "Honey",
    category: "warm",
    css: "brightness(1.06) saturate(1.15) sepia(0.18)",
    params: { brightness: 0.06, saturation: 20, temperature: 40, clarity: 8 },
  },

  // ── Cool ───────────────────────────────────────────────────────
  {
    id: "iceland",
    name: "Iceland",
    category: "cool",
    css: "brightness(1.05) contrast(1.05) saturate(0.9) hue-rotate(-15deg)",
    params: { brightness: 0.05, contrast: 5, saturation: -10, temperature: -35 },
  },
  {
    id: "mist",
    name: "Mist",
    category: "cool",
    css: "brightness(1.1) contrast(0.9) saturate(0.85) hue-rotate(-10deg)",
    params: { brightness: 0.1, contrast: -10, saturation: -15, temperature: -25, highlights: 15 },
  },
  {
    id: "ocean",
    name: "Ocean",
    category: "cool",
    css: "brightness(1.02) contrast(1.1) saturate(1.05) hue-rotate(-20deg)",
    params: { contrast: 10, saturation: 5, temperature: -45, tint: 15 },
  },
  {
    id: "polar",
    name: "Polar",
    category: "cool",
    css: "brightness(1.08) contrast(1.05) saturate(0.7) hue-rotate(-12deg)",
    params: { brightness: 0.08, contrast: 5, saturation: -30, temperature: -30, clarity: 12 },
  },

  // ── Mono ───────────────────────────────────────────────────────
  {
    id: "classic",
    name: "Classic",
    category: "mono",
    css: "grayscale(1) contrast(1.08)",
    params: { filter: "grayscale", contrast: 8 },
  },
  {
    id: "noir",
    name: "Noir",
    category: "mono",
    css: "grayscale(1) contrast(1.4) brightness(0.92)",
    params: { filter: "grayscale", contrast: 35, brightness: -0.08, vignette: 35 },
  },
  {
    id: "bright",
    name: "Bright",
    category: "mono",
    css: "grayscale(1) contrast(0.92) brightness(1.1)",
    params: { filter: "grayscale", contrast: -8, brightness: 0.1, highlights: 15 },
  },
  {
    id: "silver",
    name: "Silver",
    category: "mono",
    css: "grayscale(1) contrast(1.05) brightness(1.04)",
    params: { filter: "grayscale", contrast: 5, brightness: 0.04, clarity: 12 },
  },

  // ── Vintage ────────────────────────────────────────────────────
  {
    id: "retro",
    name: "Retro",
    category: "vintage",
    css: "sepia(0.4) saturate(0.8) contrast(0.9) brightness(1.05)",
    params: { contrast: -10, saturation: -20, temperature: 25, vignette: 30, brightness: 0.04 },
  },
  {
    id: "faded",
    name: "Faded",
    category: "vintage",
    css: "sepia(0.2) saturate(0.7) contrast(0.85) brightness(1.08)",
    params: { contrast: -18, saturation: -30, brightness: 0.08, highlights: 25, temperature: 10 },
  },
  {
    id: "sepia",
    name: "Sepia",
    category: "vintage",
    css: "sepia(1) brightness(1.02)",
    params: { filter: "sepia" },
  },
  {
    id: "polaroid",
    name: "Polaroid",
    category: "vintage",
    css: "sepia(0.25) saturate(1.1) contrast(0.95) brightness(1.05) hue-rotate(-5deg)",
    params: { contrast: -5, saturation: 10, temperature: 18, vignette: 20, brightness: 0.05 },
  },
];

/** All adjustment fields a preset can write — used to clear them when the
 *  user picks "Original" / removes a preset. */
export const ADJUSTMENT_FIELDS = [
  "brightness",
  "contrast",
  "saturation",
  "temperature",
  "tint",
  "highlights",
  "shadowsAdj",
  "clarity",
  "vignette",
  "hue",
  "blurAmount",
] as const;

// ─── Shadow presets ──────────────────────────────────────────────────

export type ShadowPresetId =
  | "glow"
  | "drop"
  | "outline"
  | "page-lift"
  | "angled"
  | "backdrop";

export interface ShadowPreset {
  id: ShadowPresetId;
  name: string;
  description: string;
  /** Patch applied to the ImageElement when the preset is picked. */
  apply: (el: ImageElement) => Partial<ImageElement>;
}

export const SHADOW_PRESETS: ShadowPreset[] = [
  {
    id: "glow",
    name: "Glow",
    description: "Soft halo around the image",
    apply: () => ({
      imageShadowPreset: "glow",
      imageOutline: null,
      shadow: {
        color: "#facc15",
        offsetX: 0,
        offsetY: 0,
        blur: 35,
        opacity: 0.85,
      },
    }),
  },
  {
    id: "drop",
    name: "Drop",
    description: "Classic offset shadow",
    apply: () => ({
      imageShadowPreset: "drop",
      imageOutline: null,
      shadow: {
        color: "#000000",
        offsetX: 14,
        offsetY: 14,
        blur: 22,
        opacity: 0.4,
      },
    }),
  },
  {
    id: "outline",
    name: "Outline",
    description: "Solid stroke around the frame",
    apply: () => ({
      imageShadowPreset: "outline",
      shadow: null,
      imageOutline: { color: "#1f0a3c", width: 8 },
    }),
  },
  {
    id: "page-lift",
    name: "Page lift",
    description: "Lifts the photo off the page",
    apply: () => ({
      imageShadowPreset: "page-lift",
      imageOutline: null,
      shadow: {
        color: "#000000",
        offsetX: 0,
        offsetY: 28,
        blur: 38,
        opacity: 0.32,
      },
    }),
  },
  {
    id: "angled",
    name: "Angled",
    description: "Hard diagonal shadow",
    apply: () => ({
      imageShadowPreset: "angled",
      imageOutline: null,
      shadow: {
        color: "#1f0a3c",
        offsetX: 22,
        offsetY: 22,
        blur: 0,
        opacity: 0.55,
      },
    }),
  },
  {
    id: "backdrop",
    name: "Backdrop",
    description: "Heavy stamp behind the image",
    apply: () => ({
      imageShadowPreset: "backdrop",
      imageOutline: null,
      shadow: {
        color: "#facc15",
        offsetX: 16,
        offsetY: 16,
        blur: 0,
        opacity: 0.9,
      },
    }),
  },
];

/** Patch that clears every shadow / outline / preset field. */
export const CLEAR_SHADOW_PATCH: Partial<ImageElement> = {
  shadow: null,
  imageShadowPreset: null,
  imageOutline: null,
};
