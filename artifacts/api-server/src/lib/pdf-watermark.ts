import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

export async function addWatermarkToPdf(pdfBuffer: Buffer | Uint8Array, watermarkText = "Smit CSC Info"): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const { width, height } = page.getSize();
    const fontSize = Math.min(width, height) / 10;
    const textWidth = font.widthOfTextAtSize(watermarkText, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    // Center watermark rotated 45 degrees
    page.drawText(watermarkText, {
      x: (width - textWidth) / 2 + 30,
      y: (height - textHeight) / 2 - 30,
      size: fontSize,
      font,
      color: rgb(0.75, 0.2, 0.2),
      opacity: 0.28,
      rotate: degrees(45),
    });

    // Add smaller repeating watermark top-left & bottom-right
    page.drawText(watermarkText, {
      x: width * 0.15,
      y: height * 0.8,
      size: fontSize * 0.55,
      font,
      color: rgb(0.6, 0.2, 0.2),
      opacity: 0.18,
      rotate: degrees(30),
    });

    page.drawText(watermarkText, {
      x: width * 0.55,
      y: height * 0.2,
      size: fontSize * 0.55,
      font,
      color: rgb(0.6, 0.2, 0.2),
      opacity: 0.18,
      rotate: degrees(30),
    });
  }

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}
