// ─────────────────────────────────────────────────────────────────────
// Perspective (4-point quad → rectangle) warp using mesh-of-triangles
// affine subdivision. Pure Canvas 2D, no WebGL / OpenCV dependency.
//
// USE CASE
//   ID-card crop where the source scan/photo of the physical card is
//   slightly skewed (almost always — phones rarely shoot dead-on). An
//   aspect-locked rectangle marquee can't simultaneously hug all four
//   visibly-distorted card edges, so the user is forced to pick
//   between (a) including extra background or (b) cutting card content.
//
//   With a 4-point quad the user marks the actual card corners (TL,
//   TR, BR, BL) and we warp that arbitrary quadrilateral into the
//   target 85.6 × 54 mm rectangle, eliminating both classes of error.
//
// ALGORITHM
//   1. Subdivide the destination rectangle into a `gridN` × `gridN`
//      grid of small cells (default 24×24 = 576 cells).
//   2. For each cell, compute the matching SOURCE quadrilateral by
//      bilinear interpolation of the 4 user-marked corners.
//   3. Each cell's source-quad is approximated by two triangles; for
//      every triangle we solve the 6-parameter affine transform that
//      maps the source triangle to the destination triangle, clip the
//      destination triangle, set the transform, and `drawImage`. The
//      browser's affine `drawImage` performs sub-pixel interpolation.
//
//   The result is an extremely close approximation of a true
//   perspective (homography) transform — visually indistinguishable
//   for typical card-skew angles (≤ 25°) at print resolution. With
//   gridN ≥ 16 there is no perceptible facet artefact.
// ─────────────────────────────────────────────────────────────────────

export interface Corner {
  x: number;
  y: number;
}

export type Quad = [Corner, Corner, Corner, Corner]; // TL, TR, BR, BL (clockwise from top-left)

/**
 * Re-orders an arbitrary 4-point set into a clean clockwise
 * TL / TR / BR / BL quadrilateral. This eliminates "bow-tie" /
 * self-intersecting configurations that arise when a user drags one
 * corner handle past another, which would otherwise produce folded
 * warps, skipped triangles (degenerate affine `denom ~ 0`), and
 * visible white holes in the output.
 *
 * Algorithm: sort points by polar angle around the centroid (gives a
 * non-self-intersecting convex traversal), then rotate the array so
 * the first element is the point closest to the top-left of the
 * centroid (smallest x + y). The result is a canonical TL → TR → BR →
 * BL order regardless of the input order or drag history.
 */
export function sanitizeQuad(input: Quad): Quad {
  const cx = (input[0].x + input[1].x + input[2].x + input[3].x) / 4;
  const cy = (input[0].y + input[1].y + input[2].y + input[3].y) / 4;
  // atan2(dy, dx) ascending sort in SCREEN coordinates (y-axis points
  // DOWN). Walk-through for the four canonical card corners around
  // their centroid:
  //   TL (dx<0, dy<0) → atan2 ≈ -3π/4
  //   TR (dx>0, dy<0) → atan2 ≈ -π/4
  //   BR (dx>0, dy>0) → atan2 ≈ +π/4
  //   BL (dx<0, dy>0) → atan2 ≈ +3π/4
  // Ascending order [TL, TR, BR, BL] is the CLOCKWISE visual traversal
  // we want — no reverse required. (A previous version reversed the
  // sort and produced [BL, BR, TR, TL], which after TL-anchoring became
  // [TL, BL, BR, TR] — a reflection across the TL-BR diagonal that
  // showed up as a 90° rotated capture in the output canvas.)
  const sorted = [...input].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  // Anchor on the top-left-most point so the first slot is canonical TL.
  let tlIdx = 0;
  let tlScore = sorted[0].x + sorted[0].y;
  for (let i = 1; i < 4; i++) {
    const s = sorted[i].x + sorted[i].y;
    if (s < tlScore) { tlScore = s; tlIdx = i; }
  }
  const out: Corner[] = [];
  for (let i = 0; i < 4; i++) out.push(sorted[(tlIdx + i) % 4]);
  return [out[0], out[1], out[2], out[3]];
}

/**
 * Returns the signed polygon area of the quad. Negative means the
 * vertices are wound counter-clockwise; absolute value is the area.
 * Used as a validity check — a near-zero area means the user has
 * collapsed the quad to a line/point and capture would produce
 * garbage. Caller should compare `Math.abs(quadArea(...))` against a
 * minimum threshold (e.g. 1% of source-image area).
 */
export function quadArea(q: Quad): number {
  // Shoelace formula for a 4-point polygon.
  return 0.5 * (
    q[0].x * q[1].y - q[1].x * q[0].y +
    q[1].x * q[2].y - q[2].x * q[1].y +
    q[2].x * q[3].y - q[3].x * q[2].y +
    q[3].x * q[0].y - q[0].x * q[3].y
  );
}

/**
 * Snaps quad corners into a clean orthogonal axis-aligned bounding rectangle.
 */
export function orthogonalizeQuad(corners: Quad): Quad {
  const [tl, tr, br, bl] = corners;
  const minX = Math.min(tl.x, bl.x);
  const maxX = Math.max(tr.x, br.x);
  const minY = Math.min(tl.y, tr.y);
  const maxY = Math.max(bl.y, br.y);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

/**
 * Helper to check if quad corners are sufficiently close to an axis-aligned
 * rectangle (within ~2.5% of edge length).
 */
export function isAxisAlignedRect(corners: Quad, toleranceRatio = 0.025): boolean {
  const [tl, tr, br, bl] = corners;
  const w = Math.max(1, Math.abs(tr.x - tl.x));
  const h = Math.max(1, Math.abs(bl.y - tl.y));
  const topDeltaY = Math.abs(tl.y - tr.y);
  const botDeltaY = Math.abs(bl.y - br.y);
  const leftDeltaX = Math.abs(tl.x - bl.x);
  const rightDeltaX = Math.abs(tr.x - br.x);
  return (
    topDeltaY / w <= toleranceRatio &&
    botDeltaY / w <= toleranceRatio &&
    leftDeltaX / h <= toleranceRatio &&
    rightDeltaX / h <= toleranceRatio
  );
}

/**
 * Warp the source quadrilateral defined by `srcCorners` into a `dstW` × `dstH` rectangle.
 * Returns a freshly-allocated canvas filled with the warped result.
 *
 * Guaranteed 100% seam-free:
 * - When axis-aligned: direct single-pass `drawImage`.
 * - When perspective-skewed: projective inverse homography with subpixel bilinear filtering.
 */
export function warpQuadToRect(
  srcImage: CanvasImageSource & { width: number; height: number },
  srcCorners: Quad,
  dstW: number,
  dstH: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _gridN?: number,
): HTMLCanvasElement {
  const dst = document.createElement("canvas");
  dst.width = dstW;
  dst.height = dstH;
  const ctx = dst.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, dstW, dstH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const isAxisAligned = isAxisAlignedRect(srcCorners);
  console.log("[WARP-ENGINE] Executing warp:", {
    dstW,
    dstH,
    isAxisAligned,
    corners: srcCorners,
  });

  // ── FAST PATH: Axis-aligned rectangular crop ────────────────────────
  if (isAxisAligned) {
    const [tl, tr, br, bl] = srcCorners;
    const sx = Math.max(0, Math.min(tl.x, bl.x));
    const sy = Math.max(0, Math.min(tl.y, tr.y));
    const sw = Math.min(srcImage.width - sx, Math.max(tr.x, br.x) - sx);
    const sh = Math.min(srcImage.height - sy, Math.max(bl.y, br.y) - sy);
    if (sw > 0 && sh > 0) {
      ctx.drawImage(srcImage, sx, sy, sw, sh, 0, 0, dstW, dstH);
      return dst;
    }
  }

  // ── SEAM-FREE HOMOGRAPHY PATH: Projective Inverse Mapping ───────────
  const srcW = srcImage.width;
  const srcH = srcImage.height;
  let srcCanvas: HTMLCanvasElement;
  let srcCtx: CanvasRenderingContext2D;

  if (typeof HTMLCanvasElement !== "undefined" && srcImage instanceof HTMLCanvasElement) {
    srcCanvas = srcImage;
    srcCtx = srcCanvas.getContext("2d")!;
  } else {
    srcCanvas = document.createElement("canvas");
    srcCanvas.width = srcW;
    srcCanvas.height = srcH;
    srcCtx = srcCanvas.getContext("2d")!;
    srcCtx.drawImage(srcImage, 0, 0);
  }

  const srcImgData = srcCtx.getImageData(0, 0, srcW, srcH);
  const srcBuf = new Uint32Array(srcImgData.data.buffer);

  const dstImgData = ctx.createImageData(dstW, dstH);
  const dstBuf = new Uint32Array(dstImgData.data.buffer);

  // Paul Heckbert Projective Transform (Unit Square [0,1]² → Source Quad)
  const [p0, p1, p2, p3] = srcCorners;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const sy = p0.y - p1.y + p2.y - p3.y;

  const denom = dx1 * dy2 - dy1 * dx2;
  let g = 0, h = 0;
  if (Math.abs(denom) > 1e-10) {
    g = (sx * dy2 - sy * dx2) / denom;
    h = (dx1 * sy - dy1 * sx) / denom;
  }
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const c = p0.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  const f = p0.y;

  // Destination [0, dstW] × [0, dstH] → Source (u, v)
  const m00 = a / dstW, m01 = b / dstH, m02 = c;
  const m10 = d / dstW, m11 = e / dstH, m12 = f;
  const m20 = g / dstW, m21 = h / dstH, m22 = 1.0;

  for (let y = 0; y < dstH; y++) {
    let numX = m01 * y + m02;
    let numY = m11 * y + m12;
    let den  = m21 * y + m22;
    const dstRow = y * dstW;

    for (let x = 0; x < dstW; x++) {
      const invDen = 1.0 / den;
      const u = numX * invDen;
      const v = numY * invDen;

      const u0 = Math.floor(u);
      const v0 = Math.floor(v);

      if (u0 >= 0 && u0 < srcW - 1 && v0 >= 0 && v0 < srcH - 1) {
        const fu = u - u0;
        const fv = v - v0;

        const idx00 = v0 * srcW + u0;
        const c00 = srcBuf[idx00];
        const c10 = srcBuf[idx00 + 1];
        const c01 = srcBuf[idx00 + srcW];
        const c11 = srcBuf[idx00 + srcW + 1];

        const r00 = c00 & 0xff, g00 = (c00 >> 8) & 0xff, b00 = (c00 >> 16) & 0xff, a00 = (c00 >>> 24);
        const r10 = c10 & 0xff, g10 = (c10 >> 8) & 0xff, b10 = (c10 >> 16) & 0xff, a10 = (c10 >>> 24);
        const r01 = c01 & 0xff, g01 = (c01 >> 8) & 0xff, b01 = (c01 >> 16) & 0xff, a01 = (c01 >>> 24);
        const r11 = c11 & 0xff, g11 = (c11 >> 8) & 0xff, b11 = (c11 >> 16) & 0xff, a11 = (c11 >>> 24);

        const w00 = (1 - fu) * (1 - fv);
        const w10 = fu * (1 - fv);
        const w01 = (1 - fu) * fv;
        const w11 = fu * fv;

        const r = (r00 * w00 + r10 * w10 + r01 * w01 + r11 * w11 + 0.5) | 0;
        const g_ = (g00 * w00 + g10 * w10 + g01 * w01 + g11 * w11 + 0.5) | 0;
        const b_ = (b00 * w00 + b10 * w10 + b01 * w01 + b11 * w11 + 0.5) | 0;
        const a_ = (a00 * w00 + a10 * w10 + a01 * w01 + a11 * w11 + 0.5) | 0;

        dstBuf[dstRow + x] = (a_ << 24) | (b_ << 16) | (g_ << 8) | r;
      } else if (u0 >= 0 && u0 < srcW && v0 >= 0 && v0 < srcH) {
        dstBuf[dstRow + x] = srcBuf[v0 * srcW + u0];
      } else {
        dstBuf[dstRow + x] = 0xffffffff;
      }

      numX += m00;
      numY += m10;
      den  += m20;
    }
  }

  ctx.putImageData(dstImgData, 0, 0);

  if (srcCanvas !== srcImage) {
    srcCanvas.width = 0;
    srcCanvas.height = 0;
  }

  return dst;
}
