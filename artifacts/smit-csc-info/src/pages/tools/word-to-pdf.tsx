import { useState } from "react";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { getTool } from "@/components/tools/tools-data";
import { ToolResult } from "@/components/tools/tool-result";
import { Loader2 } from "lucide-react";

export default function WordToPdf() {
  const tool = getTool("word-to-pdf")!;
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [out, setOut] = useState<Blob | null>(null);

  const run = async () => {
    if (!files[0]) return;
    setBusy(true);
    setOut(null);
    setProgress("Reading Word file…");
    try {
      const mammoth: any = await import("mammoth");
      const buf = await files[0].arrayBuffer();
      const { value: rawText } = await mammoth.extractRawText({ arrayBuffer: buf });

      setProgress("Building PDF…");
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
      void fontBold;

      // A4 in points (72dpi)
      const pageW = 595;
      const pageH = 842;
      const margin = 56;
      const fontSize = 11;
      const lineHeight = fontSize * 1.45;
      const maxW = pageW - margin * 2;

      // Word-wrap each paragraph by measuring text width.
      const paragraphs = rawText.split(/\r?\n/);
      const wrapLine = (text: string): string[] => {
        if (!text.trim()) return [""];
        const words = text.split(/(\s+)/);
        const lines: string[] = [];
        let cur = "";
        for (const w of words) {
          const candidate = cur + w;
          const width = font.widthOfTextAtSize(candidate, fontSize);
          if (width > maxW && cur.trim()) {
            lines.push(cur.trimEnd());
            cur = w.trimStart();
          } else {
            cur = candidate;
          }
        }
        if (cur) lines.push(cur);
        return lines;
      };

      let page = doc.addPage([pageW, pageH]);
      let y = pageH - margin;
      for (const para of paragraphs) {
        const lines = wrapLine(para);
        for (const line of lines) {
          if (y < margin) {
            page = doc.addPage([pageW, pageH]);
            y = pageH - margin;
          }
          // Strip characters not in WinAnsi (pdf-lib StandardFont limitation).
          const safe = line.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF€]/g, "?");
          page.drawText(safe, {
            x: margin,
            y: y - fontSize,
            size: fontSize,
            font,
            color: rgb(0.05, 0.05, 0.1),
          });
          y -= lineHeight;
        }
        // Paragraph gap
        y -= lineHeight * 0.4;
      }

      const bytes = await doc.save();
      const ab = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(ab).set(bytes);
      setOut(new Blob([ab], { type: "application/pdf" }));
    } catch (e: any) {
      alert("Failed: " + (e?.message || e));
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <ToolLayout tool={tool}>
      <DropZone
        accept=".doc,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
        files={files}
        onFiles={(f) => {
          setFiles(f);
          setOut(null);
        }}
        label="Drop a Word document"
        hint=".docx works best • formatting becomes plain text"
      />

      <div className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
        Note: complex layouts (tables, images, fancy fonts) become plain A4 text. For pixel-perfect conversion, open the .docx in Word and use Save as PDF.
      </div>

      <Button
        onClick={run}
        disabled={files.length === 0 || busy}
        className="mt-5 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-bold"
      >
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        Convert to PDF
      </Button>
      {progress && <div className="mt-2 text-xs text-gray-600">{progress}</div>}

      {out && (
        <ToolResult
          blob={out}
          filename={files[0].name.replace(/\.(docx?|DOCX?)$/i, "") + ".pdf"}
          kind="pdf"
          fromSlug="word-to-pdf"
          subtitle="Word document converted to A4 PDF."
        />
      )}
    </ToolLayout>
  );
}
