export const MM_TO_PX_300 = (mm: number) => Math.round((mm / 25.4) * 300);
export const CM_TO_PX_300 = (cm: number) => Math.round((cm / 2.54) * 300);
export const INCH_TO_PX = (inch: number, dpi: number) => Math.round(inch * dpi);

export async function loadImage(src: string | File | Blob): Promise<HTMLImageElement> {
  const url =
    typeof src === "string" ? src : URL.createObjectURL(src);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (typeof src !== "string") URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (typeof src !== "string") URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/jpeg",
  quality = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      type,
      quality,
    );
  });
}

/** Cover-fit (crop to fill) source image into a target canvas size. White background. */
export function drawCoverFit(
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
  bgColor = "#ffffff",
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, targetW, targetH);

  const srcRatio = img.width / img.height;
  const dstRatio = targetW / targetH;
  let sx = 0,
    sy = 0,
    sw = img.width,
    sh = img.height;

  if (srcRatio > dstRatio) {
    sw = img.height * dstRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / dstRatio;
    sy = (img.height - sh) / 2;
  }

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
  return canvas;
}

/** Contain-fit (letterbox, no crop) into a target canvas size with a colored background. */
export function drawContainFit(
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
  bgColor = "#ffffff",
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, targetW, targetH);

  const ratio = Math.min(targetW / img.width, targetH / img.height);
  const dw = img.width * ratio;
  const dh = img.height * ratio;
  const dx = (targetW - dw) / 2;
  const dy = (targetH - dh) / 2;

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, dw, dh);
  return canvas;
}

/** Iteratively reduce JPEG quality / dimensions until file size is at or below targetKB. */
export async function compressToTargetKB(
  img: HTMLImageElement,
  targetKB: number,
  initialMaxDim = 2400,
): Promise<{ blob: Blob; quality: number; width: number; height: number }> {
  const targetBytes = targetKB * 1024;
  let scale = 1;
  let quality = 0.92;
  let maxDim = initialMaxDim;
  let blob: Blob | null = null;
  let canvas: HTMLCanvasElement | null = null;

  for (let i = 0; i < 24; i++) {
    const longestSide = Math.max(img.width, img.height) * scale;
    const finalScale = longestSide > maxDim ? (maxDim / Math.max(img.width, img.height)) : scale;
    const w = Math.max(80, Math.round(img.width * finalScale));
    const h = Math.max(80, Math.round(img.height * finalScale));
    canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (blob.size <= targetBytes) break;
    if (quality > 0.45) quality -= 0.08;
    else {
      scale *= 0.85;
      maxDim = Math.max(400, Math.round(maxDim * 0.85));
      quality = 0.7;
    }
  }
  return {
    blob: blob!,
    quality,
    width: canvas!.width,
    height: canvas!.height,
  };
}

/** Re-encode a canvas at a specific physical DPI by writing the JFIF density bytes. */
export async function setJpegDPI(blob: Blob, dpi: number): Promise<Blob> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return blob;
  let i = 2;
  while (i < buf.length - 4) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker === 0xe0 && buf[i + 4] === 0x4a /* J */) {
      buf[i + 11] = 1;
      buf[i + 12] = (dpi >> 8) & 0xff;
      buf[i + 13] = dpi & 0xff;
      buf[i + 14] = (dpi >> 8) & 0xff;
      buf[i + 15] = dpi & 0xff;
      return new Blob([buf as unknown as ArrayBuffer], { type: "image/jpeg" });
    }
    const segLen = (buf[i + 2] << 8) | buf[i + 3];
    i += 2 + segLen;
  }
  return blob;
}

/**
 * Color-distance background removal. Samples the four corners to detect bg color
 * and erases pixels within a tolerance. Best for photos with plain (white/blue/grey) bg.
 */
export function removeBackgroundByColor(
  img: HTMLImageElement,
  options: { tolerance?: number; replaceWith?: "transparent" | "white" } = {},
): HTMLCanvasElement {
  const tolerance = options.tolerance ?? 36;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;

  const corners = [
    [0, 0],
    [canvas.width - 1, 0],
    [0, canvas.height - 1],
    [canvas.width - 1, canvas.height - 1],
  ];
  let r = 0, g = 0, b = 0;
  for (const [x, y] of corners) {
    const idx = (y * canvas.width + x) * 4;
    r += px[idx];
    g += px[idx + 1];
    b += px[idx + 2];
  }
  r = Math.round(r / 4);
  g = Math.round(g / 4);
  b = Math.round(b / 4);

  for (let i = 0; i < px.length; i += 4) {
    const dr = px[i] - r;
    const dg = px[i + 1] - g;
    const db = px[i + 2] - b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < tolerance) {
      if (options.replaceWith === "white") {
        px[i] = 255;
        px[i + 1] = 255;
        px[i + 2] = 255;
        px[i + 3] = 255;
      } else {
        px[i + 3] = 0;
      }
    } else if (dist < tolerance * 1.7) {
      const fade = (dist - tolerance) / (tolerance * 0.7);
      px[i + 3] = Math.round(px[i + 3] * fade);
    }
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}
