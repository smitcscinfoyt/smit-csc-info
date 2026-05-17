/**
 * Konva image element. Loads the src via use-image and applies all the
 * Tools-panel effects (filters, adjustments, shadow / outline) via the
 * shared `applyImageEffects` helper.
 *
 * Render structure: ALWAYS wraps the inner KImage in a Group so we can
 * (a) clip to a rounded-rect when `cornerRadius > 0`, and (b) overlay a
 * destination-out mask when `eraseMask` is set. The Group is the
 * SELECTABLE node — Transformer + drag/transform handlers all attach
 * to it, while the inner KImage stays at (0,0) inside the Group's
 * local coordinate space and continues to receive all image effects
 * via the existing `applyImageEffects(node, el)` pipeline.
 */

import { useEffect, useRef } from "react";
import { Group, Image as KImage } from "react-konva";
import useImage from "use-image";
import Konva from "konva";
import { useStudio } from "../store";
import type { ImageElement } from "../types";
import { applyImageEffects } from "../imageEffects";

interface Props {
  el: ImageElement;
  selectableRef: (id: string, node: Konva.Node | null) => void;
  onSelect: (id: string, ev: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  /** When true, the regular image node is suppressed — used while the
   *  CropOverlay or EraseOverlay is active for this element, so we
   *  don't double-render the image and so the user can't drag /
   *  transform it under the overlay UI. */
  hidden?: boolean;
}

/** Build a Konva clip-function that draws a rounded-rect path the
 *  Group will clip its contents to. Pure (no React state) so it can
 *  be re-instantiated each render without surprises. */
function makeRoundedRectClip(w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  return (ctx: Konva.Context) => {
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(w - radius, 0);
    ctx.quadraticCurveTo(w, 0, w, radius);
    ctx.lineTo(w, h - radius);
    ctx.quadraticCurveTo(w, h, w - radius, h);
    ctx.lineTo(radius, h);
    ctx.quadraticCurveTo(0, h, 0, h - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
  };
}

export function ImageNode({ el, selectableRef, onSelect, hidden }: Props) {
  const updateElement = useStudio((s) => s.updateElement);
  const _commit = useStudio((s) => s._commit);
  const [img] = useImage(el.src, "anonymous");
  const [maskImg] = useImage(el.eraseMask ?? "", "anonymous");
  const imgRef = useRef<Konva.Image | null>(null);

  // Apply every Tools-panel effect whenever the underlying values change.
  // We re-run on every adjustment field so a slider drag updates live.
  useEffect(() => {
    const node = imgRef.current;
    if (!node || !img) return;
    applyImageEffects(node, el);
  }, [
    img,
    el.filter,
    el.brightness,
    el.contrast,
    el.saturation,
    el.temperature,
    el.tint,
    el.highlights,
    el.shadowsAdj,
    el.clarity,
    el.vignette,
    el.blurAmount,
    el.hue,
    el.imageShadowPreset,
    el.imageOutline?.color,
    el.imageOutline?.width,
    el.shadow?.color,
    el.shadow?.blur,
    el.shadow?.offsetX,
    el.shadow?.offsetY,
    el.shadow?.opacity,
    // Re-cache when crop changes so the cached pixmap matches the new
    // sub-rectangle.
    el.cropBox?.x,
    el.cropBox?.y,
    el.cropBox?.width,
    el.cropBox?.height,
  ]);

  // Konva.Image's `crop` prop takes a sub-rectangle in NATURAL pixel
  // coordinates and stretches that rect to fill width × height. Only
  // pass it when the element actually has a crop set so the default
  // (no crop = full natural image) is preserved.
  const cropProp = el.cropBox
    ? {
        cropX: el.cropBox.x,
        cropY: el.cropBox.y,
        cropWidth: el.cropBox.width,
        cropHeight: el.cropBox.height,
      }
    : {};

  if (hidden) return null;

  // Outer GROUP owns geometry (position, rotation, scale, flip) and
  // selection / drag / transform behaviour. Inner KImage sits at (0,0)
  // in the Group's local space and receives the image filter pipeline.
  // This structure lets us layer a destination-out eraseMask on top
  // and clip everything to a rounded rect via clipFunc.
  const cornerR = el.cornerRadius ?? 0;
  const clipFunc = cornerR > 0 ? makeRoundedRectClip(el.width, el.height, cornerR) : undefined;

  return (
    <Group
      ref={(g) => {
        selectableRef(el.id, g);
      }}
      id={el.id}
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      rotation={el.rotation}
      scaleX={(el.flipX ? -1 : 1) * el.scaleX}
      scaleY={(el.flipY ? -1 : 1) * el.scaleY}
      offsetX={el.flipX ? el.width : 0}
      offsetY={el.flipY ? el.height : 0}
      opacity={el.opacity}
      visible={!el.hidden}
      draggable={!el.locked}
      clipFunc={clipFunc}
      onMouseDown={(ev) => onSelect(el.id, ev)}
      onTouchStart={(ev) => onSelect(el.id, ev)}
      onDragStart={() => _commit()}
      onDragEnd={(ev) => updateElement(el.id, { x: ev.target.x(), y: ev.target.y() })}
      onTransformStart={() => _commit()}
      onTransformEnd={(ev) => {
        const n = ev.target;
        const sx = n.scaleX();
        const sy = n.scaleY();
        updateElement(el.id, {
          x: n.x(),
          y: n.y(),
          rotation: n.rotation(),
          width: Math.max(8, el.width * Math.abs(sx)),
          height: Math.max(8, el.height * Math.abs(sy)),
          scaleX: 1,
          scaleY: 1,
        });
        n.scaleX(el.flipX ? -1 : 1);
        n.scaleY(el.flipY ? -1 : 1);
      }}
    >
      {/* The main image is the GROUP's hit-area: a Konva.Group has no
          fill / stroke of its own, so without a listening child nothing
          inside the group can catch the click. We keep listening = TRUE
          (default) so clicks on the image bubble up to the Group's
          onMouseDown / onTouchStart handlers and the user can select
          the element. The image has no `draggable` of its own — dragging
          is owned by the Group. */}
      <KImage
        ref={(n) => { imgRef.current = n; }}
        image={img}
        {...cropProp}
        x={0}
        y={0}
        width={el.width}
        height={el.height}
      />
      {/* Erase mask layered above with destination-out so the painted
          black-on-transparent PNG punches holes through the image
          pixels. Sized to fill the same display rect → maskImg's
          natural pixels get scaled/stretched the same way the source
          image is. */}
      {el.eraseMask && maskImg && (
        <KImage
          image={maskImg}
          x={0}
          y={0}
          width={el.width}
          height={el.height}
          globalCompositeOperation="destination-out"
          listening={false}
        />
      )}
    </Group>
  );
}
