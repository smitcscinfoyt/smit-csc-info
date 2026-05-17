/**
 * Konva renderer for rect / circle / line / arrow elements.
 * The transformer is owned by the parent Stage so we just emit drag/transform
 * events back to the store.
 */

import { Rect, Circle, Line, Arrow } from "react-konva";
import type Konva from "konva";
import { useStudio } from "../store";
import type { CircleElement, LineElement, RectElement } from "../types";

/**
 * Konva does NOT register hit events on the interior of a shape with a
 * transparent / empty fill — only on its stroke. That makes outline-only
 * boxes, rings and thin lines impossible to click or drag. We force the
 * full bounding-box / line stroke to be hit-testable so the user can grab
 * any part of the shape.
 */
const RECT_HIT = (ctx: Konva.Context, shape: Konva.Shape) => {
  ctx.beginPath();
  ctx.rect(0, 0, shape.width(), shape.height());
  ctx.closePath();
  ctx.fillStrokeShape(shape);
};
const CIRCLE_HIT = (ctx: Konva.Context, shape: Konva.Shape) => {
  ctx.beginPath();
  ctx.arc(0, 0, (shape as Konva.Circle).radius(), 0, Math.PI * 2, false);
  ctx.closePath();
  ctx.fillStrokeShape(shape);
};

interface Props {
  el: RectElement | CircleElement | LineElement;
  selectableRef: (id: string, node: Konva.Node | null) => void;
  onSelect: (id: string, ev: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
}

export function ShapeNode({ el, selectableRef, onSelect }: Props) {
  const updateElement = useStudio((s) => s.updateElement);
  const _commit = useStudio((s) => s._commit);

  const common = {
    id: el.id,
    x: el.x,
    y: el.y,
    rotation: el.rotation,
    scaleX: el.scaleX,
    scaleY: el.scaleY,
    opacity: el.opacity,
    draggable: !el.locked,
    visible: !el.hidden,
    onMouseDown: (ev: Konva.KonvaEventObject<MouseEvent>) => onSelect(el.id, ev),
    onTouchStart: (ev: Konva.KonvaEventObject<TouchEvent>) => onSelect(el.id, ev),
    onDragStart: () => _commit(),
    onDragEnd: (ev: Konva.KonvaEventObject<DragEvent>) => {
      // Konva.Circle reports its centre as (x,y); we store top-left, so
      // subtract the radius back out for circles only.
      if (el.type === "circle") {
        const r = Math.min(el.width, el.height) / 2;
        updateElement(el.id, { x: ev.target.x() - r, y: ev.target.y() - r });
      } else {
        updateElement(el.id, { x: ev.target.x(), y: ev.target.y() });
      }
    },
    onTransformStart: () => _commit(),
    onTransformEnd: (ev: Konva.KonvaEventObject<Event>) => {
      const node = ev.target;
      // Bake scale into width/height so corner-radius / stroke stay crisp.
      const sx = node.scaleX();
      const sy = node.scaleY();
      if (el.type === "rect") {
        updateElement(el.id, {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          scaleX: 1,
          scaleY: 1,
          width: Math.max(2, el.width * sx),
          height: Math.max(2, el.height * sy),
        });
      } else if (el.type === "circle") {
        const newW = Math.max(2, el.width * sx);
        const newH = Math.max(2, el.height * sy);
        const newR = Math.min(newW, newH) / 2;
        updateElement(el.id, {
          x: node.x() - newR,
          y: node.y() - newR,
          rotation: node.rotation(),
          scaleX: 1,
          scaleY: 1,
          width: newW,
          height: newH,
        });
      } else {
        updateElement(el.id, {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          scaleX: sx,
          scaleY: sy,
        });
      }
      node.scaleX(1);
      node.scaleY(1);
    },
    ref: (n: Konva.Node | null) => selectableRef(el.id, n),
  } as const;

  if (el.type === "rect") {
    return (
      <Rect
        {...common}
        width={el.width}
        height={el.height}
        fill={el.fill}
        stroke={el.stroke}
        strokeWidth={el.strokeWidth}
        cornerRadius={el.cornerRadius ?? 0}
        dash={el.dash ?? undefined}
        hitFunc={RECT_HIT}
        shadowColor={el.shadow?.color}
        shadowBlur={el.shadow?.blur}
        shadowOffsetX={el.shadow?.offsetX}
        shadowOffsetY={el.shadow?.offsetY}
        shadowOpacity={el.shadow?.opacity}
      />
    );
  }
  if (el.type === "circle") {
    const r = Math.min(el.width, el.height) / 2;
    return (
      <Circle
        {...common}
        // Konva.Circle is centred on (x,y); we treat element (x,y) as
        // top-left for consistency with Rect, so shift by radius.
        x={el.x + r}
        y={el.y + r}
        radius={r}
        fill={el.fill}
        stroke={el.stroke}
        strokeWidth={el.strokeWidth}
        dash={el.dash ?? undefined}
        hitFunc={CIRCLE_HIT}
      />
    );
  }
  // line / arrow — `hitStrokeWidth` widens the invisible hit area around
  // the visible stroke so even a 1-px line can be grabbed with a finger.
  const lineHit = Math.max(20, el.strokeWidth + 16);
  if (el.arrow) {
    return (
      <Arrow
        {...common}
        points={el.points}
        stroke={el.stroke}
        fill={el.stroke}
        strokeWidth={el.strokeWidth}
        hitStrokeWidth={lineHit}
        pointerLength={Math.max(8, el.strokeWidth * 3)}
        pointerWidth={Math.max(8, el.strokeWidth * 3)}
        dash={el.dash ?? undefined}
      />
    );
  }
  return (
    <Line
      {...common}
      points={el.points}
      stroke={el.stroke}
      strokeWidth={el.strokeWidth}
      hitStrokeWidth={lineHit}
      dash={el.dash ?? undefined}
      lineCap="round"
    />
  );
}
