export interface UpscaleOptions {
  scale: 2 | 4;
  denoise?: number;
  sharpen?: number;
  onProgress?: (pct: number) => void;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function bicubicStep(
  src: HTMLCanvasElement | HTMLImageElement,
  factor: number,
): HTMLCanvasElement {
  const sw =
    "naturalWidth" in src ? src.naturalWidth || (src as HTMLImageElement).width : src.width;
  const sh =
    "naturalHeight" in src ? src.naturalHeight || (src as HTMLImageElement).height : src.height;
  const dw = Math.round(sw * factor);
  const dh = Math.round(sh * factor);
  const out = makeCanvas(dw, dh);
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src as CanvasImageSource, 0, 0, dw, dh);
  return out;
}

function unsharpMask(canvas: HTMLCanvasElement, amount: number, radius = 1): HTMLCanvasElement {
  if (amount <= 0) return canvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const w = canvas.width;
  const h = canvas.height;
  const src = ctx.getImageData(0, 0, w, h);
  const blurred = boxBlur(src, w, h, radius);
  const out = ctx.createImageData(w, h);
  for (let i = 0; i < src.data.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const v = src.data[i + k] + amount * (src.data[i + k] - blurred.data[i + k]);
      out.data[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    out.data[i + 3] = src.data[i + 3];
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

function boxBlur(src: ImageData, w: number, h: number, r: number): ImageData {
  const out = new ImageData(w, h);
  const tmp = new Uint8ClampedArray(src.data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r0 = 0,
        g0 = 0,
        b0 = 0,
        n = 0;
      for (let dx = -r; dx <= r; dx++) {
        const xx = Math.min(w - 1, Math.max(0, x + dx));
        const i = (y * w + xx) * 4;
        r0 += src.data[i];
        g0 += src.data[i + 1];
        b0 += src.data[i + 2];
        n++;
      }
      const j = (y * w + x) * 4;
      tmp[j] = r0 / n;
      tmp[j + 1] = g0 / n;
      tmp[j + 2] = b0 / n;
      tmp[j + 3] = src.data[j + 3];
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r0 = 0,
        g0 = 0,
        b0 = 0,
        n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        const i = (yy * w + x) * 4;
        r0 += tmp[i];
        g0 += tmp[i + 1];
        b0 += tmp[i + 2];
        n++;
      }
      const j = (y * w + x) * 4;
      out.data[j] = r0 / n;
      out.data[j + 1] = g0 / n;
      out.data[j + 2] = b0 / n;
      out.data[j + 3] = tmp[j + 3];
    }
  }
  return out;
}

function autoLevels(canvas: HTMLCanvasElement, strength = 0.6): HTMLCanvasElement {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  // Build histogram of luminance, find 1st and 99th percentile, stretch.
  const hist = new Uint32Array(256);
  const lum = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
    const y = (0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]) | 0;
    lum[p] = y;
    hist[y]++;
  }
  const total = w * h;
  const lo = Math.round(total * 0.005);
  const hi = Math.round(total * 0.995);
  let acc = 0,
    minL = 0,
    maxL = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= lo) {
      minL = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= total - hi) {
      maxL = v;
      break;
    }
  }
  if (maxL <= minL) return canvas;
  const range = maxL - minL;
  const k = strength;
  for (let i = 0; i < img.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const orig = img.data[i + c];
      const stretched = ((orig - minL) * 255) / range;
      const v = orig * (1 - k) + stretched * k;
      img.data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Real AI super-resolution using UpscalerJS + ESRGAN-slim model.
 * Downloads ~5 MB model on first use, then cached by the browser.
 * Falls back to bicubic + sharpen if the model can't load.
 */
let upscalerInstance: any | null = null;
let upscalerLoading: Promise<any> | null = null;

async function getUpscaler() {
  if (upscalerInstance) return upscalerInstance;
  if (upscalerLoading) return upscalerLoading;
  upscalerLoading = (async () => {
    const [{ default: Upscaler }, modelMod, tf] = await Promise.all([
      import("upscaler"),
      import("@upscalerjs/esrgan-slim"),
      import("@tensorflow/tfjs"),
    ]);
    // Prefer WebGL backend for speed; fall back to CPU silently.
    try {
      await tf.setBackend("webgl");
      await tf.ready();
    } catch {
      try {
        await tf.setBackend("cpu");
        await tf.ready();
      } catch {
        /* ignore */
      }
    }
    const model = (modelMod as any)["4x"] ?? (modelMod as any).default ?? modelMod;
    const u = new Upscaler({ model });
    upscalerInstance = u;
    return u;
  })();
  return upscalerLoading;
}

async function aiUpscale(
  img: HTMLImageElement,
  scale: 2 | 4,
  onProgress?: (pct: number) => void,
): Promise<HTMLCanvasElement | null> {
  try {
    onProgress?.(10);
    const u = await getUpscaler();
    onProgress?.(35);
    const result = await u.upscale(img, {
      output: "tensor",
      patchSize: 64,
      padding: 6,
      progress: (p: number) => {
        // 35% → 85% during AI inference
        onProgress?.(35 + Math.round(p * 50));
      },
    });
    // Convert tensor → canvas
    const tf = await import("@tensorflow/tfjs");
    const [hT, wT] = (result as any).shape;
    const canvas = makeCanvas(wT, hT);
    await tf.browser.toPixels(result as any, canvas);
    (result as any).dispose?.();
    onProgress?.(88);
    // ESRGAN-slim is 4×; if user asked 2×, downscale once.
    if (scale === 2) {
      const half = makeCanvas(Math.round(wT / 2), Math.round(hT / 2));
      const ctx = half.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(canvas, 0, 0, half.width, half.height);
      return half;
    }
    return canvas;
  } catch (e) {
    console.warn("AI upscaler unavailable, falling back to bicubic:", e);
    return null;
  }
}

export async function upscaleImage(
  img: HTMLImageElement,
  opts: UpscaleOptions,
): Promise<HTMLCanvasElement> {
  const { scale, denoise = 0.35, sharpen = 0.7, onProgress } = opts;
  onProgress?.(2);

  // 1) Try the AI super-resolution model first.
  const ai = await aiUpscale(img, scale, onProgress);
  let current: HTMLCanvasElement;
  if (ai) {
    current = ai;
  } else {
    // 2) Fallback: iterative bicubic enlarge.
    let cur: HTMLCanvasElement | HTMLImageElement = img;
    const steps = scale === 4 ? 2 : 1;
    for (let s = 0; s < steps; s++) {
      cur = bicubicStep(cur, 2);
      onProgress?.(30 + (s + 1) * 25);
      await new Promise((r) => setTimeout(r, 0));
    }
    current = cur as HTMLCanvasElement;
  }

  // 3) Polish: tiny denoise, auto-levels, then unsharp mask for crisp edges.
  if (denoise > 0) {
    // Light blend with a 1px box blur to suppress upscale noise.
    const ctx = current.getContext("2d", { willReadFrequently: true })!;
    const src = ctx.getImageData(0, 0, current.width, current.height);
    const blur = boxBlur(src, current.width, current.height, 1);
    const k = Math.min(0.4, denoise * 0.4);
    for (let i = 0; i < src.data.length; i += 4) {
      src.data[i] = src.data[i] * (1 - k) + blur.data[i] * k;
      src.data[i + 1] = src.data[i + 1] * (1 - k) + blur.data[i + 1] * k;
      src.data[i + 2] = src.data[i + 2] * (1 - k) + blur.data[i + 2] * k;
    }
    ctx.putImageData(src, 0, 0);
  }
  onProgress?.(92);

  autoLevels(current, 0.45);
  onProgress?.(95);

  if (sharpen > 0) unsharpMask(current, sharpen, 1);
  onProgress?.(100);

  return current;
}
