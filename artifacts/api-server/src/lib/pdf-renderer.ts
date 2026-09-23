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

export async function renderDocumentPreview(docId: string, pdfBuffer: Buffer, watermarkText: string = "Smit CSC Info") {
  await semaphore.acquire();
  try {
    const cacheDir = path.join(process.cwd(), 'artifacts', 'api-server', '.preview-cache', docId);
    await fs.mkdir(cacheDir, { recursive: true });

    const metadataPath = path.join(cacheDir, 'metadata.json');
    try {
      const metadataStr = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataStr);
      
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
    } catch (e) {
      // cache miss or invalid, proceed to render
    }

    const data = new Uint8Array(pdfBuffer);
    
    // Dynamic imports for blast-radius isolation
    // @ts-ignore
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { createCanvas, Path2D } = await import('@napi-rs/canvas');
    (global as any).Path2D = Path2D; // pdfjs might need this globally

    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const totalPages = pdf.numPages;

    const firstPage = await pdf.getPage(1);
    const viewport = firstPage.getViewport({ scale: 2.0 });
    
    // Always 50% of the FIRST page, regardless of total pages
    const targetHeight = viewport.height * 0.5;

    const files = [];
    const base64Images = [];

    const heightToRender = targetHeight;
    const canvas = createCanvas(viewport.width, heightToRender);
    const ctx = canvas.getContext('2d');
    
    const pageCanvas = createCanvas(viewport.width, viewport.height);
    const pageCtx = pageCanvas.getContext('2d');

    const renderContext = {
      canvasContext: pageCtx as any,
      viewport: viewport
    };

    await firstPage.render(renderContext).promise;

    // Draw cropped to main canvas
    ctx.drawImage(pageCanvas, 0, 0, viewport.width, heightToRender, 0, 0, viewport.width, heightToRender);

    // Add watermark
    ctx.save();
    ctx.translate(viewport.width / 2, heightToRender / 2);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = "rgba(150, 150, 150, 0.25)"; // made slightly darker/more visible
    ctx.font = "bold 60px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    for (let x = -viewport.width; x <= viewport.width; x += 400) {
      for (let y = -viewport.height; y <= viewport.height; y += 400) {
         ctx.fillText(watermarkText, x, y);
      }
    }
    ctx.restore();

    const webpBuffer = canvas.toBuffer('image/webp');
    const filename = `page-1.webp`;
    const filePath = path.join(cacheDir, filename);
    await fs.writeFile(filePath, webpBuffer);
    files.push(filename);
    base64Images.push(`data:image/webp;base64,${webpBuffer.toString('base64')}`);

    const result = {
      images: base64Images,
      totalPages,
      previewPercent: 50
    };

    await fs.writeFile(metadataPath, JSON.stringify({
      files,
      totalPages,
      previewPercent: 50
    }));

    return result;

  } finally {
    semaphore.release();
  }
}

export async function selfTestPdfRenderer() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([200, 200]);
  page.drawText('Test PDF for Renderer', {
    x: 10,
    y: 100,
    size: 15,
  });
  
  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  try {
    const result = await renderDocumentPreview('selftest-123', pdfBuffer, 'TEST');
    if (!result || !result.images || result.images.length === 0) {
      throw new Error("No images generated during self-test");
    }
    const cacheDir = path.join(process.cwd(), 'artifacts', 'api-server', '.preview-cache', 'selftest-123');
    await fs.rm(cacheDir, { recursive: true, force: true });
    console.log("PDF Renderer Self-test passed successfully.");
  } catch (err) {
    console.error("PDF Renderer Self-test failed!", err);
    throw err;
  }
}
