/**
 * Prime Studio — element & page types.
 *
 * Every visual thing on the canvas is an `ElementData`. Pages own a list of
 * elements (top-of-list = back, end-of-list = front; we draw in array order).
 * Stored entirely in Zustand and serialised to JSON for save/load — never
 * holds Konva node refs (those live in the React tree).
 */

export type ElementId = string;

export interface BaseElement {
  id: ElementId;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
  opacity: number; // 0..1
  scaleX: number;
  scaleY: number;
  locked?: boolean;
  hidden?: boolean;
  groupId?: string | null;
  // Effects (all optional)
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number; opacity: number } | null;
  cornerRadius?: number; // rect only
  /**
   * Animation preset chosen for the element (Canva-style "Animate"
   * button). Stored on the element so it can be persisted, replayed and
   * eventually exported. The Stage previews it whenever the value
   * changes by tweening the Konva node briefly.
   */
  animation?: "none" | "fade" | "slide-left" | "slide-right" | "zoom" | "pulse" | "bounce" | null;
}

export interface RectElement extends BaseElement {
  type: "rect";
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash?: number[] | null;
}

export interface CircleElement extends BaseElement {
  type: "circle";
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash?: number[] | null;
}

export interface LineElement extends BaseElement {
  type: "line";
  // points are relative to (x,y) — [x1,y1,x2,y2] or polyline
  points: number[];
  stroke: string;
  strokeWidth: number;
  dash?: number[] | null;
  arrow?: boolean;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: string; // "normal" | "bold" | "italic" | "italic bold"
  textDecoration: string; // "" | "underline" | "line-through"
  align: "left" | "center" | "right";
  fill: string;
  lineHeight: number;
  letterSpacing: number;
  textCase?: "none" | "upper" | "lower" | "title";
}

export interface ImageElement extends BaseElement {
  type: "image";
  src: string; // data URL or remote URL
  filter?: "none" | "grayscale" | "sepia" | "invert" | "brighten" | "blur";
  brightness?: number; // -1..1
  contrast?: number; // -100..100
  saturation?: number; // -2..10
  cropBox?: { x: number; y: number; width: number; height: number } | null;
  flipX?: boolean;
  flipY?: boolean;
  // Pixel-level mask (eraser) painted via globalCompositeOperation when
  // exporting; stored as a data-URL of a black-on-transparent PNG sized
  // identical to the natural image. Null = no erase yet.
  eraseMask?: string | null;

  // ── Advanced image editing (Tools panel) ───────────────────────────
  /** Warm (+) / cool (-) shift. Range -100..100. */
  temperature?: number;
  /** Magenta (+) / green (-) shift. Range -100..100. */
  tint?: number;
  /** Pulls bright pixels up/down. Range -100..100. */
  highlights?: number;
  /** Pulls dark pixels up/down (don't confuse with `shadow` drop-shadow). */
  shadowsAdj?: number;
  /** Local-contrast boost. Range -100..100. */
  clarity?: number;
  /** Darkens corners. Range 0..100. */
  vignette?: number;
  /** Gaussian blur radius in px. */
  blurAmount?: number;
  /** Hue rotation degrees. Range -180..180. */
  hue?: number;
  /** Active filter preset id (e.g. "fresco", "noir"). Visual only — the
   *  individual adjustment fields above are the source of truth. */
  imagePreset?: string | null;
  /** Active shadow preset (glow / drop / outline / page-lift / angled /
   *  backdrop). When set, the corresponding shadow/outline fields are
   *  populated by the preset; users can then tweak them. */
  imageShadowPreset?:
    | "glow"
    | "drop"
    | "outline"
    | "page-lift"
    | "angled"
    | "backdrop"
    | null;
  /** Outline stroke (only meaningful when `imageShadowPreset === "outline"`). */
  imageOutline?: { color: string; width: number } | null;
  /** Where filter/adjustments apply. "all" works today; foreground /
   *  background require an AI cut-out and currently fall back to "all"
   *  with a UX hint to run BG Remove first. */
  imageEffectArea?: "all" | "foreground" | "background";
}

export interface IconElement extends BaseElement {
  type: "icon";
  // Inline SVG markup (already coloured). We rasterise to data-URL when
  // drawing so Konva can image-render it without an extra HTML overlay.
  svg: string;
  color: string;
}

export type ElementType = "rect" | "circle" | "line" | "text" | "image" | "icon";
export type ElementData =
  | RectElement
  | CircleElement
  | LineElement
  | TextElement
  | ImageElement
  | IconElement;

export interface PageData {
  id: string;
  name: string;
  width: number;
  height: number;
  background: string; // CSS colour OR "transparent"
  backgroundImage?: string | null;
  elements: ElementData[];
}

export interface ProjectData {
  id: string;
  title: string;
  pages: PageData[];
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_PAGE_W = 1280;
export const DEFAULT_PAGE_H = 720;

/** Generate a stable-ish unique id without pulling a uuid lib. */
export function uid(prefix = "el"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
