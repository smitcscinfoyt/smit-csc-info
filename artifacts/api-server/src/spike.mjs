import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, Path2D } from '@napi-rs/canvas';
global.Path2D = Path2D;
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure the standard fonts are found
const STANDARD_FONT_DATA_URL = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/';

async function renderPdfPage(pdfPath, outputPath) {
  console.log(`Rendering ${pdfPath}...`);
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  
class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return {
      canvas,
      context,
    };
  }

  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

  const canvasFactory = new NodeCanvasFactory();
  
  const loadingTask = pdfjsLib.getDocument({
    data,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    disableFontFace: true,
    useSystemFonts: true,
    canvasFactory
  });
  
  const pdfDocument = await loadingTask.promise;
  const page = await pdfDocument.getPage(1);
  
  // Fetch font info
  const fontData = await page.getOperatorList();
  console.log(`Font operations: ${Object.keys(fontData.fnArray).length}`);
  
  // List fonts used on the page
  const fontNames = new Set();
  fontData.fnArray.forEach((fn, i) => {
    if (fn === pdfjsLib.OPS.setFont) {
      fontNames.add(fontData.argsArray[i][0]);
    }
  });
  
  for (const fontId of fontNames) {
    try {
      const fontObj = page.commonObjs.get(fontId);
      console.log(`  - Font ${fontId}: ${fontObj.name}, embedded: ${fontObj.isType3Font || fontObj.mimetype ? 'yes' : 'no'}`);
    } catch (e) {
      console.log(`  - Font ${fontId}: (Standard or error loading)`);
    }
  }
  
  // Scale for rendering (target ~1800px width)
  const baseViewport = page.getViewport({ scale: 1.0 });
  const scale = 1800 / baseViewport.width;
  const viewport = page.getViewport({ scale });
  
  // We need a canvas factory for pdfjs-dist in node environment
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  
  const renderContext = {
    canvasContext: ctx,
    viewport: viewport,
  };
  
  await page.render(renderContext).promise;
  
  // Add Watermark
  ctx.font = `bold ${Math.round(40 * scale)}px sans-serif`;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(viewport.width / 2, viewport.height / 2);
  ctx.rotate(-Math.PI / 4);
  
  const text = "Smit CSC Info";
  const spacing = 400 * scale;
  for (let x = -viewport.width; x < viewport.width; x += spacing) {
    for (let y = -viewport.height; y < viewport.height; y += spacing) {
      ctx.fillText(text, x, y);
    }
  }
  
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const buffer = canvas.toBuffer('image/png');
  
  // Crop to top 50% and save as WebP
  const cropHeight = Math.floor(viewport.height * 0.5);
  
  const startWebp = performance.now();
  const webpBuffer = await sharp(buffer)
    .extract({ left: 0, top: 0, width: viewport.width, height: cropHeight })
    .webp({ quality: 85 })
    .toBuffer();
  const timeWebp = performance.now() - startWebp;
  
  fs.writeFileSync(outputPath, webpBuffer);
  console.log(`WebP (cropped): ${viewport.width}x${cropHeight}, ${webpBuffer.length} bytes, ${timeWebp.toFixed(2)}ms`);
}

async function runSpike() {
  const docsDir = path.resolve(__dirname, '../../../attached_assets/documents');
  const filesToTest = [
    '1-vidhava-sahay-affidavit.pdf',
    '3-varsai-pedhinamu-affidavit.pdf',
    '7-khedut-akasmat-varsai-affidavit.pdf'
  ];
  
  const outDir = path.resolve(__dirname, '..', 'spike_output');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  
  for (const file of filesToTest) {
    const fullPath = path.join(docsDir, file);
    if (fs.existsSync(fullPath)) {
      const outPath = path.join(outDir, file.replace('.pdf', '.webp'));
      try {
        await renderPdfPage(fullPath, outPath);
      } catch (err) {
        console.error(`Error rendering ${file}:`, err);
      }
    } else {
      console.log(`File not found: ${fullPath}`);
    }
  }
}

runSpike().then(() => console.log('Spike complete')).catch(console.error);
