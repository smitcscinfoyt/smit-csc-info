import { useState } from "react";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { getTool } from "@/components/tools/tools-data";
import { ToolResult } from "@/components/tools/tool-result";
import { Loader2 } from "lucide-react";

export default function PdfToWord() {
  const tool = getTool("pdf-to-word")!;
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [out, setOut] = useState<Blob | null>(null);

  const run = async () => {
    if (!files[0]) return;
    setBusy(true);
    setOut(null);
    setProgress("Loading PDF…");
    try {
      const pdfjs: any = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const buf = await files[0].arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise;

      const { Document, Packer, Paragraph, TextRun, PageBreak, HeadingLevel } = await import("docx");

      const pageBlocks: InstanceType<typeof Paragraph>[] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        setProgress(`Reading page ${p} of ${doc.numPages}…`);
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();

        // Group items by line using their y position. textContent items have transform [a,b,c,d,e,f] where f = y.
        const lines = new Map<number, string[]>();
        for (const it of tc.items as any[]) {
          if (typeof it.str !== "string") continue;
          const y = Math.round(it.transform[5]);
          const arr = lines.get(y) || [];
          arr.push(it.str);
          lines.set(y, arr);
        }
        const sortedYs = [...lines.keys()].sort((a, b) => b - a);

        if (p > 1) {
          pageBlocks.push(new Paragraph({ children: [new PageBreak()] }));
        }
        pageBlocks.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun({ text: `Page ${p}`, bold: true })],
            spacing: { after: 120 },
          }),
        );
        for (const y of sortedYs) {
          const text = (lines.get(y) || []).join(" ").replace(/\s+/g, " ").trim();
          if (!text) continue;
          pageBlocks.push(
            new Paragraph({
              children: [new TextRun({ text, size: 22 })],
              spacing: { after: 80 },
            }),
          );
        }
      }

      setProgress("Building Word document…");
      const docx = new Document({
        sections: [{ properties: {}, children: pageBlocks }],
      });
      const blob = await Packer.toBlob(docx);
      setOut(blob);
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
        accept="application/pdf"
        files={files}
        onFiles={(f) => {
          setFiles(f);
          setOut(null);
        }}
        label="Drop a PDF file"
        hint="PDF text → editable .docx"
      />

      <div className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
        Works best for text-based PDFs. Scanned/image PDFs need OCR first — try the PDF → Text tool, then paste into Word.
      </div>

      <Button
        onClick={run}
        disabled={files.length === 0 || busy}
        className="mt-5 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-bold"
      >
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        Convert to Word
      </Button>
      {progress && <div className="mt-2 text-xs text-gray-600">{progress}</div>}

      {out && (
        <ToolResult
          blob={out}
          filename={files[0].name.replace(/\.pdf$/i, "") + ".docx"}
          kind="pdf"
          fromSlug="pdf-to-word"
          subtitle="Editable Microsoft Word document."
        />
      )}
    </ToolLayout>
  );
}
