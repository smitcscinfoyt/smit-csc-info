// Helpers for the Background-Remover editor.
// Kept separate so the page component focuses on UI/state rather than
// pixel-pushing math.

export type BgMode = "transparent" | "color" | "image";

export interface BgConfig {
  mode: BgMode;
  color: string; // hex, used when mode === "color"
  imageUrl: string | null; // object URL of replacement bg, when mode === "image"
}

export interface EffectsConfig {
  bgBlur: number; // 0..30 px (only meaningful for image bg)
  shadow: number; // 0..1 opacity of soft shadow under cutout
  shadowBlur: number; // 0..40 px
}

export interface AdjustConfig {
  brightness: number; // 0..2 (1 = original)
  contrast: number; // 0..2 (1 = original)
  saturate: number; // 0..2 (1 = original)
}

export interface TextLayer {
  id: string;
  type: "text";
  text: string;
  x: number; // 0..1 normalized
  y: number;
  fontSize: number; // px at native res
  color: string;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  fontFamily: string;
}

export type DesignLayer = TextLayer;

export interface EditorState {
  bg: BgConfig;
  effects: EffectsConfig;
  adjust: AdjustConfig;
  design: DesignLayer[];
  // brush masks are stored as data URLs in history snapshots
  brushAdd: string | null;
  brushSub: string | null;
}

export const DEFAULT_STATE: EditorState = {
  bg: { mode: "transparent", color: "#ffffff", imageUrl: null },
  effects: { bgBlur: 0, shadow: 0, shadowBlur: 16 },
  adjust: { brightness: 1, contrast: 1, saturate: 1 },
  design: [],
  brushAdd: null,
  brushSub: null,
};

export async function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  const ownsUrl = typeof src !== "string";
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => resolve(i);
      i.onerror = (e) => reject(e);
      i.src = url;
    });
    return img;
  } finally {
    // Once the image element holds the decoded bitmap, the blob URL is
    // no longer needed. Revoke to prevent unbounded memory growth.
    if (ownsUrl) {
      // Defer one tick so the browser is fully done parsing the URL.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
}

/**
 * Render the entire composite (background + cutout + design) into the
 * provided canvas at the cutout's native pixel size.
 */
export function renderComposite(opts: {
  out: HTMLCanvasElement;
  cutout: HTMLImageElement;
  source: HTMLImageElement | null;
  brushAdd: HTMLCanvasElement | null;
  brushSub: HTMLCanvasElement | null;
  state: EditorState;
  bgImage: HTMLImageElement | null;
}) {
  const { out, cutout, source, brushAdd, brushSub, state, bgImage } = opts;
  const W = cutout.naturalWidth;
  const H = cutout.naturalHeight;
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d");
  if (!ctx) return;

  // 1. Background layer
  ctx.save();
  if (state.bg.mode === "color") {
    ctx.fillStyle = state.bg.color;
    ctx.fillRect(0, 0, W, H);
  } else if (state.bg.mode === "image" && bgImage) {
    if (state.effects.bgBlur > 0) {
      ctx.filter = `blur(${state.effects.bgBlur}px)`;
    }
    // cover-fit
    const ar = bgImage.naturalWidth / bgImage.naturalHeight;
    const tar = W / H;
    let dw = W,
      dh = H,
      dx = 0,
      dy = 0;
    if (ar > tar) {
      dh = H;
      dw = H * ar;
      dx = (W - dw) / 2;
    } else {
      dw = W;
      dh = W / ar;
      dy = (H - dh) / 2;
    }
    ctx.drawImage(bgImage, dx, dy, dw, dh);
  }
  ctx.restore();

  // 2. Build corrected cutout in offscreen
  const work = document.createElement("canvas");
  work.width = W;
  work.height = H;
  const wctx = work.getContext("2d")!;
  wctx.drawImage(cutout, 0, 0, W, H);
  // subtract erase strokes
  if (brushSub) {
    wctx.globalCompositeOperation = "destination-out";
    wctx.drawImage(brushSub, 0, 0, W, H);
    wctx.globalCompositeOperation = "source-over";
  }
  // restore additive strokes from original source
  if (brushAdd && source) {
    const restore = document.createElement("canvas");
    restore.width = W;
    restore.height = H;
    const rctx = restore.getContext("2d")!;
    rctx.drawImage(source, 0, 0, W, H);
    rctx.globalCompositeOperation = "destination-in";
    rctx.drawImage(brushAdd, 0, 0, W, H);
    wctx.drawImage(restore, 0, 0);
  }

  // 3. Optional drop shadow under the cutout
  if (state.effects.shadow > 0) {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${state.effects.shadow})`;
    ctx.shadowBlur = state.effects.shadowBlur;
    ctx.shadowOffsetY = Math.max(2, state.effects.shadowBlur / 4);
    ctx.drawImage(work, 0, 0);
    ctx.restore();
  }

  // 4. Apply colour adjusts and draw cutout
  ctx.save();
  const { brightness, contrast, saturate } = state.adjust;
  if (brightness !== 1 || contrast !== 1 || saturate !== 1) {
    ctx.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturate})`;
  }
  ctx.drawImage(work, 0, 0);
  ctx.restore();

  // 5. Design (text) layer
  for (const layer of state.design) {
    if (layer.type !== "text") continue;
    ctx.save();
    ctx.fillStyle = layer.color;
    ctx.font = `${layer.fontStyle} ${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(layer.text, layer.x * W, layer.y * H);
    ctx.restore();
  }
}

export function newId() {
  return Math.random().toString(36).slice(2, 9);
}

export async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality = 1,
): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      type,
      quality,
    );
  });
}

export function snapshotMask(canvas: HTMLCanvasElement | null): string | null {
  if (!canvas) return null;
  return canvas.toDataURL("image/png");
}

export async function restoreMask(
  dataUrl: string | null,
  target: HTMLCanvasElement,
): Promise<void> {
  const ctx = target.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, target.width, target.height);
  if (!dataUrl) return;
  const img = await loadImage(dataUrl);
  ctx.drawImage(img, 0, 0, target.width, target.height);
}
