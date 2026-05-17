/**
 * Icon = inline SVG markup rasterised on-the-fly to a data-URL so Konva
 * can paint it through its standard Image node (faster than DOM SVG when
 * dragging hundreds of icons). Re-rasterises whenever colour changes.
 */

import { useMemo } from "react";
import { Image as KImage } from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import { useStudio } from "../store";
import type { IconElement } from "../types";

interface Props {
  el: IconElement;
  selectableRef: (id: string, node: Konva.Node | null) => void;
  onSelect: (id: string, ev: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
}

export function IconNode({ el, selectableRef, onSelect }: Props) {
  const updateElement = useStudio((s) => s.updateElement);
  const _commit = useStudio((s) => s._commit);

  const dataUrl = useMemo(() => {
    // Inject the user-picked colour into the SVG by replacing currentColor
    // and any existing stroke / fill attribute. Falls back to wrapping in
    // a coloured-currentColor data URL.
    const coloured = el.svg
      .replace(/currentColor/g, el.color)
      .replace(/stroke="#?[0-9a-fA-F]{3,8}"/g, `stroke="${el.color}"`);
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(coloured)))}`;
  }, [el.svg, el.color]);

  const [img] = useImage(dataUrl, "anonymous");

  return (
    <KImage
      ref={(n) => selectableRef(el.id, n)}
      id={el.id}
      image={img}
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      rotation={el.rotation}
      scaleX={el.scaleX}
      scaleY={el.scaleY}
      opacity={el.opacity}
      visible={!el.hidden}
      draggable={!el.locked}
      onMouseDown={(ev) => onSelect(el.id, ev)}
      onTouchStart={(ev) => onSelect(el.id, ev)}
      onDragStart={() => _commit()}
      onDragEnd={(ev) => updateElement(el.id, { x: ev.target.x(), y: ev.target.y() })}
      onTransformStart={() => _commit()}
      onTransformEnd={(ev) => {
        const n = ev.target;
        updateElement(el.id, {
          x: n.x(),
          y: n.y(),
          rotation: n.rotation(),
          width: Math.max(8, el.width * n.scaleX()),
          height: Math.max(8, el.height * n.scaleY()),
          scaleX: 1,
          scaleY: 1,
        });
        n.scaleX(1);
        n.scaleY(1);
      }}
    />
  );
}
