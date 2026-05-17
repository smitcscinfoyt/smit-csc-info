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
 * Warp the source quadrilateral defined by `srcCorners` (in pixel
 * coordinates of `srcImage`) into a `dstW` × `dstH` rectangle. Returns
 * a freshly-allocated canvas filled with the warped result on a white
 * background.
 *
 * `gridN` controls the mesh density; 24 is a good default trading off
 * fidelity vs draw-call count (24×24×2 = 1152 triangle draws, well
 * under one frame on any modern device).
 */
export function warpQuadToRect(
  srcImage: CanvasImageSource & { width: number; height: number },
  srcCorners: Quad,
  dstW: number,
  dstH: number,
  gridN = 24,
): HTMLCanvasElement {
  const dst = document.createElement("canvas");
  dst.width = dstW;
  dst.height = dstH;
  const ctx = dst.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, dstW, dstH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const [tl, tr, br, bl] = srcCorners;

  // Bilinear interpolation: (u, v) ∈ [0, 1]² → source-pixel point.
  // u = 0 ⇒ left edge (TL→BL), u = 1 ⇒ right edge (TR→BR).
  // v = 0 ⇒ top edge (TL→TR),  v = 1 ⇒ bottom edge (BL→BR).
  function bilerp(u: number, v: number): Corner {
    const tx = tl.x + (tr.x - tl.x) * u;
    const ty = tl.y + (tr.y - tl.y) * u;
    const bx = bl.x + (br.x - bl.x) * u;
    const by = bl.y + (br.y - bl.y) * u;
    return { x: tx + (bx - tx) * v, y: ty + (by - ty) * v };
  }

  const cellW = dstW / gridN;
  const cellH = dstH / gridN;

  for (let i = 0; i < gridN; i++) {
    for (let j = 0; j < gridN; j++) {
      const u0 = i / gridN;
      const u1 = (i + 1) / gridN;
      const v0 = j / gridN;
      const v1 = (j + 1) / gridN;

      const s00 = bilerp(u0, v0);
      const s10 = bilerp(u1, v0);
      const s11 = bilerp(u1, v1);
      const s01 = bilerp(u0, v1);

      const d00x = i * cellW;
      const d00y = j * cellH;
      const d10x = (i + 1) * cellW;
      const d10y = j * cellH;
      const d11x = (i + 1) * cellW;
      const d11y = (j + 1) * cellH;
      const d01x = i * cellW;
      const d01y = (j + 1) * cellH;

      // Two triangles per cell: (00, 10, 11) and (00, 11, 01).
      drawAffineTriangle(
        ctx, srcImage,
        s00.x, s00.y, s10.x, s10.y, s11.x, s11.y,
        d00x, d00y, d10x, d10y, d11x, d11y,
      );
      drawAffineTriangle(
        ctx, srcImage,
        s00.x, s00.y, s11.x, s11.y, s01.x, s01.y,
        d00x, d00y, d11x, d11y, d01x, d01y,
      );
    }
  }

  return dst;
}

/**
 * Solve the 2×3 affine transform that maps the source triangle
 * (sx0,sy0)-(sx1,sy1)-(sx2,sy2) onto the destination triangle
 * (dx0,dy0)-(dx1,dy1)-(dx2,dy2), clip the destination triangle, then
 * `drawImage(srcImage, 0, 0)` so the browser samples the warped pixels.
 *
 * Affine equations:
 *     dx = a*sx + c*sy + e
 *     dy = b*sx + d*sy + f
 * 6 unknowns, 6 equations from 3 src→dst point pairs. Closed-form
 * solution via Cramer's rule on the source-coordinate determinant.
 */
function drawAffineTriangle(
  ctx: CanvasRenderingContext2D,
  srcImage: CanvasImageSource,
  sx0: number, sy0: number,
  sx1: number, sy1: number,
  sx2: number, sy2: number,
  dx0: number, dy0: number,
  dx1: number, dy1: number,
  dx2: number, dy2: number,
): void {
  const denom = (sx0 - sx2) * (sy1 - sy2) - (sx1 - sx2) * (sy0 - sy2);
  if (Math.abs(denom) < 1e-10) return; // degenerate (collinear source points)

  const a = ((dx0 - dx2) * (sy1 - sy2) - (dx1 - dx2) * (sy0 - sy2)) / denom;
  const c = ((sx0 - sx2) * (dx1 - dx2) - (sx1 - sx2) * (dx0 - dx2)) / denom;
  const e = dx0 - a * sx0 - c * sy0;
  const b = ((dy0 - dy2) * (sy1 - sy2) - (dy1 - dy2) * (sy0 - sy2)) / denom;
  const d = ((sx0 - sx2) * (dy1 - dy2) - (sx1 - sx2) * (dy0 - dy2)) / denom;
  const f = dy0 - b * sx0 - d * sy0;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dx0, dy0);
  ctx.lineTo(dx1, dy1);
  ctx.lineTo(dx2, dy2);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(srcImage, 0, 0);
  ctx.restore();
  // setTransform persists; restore() above rewinds the entire state
  // including the transform, so no explicit identity reset is needed.
}
