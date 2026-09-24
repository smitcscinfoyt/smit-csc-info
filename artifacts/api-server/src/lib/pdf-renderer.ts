import { promises as fs } from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

// Local semaphore to prevent concurrent renders
class Semaphore {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire() {
    if (this.locked) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.locked = true;
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.locked = false;
    }
  }
}

const semaphore = new Semaphore();

const RENDER_SCALE = 2.0;
const FREE_PREVIEW_PERCENT = 0.5;
// Bump this when the render algorithm changes to auto-invalidate stale cache entries.
const CACHE_VERSION = 2; // v2: total-height crop across all pages

export async function renderDocumentPreview(docId: string, pdfBuffer: Buffer, watermarkText: string = "Smit CSC Info") {
  await semaphore.acquire();
  try {
    const cacheDir = path.join(process.cwd(), 'artifacts', 'api-server', '.preview-cache', docId);
    await fs.mkdir(cacheDir, { recursive: true });

    const metadataPath = path.join(cacheDir, 'metadata.json');
    try {
      const metadataStr = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataStr);

      // Only use cache if it matches current algorithm version
      if (metadata.cacheVersion === CACHE_VERSION) {
        const images = [];
        for (const file of metadata.files) {
          const filePath = path.join(cacheDir, file);
          const data = await fs.readFile(filePath);
          images.push(`data:image/webp;base64,${data.toString('base64')}`);
        }
        return {
          images,
          totalPages: metadata.totalPages,
          previewPercent: 50
        };
      }
      // Version mismatch — fall through to re-render
    } catch (e) {
      // cache miss or invalid — proceed to render
    }

    const data = new Uint8Array(pdfBuffer);

    // Dynamic imports for blast-radius isolation — do NOT change to top-level imports
    // @ts-ignore
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { createCanvas, Path2D } = await import('@napi-rs/canvas');
    (global as any).Path2D = Path2D; // pdfjs may need this globally

    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const totalPages = pdf.numPages;

    // ── Step 1: compute per-page viewport heights at render scale ────────────
    // We need to know total cumulative height to calculate the 50% cutoff line.
    // pdfjs pages can have different heights (though most real docs are uniform).
    const pageViewports: Array<{ width: number; height: number }> = [];
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: RENDER_SCALE });
      pageViewports.push({ width: vp.width, height: vp.height });
    }

    const totalDocHeight = pageViewports.reduce((sum, vp) => sum + vp.height, 0);
    const cutoffHeight = Math.ceil(totalDocHeight * FREE_PREVIEW_PERCENT);
    // Use the width of page 1 as the canvas width (assume uniform width)
    const canvasWidth = pageViewports[0].width;

    // ── Step 2: render pages top-to-bottom until we hit the cutoff ──────────
    // We produce a SINGLE output image that is exactly cutoffHeight pixels tall,
    // compositing page renders one after another, cropping the last one if needed.
    const outputCanvas = createCanvas(canvasWidth, cutoffHeight);
    const outputCtx = outputCanvas.getContext('2d');

    let yOffset = 0;    // cursor into the output canvas
    let remaining = cutoffHeight;  // pixels still to fill

    for (let i = 1; i <= totalPages; i++) {
      if (remaining <= 0) break;

      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: RENDER_SCALE });

      // Render this page to its own full-size canvas
      const pageCanvas = createCanvas(viewport.width, viewport.height);
      const pageCtx = pageCanvas.getContext('2d');
      await page.render({ canvasContext: pageCtx as any, viewport } as any).promise;

      // How many pixels of this page do we copy?
      const rowsToCopy = Math.min(remaining, viewport.height);

      // drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh)
      outputCtx.drawImage(
        pageCanvas,
        0, 0, viewport.width, rowsToCopy,   // source: top rowsToCopy rows of this page
        0, yOffset, canvasWidth, rowsToCopy   // dest: next slice in output canvas
      );

      yOffset += rowsToCopy;
      remaining -= rowsToCopy;
    }

    // ── Step 3: burn in diagonal tiled watermark ─────────────────────────────
    outputCtx.save();
    outputCtx.translate(canvasWidth / 2, cutoffHeight / 2);
    outputCtx.rotate(-Math.PI / 4);
    outputCtx.fillStyle = "rgba(120, 120, 120, 0.28)";
    outputCtx.font = `bold ${Math.round(canvasWidth / 15)}px Arial`;
    outputCtx.textAlign = "center";
    outputCtx.textBaseline = "middle";

    const step = Math.round(canvasWidth / 4);
    for (let x = -canvasWidth * 1.5; x <= canvasWidth * 1.5; x += step) {
      for (let y = -cutoffHeight * 1.5; y <= cutoffHeight * 1.5; y += step) {
        outputCtx.fillText(watermarkText, x, y);
      }
    }
    outputCtx.restore();

    // ── Step 4: encode, cache, return ────────────────────────────────────────
    const webpBuffer = outputCanvas.toBuffer('image/webp');
    const filename = `preview-crop.webp`;
    const filePath = path.join(cacheDir, filename);
    await fs.writeFile(filePath, webpBuffer);

    const base64Images = [`data:image/webp;base64,${webpBuffer.toString('base64')}`];

    await fs.writeFile(metadataPath, JSON.stringify({
      cacheVersion: CACHE_VERSION,
      files: [filename],
      totalPages,
      previewPercent: 50,
      // store crop math for debugging
      totalDocHeight: Math.round(totalDocHeight),
      cutoffHeight,
    }));

    return {
      images: base64Images,
      totalPages,
      previewPercent: 50,
    };

  } finally {
    semaphore.release();
  }
}

export async function selfTestPdfRenderer() {
  const pdfDoc = await PDFDocument.create();
  // Add TWO pages to exercise the multi-page path
  const page1 = pdfDoc.addPage([595, 842]); // A4
  page1.drawText('Page 1 — Smit CSC Info self-test', { x: 50, y: 700, size: 20 });
  const page2 = pdfDoc.addPage([595, 842]);
  page2.drawText('Page 2 — Smit CSC Info self-test', { x: 50, y: 700, size: 20 });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  // Expected: output image height ≈ 50% of (842 + 842) * RENDER_SCALE = 1684 px
  try {
    const result = await renderDocumentPreview('selftest-123', pdfBuffer, 'TEST');
    if (!result || !result.images || result.images.length === 0) {
      throw new Error("No images generated during self-test");
    }
    // Clean up test cache
    const cacheDir = path.join(process.cwd(), 'artifacts', 'api-server', '.preview-cache', 'selftest-123');
    await fs.rm(cacheDir, { recursive: true, force: true });
    console.log("PDF Renderer Self-test passed successfully.");
  } catch (err) {
    console.error("PDF Renderer Self-test failed!", err);
    throw err;
  }
}
