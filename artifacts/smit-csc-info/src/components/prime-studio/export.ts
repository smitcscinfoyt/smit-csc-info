/**
 * Export utilities — render every page off-screen via a temporary Konva
 * Stage at the requested DPI and bundle into the requested format. We
 * never re-use the on-screen Stage so the user's zoom/pan don't pollute
 * the output. PDF uses jsPDF (already a project dep).
 */

import Konva from "konva";
import jsPDF from "jspdf";
import { useStudio } from "./store";
import type { PageData, ProjectData } from "./types";

const PIXEL_RATIO_HIGH = 2; // 144 DPI equivalent for screen exports
const PIXEL_RATIO_PRINT = 4; // 300 DPI equivalent for PDF / JPG

/**
 * Render one page to a hidden Konva Stage and return the data URL of the
 * resulting raster. We rebuild the entire scene graph from JSON so the
 * background / shape colours / images all bake in correctly even though
 * the user might be on a different page.
 */
async function rasterisePage(page: PageData, opts: { mime: "image/png" | "image/jpeg"; transparent: boolean; pixelRatio: number }): Promise<string> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  document.body.appendChild(container);

  const stage = new Konva.Stage({
    container,
    width: page.width,
    height: page.height,
  });
  const layer = new Konva.Layer();
  stage.add(layer);

  try {
  // Background
  if (!opts.transparent) {
    layer.add(new Konva.Rect({
      x: 0, y: 0, width: page.width, height: page.height, fill: page.background,
    }));
  }

  // Elements
  for (const el of page.elements) {
    if (el.hidden) continue;
    if (el.type === "rect") {
      layer.add(new Konva.Rect({
        x: el.x, y: el.y, width: el.width, height: el.height,
        rotation: el.rotation, scaleX: el.scaleX, scaleY: el.scaleY, opacity: el.opacity,
        fill: el.fill, stroke: el.stroke, strokeWidth: el.strokeWidth,
        cornerRadius: el.cornerRadius ?? 0,
        // Pass `dash` through so dashed frame placeholders (and any
        // future dashed shapes) export with the same stroke pattern
        // they show on canvas. Konva's `dash` is stroke-only, so it
        // composes correctly with `cornerRadius` and `fill` here.
        ...(el.dash ? { dash: el.dash } : {}),
      }));
    } else if (el.type === "circle") {
      const r = Math.min(el.width, el.height) / 2;
      layer.add(new Konva.Circle({
        x: el.x + r, y: el.y + r, radius: r,
        rotation: el.rotation, scaleX: el.scaleX, scaleY: el.scaleY, opacity: el.opacity,
        fill: el.fill, stroke: el.stroke, strokeWidth: el.strokeWidth,
        ...(el.dash ? { dash: el.dash } : {}),
      }));
    } else if (el.type === "line") {
      const Cls = el.arrow ? Konva.Arrow : Konva.Line;
      layer.add(new Cls({
        x: el.x, y: el.y, points: el.points,
        rotation: el.rotation, scaleX: el.scaleX, scaleY: el.scaleY, opacity: el.opacity,
        stroke: el.stroke, strokeWidth: el.strokeWidth,
        ...(el.dash ? { dash: el.dash } : {}),
        ...(el.arrow ? {
          fill: el.stroke,
          pointerLength: Math.max(8, el.strokeWidth * 3),
          pointerWidth: Math.max(8, el.strokeWidth * 3),
        } : { lineCap: "round" }),
      }));
    } else if (el.type === "text") {
      const text = (() => {
        switch (el.textCase) {
          case "upper": return el.text.toUpperCase();
          case "lower": return el.text.toLowerCase();
          case "title": return el.text.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
          default: return el.text;
        }
      })();
      layer.add(new Konva.Text({
        x: el.x, y: el.y, text,
        fontSize: el.fontSize, fontFamily: el.fontFamily, fontStyle: el.fontStyle,
        textDecoration: el.textDecoration, align: el.align,
        fill: el.fill, width: el.width, lineHeight: el.lineHeight, letterSpacing: el.letterSpacing,
        rotation: el.rotation, scaleX: el.scaleX, scaleY: el.scaleY, opacity: el.opacity,
      }));
    } else if (el.type === "image" || el.type === "icon") {
      const src = el.type === "image" ? el.src : `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(el.svg.replace(/currentColor/g, el.color))))}`;
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.crossOrigin = "anonymous";
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = src;
      });
      const flipX = el.type === "image" ? !!el.flipX : false;
      const flipY = el.type === "image" ? !!el.flipY : false;
      // Mirror the editor's render structure: outer Group owns
      // geometry + clipFunc (for cornerRadius); inner Image at (0,0)
      // gets effects; an optional erase-mask Image is layered on top
      // with destination-out so painted areas become transparent in
      // the exported pixels, matching what the user sees on canvas.
      const cornerR = (el.type === "image" ? (el.cornerRadius ?? 0) : 0);
      const w = el.width;
      const h = el.height;
      const clipFunc = cornerR > 0 ? (ctx: Konva.Context) => {
        const r = Math.max(0, Math.min(cornerR, Math.min(w, h) / 2));
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(w - r, 0);
        ctx.quadraticCurveTo(w, 0, w, r);
        ctx.lineTo(w, h - r);
        ctx.quadraticCurveTo(w, h, w - r, h);
        ctx.lineTo(r, h);
        ctx.quadraticCurveTo(0, h, 0, h - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.closePath();
      } : undefined;
      const group = new Konva.Group({
        x: el.x, y: el.y, width: w, height: h,
        rotation: el.rotation,
        scaleX: (flipX ? -1 : 1) * el.scaleX,
        scaleY: (flipY ? -1 : 1) * el.scaleY,
        offsetX: flipX ? w : 0,
        offsetY: flipY ? h : 0,
        opacity: el.opacity,
        clipFunc,
      });
      const cropProp: Record<string, number> = {};
      if (el.type === "image" && el.cropBox) {
        cropProp.cropX = el.cropBox.x;
        cropProp.cropY = el.cropBox.y;
        cropProp.cropWidth = el.cropBox.width;
        cropProp.cropHeight = el.cropBox.height;
      }
      const node = new Konva.Image({
        image: img,
        x: 0, y: 0, width: w, height: h,
        ...cropProp,
      });
      group.add(node);
      // Apply image-only filters / adjustments so export matches preview.
      if (el.type === "image") {
        const filters: any[] = [];
        if (el.filter === "grayscale") filters.push(Konva.Filters.Grayscale);
        if (el.filter === "sepia") filters.push(Konva.Filters.Sepia);
        if (el.filter === "invert") filters.push(Konva.Filters.Invert);
        if (el.filter === "blur") filters.push(Konva.Filters.Blur);
        if (typeof el.brightness === "number") filters.push(Konva.Filters.Brighten);
        if (typeof el.contrast === "number") filters.push(Konva.Filters.Contrast);
        if (typeof el.saturation === "number") filters.push(Konva.Filters.HSL);
        if (filters.length) {
          node.filters(filters);
          if (typeof el.brightness === "number") node.brightness(el.brightness);
          if (typeof el.contrast === "number") node.contrast(el.contrast);
          if (typeof el.saturation === "number") node.saturation(el.saturation);
          if (el.filter === "blur") node.blurRadius(8);
          node.cache();
        }
        // Erase-mask: layer painted black-on-transparent PNG with
        // destination-out so masked pixels become transparent.
        if (el.eraseMask) {
          try {
            const maskImg = await new Promise<HTMLImageElement>((res, rej) => {
              const i = new Image();
              i.crossOrigin = "anonymous";
              i.onload = () => res(i);
              i.onerror = rej;
              i.src = el.eraseMask!;
            });
            group.add(new Konva.Image({
              image: maskImg,
              x: 0, y: 0, width: w, height: h,
              globalCompositeOperation: "destination-out",
              listening: false,
            }));
          } catch {
            // Mask failed to load (data-url malformed?) — skip silently
            // rather than block the entire export.
          }
        }
      }
      layer.add(group);
    }
  }

  layer.draw();

  // Wait one tick for any pending paint (icons rasterise via use-image
  // asynchronously in the live tree but here we already awaited image load).
  await new Promise((r) => setTimeout(r, 30));

  const dataUrl = stage.toDataURL({
    mimeType: opts.mime,
    quality: 0.92,
    pixelRatio: opts.pixelRatio,
  });

    return dataUrl;
  } finally {
    stage.destroy();
    container.remove();
  }
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function exportPng(transparent: boolean) {
  const { pages, project } = useStudio.getState();
  for (const [i, page] of pages.entries()) {
    const url = await rasterisePage(page, { mime: "image/png", transparent, pixelRatio: PIXEL_RATIO_HIGH });
    const suffix = pages.length > 1 ? `-page-${i + 1}` : "";
    downloadDataUrl(url, `${project.title}${suffix}.png`);
  }
}

export async function exportJpeg() {
  const { pages, project } = useStudio.getState();
  for (const [i, page] of pages.entries()) {
    const url = await rasterisePage(page, { mime: "image/jpeg", transparent: false, pixelRatio: PIXEL_RATIO_PRINT });
    const suffix = pages.length > 1 ? `-page-${i + 1}` : "";
    downloadDataUrl(url, `${project.title}${suffix}.jpg`);
  }
}

export async function exportPdf() {
  const { pages, project } = useStudio.getState();
  if (!pages.length) return;
  // Use the first page's dimensions to build the PDF; subsequent pages
  // get re-added with their own size.
  const first = pages[0];
  const orientation = first.width >= first.height ? "l" : "p";
  const doc = new jsPDF({ orientation, unit: "px", format: [first.width, first.height], compress: true });
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const url = await rasterisePage(page, { mime: "image/jpeg", transparent: false, pixelRatio: PIXEL_RATIO_PRINT });
    if (i > 0) {
      doc.addPage([page.width, page.height], page.width >= page.height ? "l" : "p");
    }
    doc.addImage(url, "JPEG", 0, 0, page.width, page.height);
  }
  doc.save(`${project.title}.pdf`);
}

export function downloadProject(p: ProjectData) {
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, `${p.title}.primestudio.json`);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
