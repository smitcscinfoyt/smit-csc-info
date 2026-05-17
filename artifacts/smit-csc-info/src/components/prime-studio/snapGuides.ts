/**
 * Snap-to-edge / snap-to-centre guide computation for the Prime Studio
 * canvas. Pure functions — no Konva nor React imports — so they're
 * trivially unit-testable.
 *
 * The convention is "stage-local" coordinates: every box is in the same
 * coordinate space as the page rect (i.e. the value you get back from
 * `node.getClientRect({ relativeTo: stage })`). The Stage applies the
 * page zoom AFTER guides are positioned, so we don't need to bake zoom
 * into the threshold here — call sites pass `threshold / zoom` so the
 * snap "distance" feels constant in screen pixels regardless of zoom.
 */

import type Konva from "konva";

export interface SnapBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
}

export interface SnapResult {
  /** Delta to add to the dragging node's `x` to satisfy the snap.
   *  Zero means no horizontal snap was found within the threshold. */
  dx: number;
  /** Same for `y`. */
  dy: number;
  /** Vertical guide line X-positions (stage-local) — render as full-
   *  height vertical lines so the user sees the alignment they got. */
  vGuides: number[];
  /** Horizontal guide line Y-positions (stage-local). */
  hGuides: number[];
}

/**
 * Find the best snap delta from any of `dragSelf` values to any of
 * `targets`. "Best" = smallest absolute |delta| within `threshold`.
 * If multiple targets tie at that minimum we keep them all so the
 * caller can render every matching guide.
 */
function bestSnap(
  dragSelf: number[],
  targets: number[],
  threshold: number,
): { delta: number; lines: number[] } {
  let bestAbs = threshold + 1;
  let bestDelta = 0;
  let matched: number[] = [];
  for (const s of dragSelf) {
    for (const t of targets) {
      const d = t - s;
      const ad = Math.abs(d);
      if (ad < bestAbs) {
        bestAbs = ad;
        bestDelta = d;
        matched = [t];
      } else if (ad === bestAbs && !matched.includes(t)) {
        matched.push(t);
      }
    }
  }
  if (bestAbs > threshold) return { delta: 0, lines: [] };
  return { delta: bestDelta, lines: matched };
}

/**
 * Compute the snap delta + matching guide-line positions for a single
 * dragging element against a list of sibling boxes plus the page box.
 *
 * Each axis is solved independently — that means an element can snap
 * its left edge to a sibling's right edge horizontally AND snap its
 * vertical centre to the page centre at the same time.
 */
export function computeSnaps(
  dragBox: SnapBox,
  siblingBoxes: SnapBox[],
  pageBox: SnapBox,
  threshold = 6,
): SnapResult {
  const dragXs = [dragBox.left, dragBox.cx, dragBox.right];
  const dragYs = [dragBox.top, dragBox.cy, dragBox.bottom];

  const allBoxes = [...siblingBoxes, pageBox];
  const targetXs: number[] = [];
  const targetYs: number[] = [];
  for (const b of allBoxes) {
    targetXs.push(b.left, b.cx, b.right);
    targetYs.push(b.top, b.cy, b.bottom);
  }

  const x = bestSnap(dragXs, targetXs, threshold);
  const y = bestSnap(dragYs, targetYs, threshold);

  return {
    dx: x.delta,
    dy: y.delta,
    vGuides: x.lines,
    hGuides: y.lines,
  };
}

/** Convert a Konva node into a SnapBox in stage-local coordinates.
 *  Uses `getClientRect({ relativeTo: stage })` which already accounts
 *  for the node's rotation, scale and offset. */
export function nodeToSnapBox(node: Konva.Node, stage: Konva.Stage): SnapBox {
  // `relativeTo` is intentionally typed loose here — Konva 10's d.ts has
  // a quirk where the "Container" type doesn't include `Stage` in this
  // overload, even though the runtime accepts it.
  const r = node.getClientRect({ relativeTo: stage as unknown as Konva.Container });
  return {
    left: r.x,
    top: r.y,
    right: r.x + r.width,
    bottom: r.y + r.height,
    cx: r.x + r.width / 2,
    cy: r.y + r.height / 2,
  };
}

/** Build a SnapBox for the page rectangle itself — origin at (0,0)
 *  in stage-local coords by convention (the page rect is drawn there). */
export function pageBoxFromSize(width: number, height: number): SnapBox {
  return {
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    cx: width / 2,
    cy: height / 2,
  };
}
