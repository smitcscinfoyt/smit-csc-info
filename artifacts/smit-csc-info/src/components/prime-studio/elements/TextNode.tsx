/**
 * Konva text node — display only. Editing is done via a separate HTML
 * <textarea> overlay rendered by Stage.tsx (which signals through the
 * `editingId` store flag — see store-extras / Stage). Keeps this
 * component minimal so the Konva tree stays pure.
 */

import { Text } from "react-konva";
import type Konva from "konva";
import { useStudio } from "../store";
import type { TextElement } from "../types";

interface Props {
  el: TextElement;
  selectableRef: (id: string, node: Konva.Node | null) => void;
  onSelect: (id: string, ev: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onRequestEdit: (id: string) => void;
  hidden?: boolean;
}

export function TextNode({ el, selectableRef, onSelect, onRequestEdit, hidden }: Props) {
  const updateElement = useStudio((s) => s.updateElement);
  const _commit = useStudio((s) => s._commit);

  const transformedText = (() => {
    switch (el.textCase) {
      case "upper": return el.text.toUpperCase();
      case "lower": return el.text.toLowerCase();
      case "title":
        return el.text.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
      default: return el.text;
    }
  })();

  return (
    <Text
      id={el.id}
      x={el.x}
      y={el.y}
      text={transformedText}
      fontSize={el.fontSize}
      fontFamily={el.fontFamily}
      fontStyle={el.fontStyle}
      textDecoration={el.textDecoration}
      align={el.align}
      fill={el.fill}
      width={el.width}
      lineHeight={el.lineHeight}
      letterSpacing={el.letterSpacing}
      rotation={el.rotation}
      scaleX={el.scaleX}
      scaleY={el.scaleY}
      opacity={hidden ? 0 : el.opacity}
      visible={!el.hidden}
      draggable={!el.locked}
      ref={(n) => selectableRef(el.id, n)}
      onMouseDown={(ev) => onSelect(el.id, ev)}
      onTouchStart={(ev) => onSelect(el.id, ev)}
      onDragStart={() => _commit()}
      onDragEnd={(ev) => updateElement(el.id, { x: ev.target.x(), y: ev.target.y() })}
      onDblClick={() => onRequestEdit(el.id)}
      onDblTap={() => onRequestEdit(el.id)}
      onTransformStart={() => _commit()}
      onTransformEnd={(ev) => {
        const n = ev.target;
        const sx = n.scaleX();
        updateElement(el.id, {
          x: n.x(),
          y: n.y(),
          rotation: n.rotation(),
          width: Math.max(20, el.width * sx),
          scaleX: 1,
          scaleY: 1,
          fontSize: Math.max(6, el.fontSize * n.scaleY()),
        });
        n.scaleX(1);
        n.scaleY(1);
      }}
    />
  );
}
