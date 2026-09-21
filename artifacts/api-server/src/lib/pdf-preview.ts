import path from 'path';
import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import sharp from 'sharp';

// Polyfill Path2D for pdfjs-dist
global.Path2D = Path2D;

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const pdfjsPath = path.dirname(require.resolve('pdfjs-dist/package.json'));
const STANDARD_FONT_DATA_URL = path.join(pdfjsPath, 'standard_fonts') + '/';

// Optional: check if Path2D works at startup
try {
  new global.Path2D();
} catch (err) {
  console.error("FATAL: Path2D polyfill failed to initialize. PDF rasterization will break.");
  process.exit(1);
}

export interface PreviewOptions {
  watermarkText?: string;
  watermarkOpacity?: number;
  cropToHalf?: boolean;
}

export async function generatePdfPreview(
  pdfBuffer: Buffer,
  outputPath: string,
  options: PreviewOptions = {}
): Promise<void> {
  const data = new Uint8Array(pdfBuffer);
  
  const canvasFactory = {
    create: function (width: number, height: number) {
      const canvas = createCanvas(width, height);
      const context = canvas.getContext('2d');
      return { canvas, context };
    },
    reset: function (canvasAndContext: any, width: number, height: number) {
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    },
    destroy: function (canvasAndContext: any) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.canvas = null;
      canvasAndContext.context = null;
    }
  };

  const loadingTask = pdfjsLib.getDocument({
    data,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    disableFontFace: true,
    useSystemFonts: true,
    canvasFactory
  });

  const pdfDocument = await loadingTask.promise;
  const page = await pdfDocument.getPage(1);
  
  // Target ~1800px width
  const baseViewport = page.getViewport({ scale: 1.0 });
  const scale = 1800 / baseViewport.width;
  const viewport = page.getViewport({ scale });
  
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  
  const renderContext = {
    canvasContext: ctx as any,
    viewport: viewport,
  };
  
  await page.render(renderContext).promise;
  
  if (options.watermarkText) {
    ctx.font = `bold ${Math.round(40 * scale)}px sans-serif`;
    ctx.fillStyle = `rgba(0, 0, 0, ${options.watermarkOpacity || 0.15})`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(viewport.width / 2, viewport.height / 2);
    ctx.rotate(-Math.PI / 4);
    
    const spacing = 400 * scale;
    for (let x = -viewport.width; x < viewport.width; x += spacing) {
      for (let y = -viewport.height; y < viewport.height; y += spacing) {
        ctx.fillText(options.watermarkText, x, y);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  const imageBuffer = canvas.toBuffer('image/png');
  
  let sharpPipeline = sharp(imageBuffer);
  
  if (options.cropToHalf) {
    const cropHeight = Math.floor(viewport.height * 0.5);
    sharpPipeline = sharpPipeline.extract({ left: 0, top: 0, width: viewport.width, height: cropHeight });
  }
  
  const webpBuffer = await sharpPipeline.webp({ quality: 85 }).toBuffer();
  
  // Ensure directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, webpBuffer);
}
