import { useState } from "react";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { getTool } from "@/components/tools/tools-data";
import { ToolResult } from "@/components/tools/tool-result";
import { Loader2 } from "lucide-react";

export default function ExcelToPdf() {
  const tool = getTool("excel-to-pdf")!;
  const [files, setFiles] = useState<File[]>([]);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [out, setOut] = useState<Blob | null>(null);

  const run = async () => {
    if (!files[0]) return;
    setBusy(true);
    setOut(null);
    setProgress("Reading spreadsheet…");
    try {
      const XLSX: any = await import("xlsx");
      const buf = await files[0].arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

      const pageW = orientation === "landscape" ? 842 : 595;
      const pageH = orientation === "landscape" ? 595 : 842;
      const margin = 32;
      const fontSize = 9;
      const cellPad = 4;
      const rowH = fontSize + cellPad * 2;
      const maxW = pageW - margin * 2;

      for (const sheetName of wb.SheetNames) {
        setProgress(`Rendering sheet "${sheetName}"…`);
        const ws = wb.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
        if (!rows.length) continue;

        // Compute per-column widths from longest cell, capped to fit page.
        const colCount = Math.max(...rows.map((r) => r.length));
        const naturalW: number[] = new Array(colCount).fill(40);
        for (const r of rows) {
          for (let c = 0; c < colCount; c++) {
            const text = String(r[c] ?? "");
            const w = font.widthOfTextAtSize(text.slice(0, 50), fontSize) + cellPad * 2 + 4;
            if (w > naturalW[c]) naturalW[c] = Math.min(w, 220);
          }
        }
        const totalNatural = naturalW.reduce((a, b) => a + b, 0);
        const scale = totalNatural > maxW ? maxW / totalNatural : 1;
        const colW = naturalW.map((w) => w * scale);

        let page = doc.addPage([pageW, pageH]);
        // Sheet title
        page.drawText(`Sheet: ${sheetName}`, {
          x: margin,
          y: pageH - margin - 4,
          size: 12,
          font: fontBold,
          color: rgb(0.05, 0.05, 0.1),
        });
        let y = pageH - margin - 22;

        const drawRow = (cells: any[], header = false) => {
          if (y - rowH < margin) {
            page = doc.addPage([pageW, pageH]);
            y = pageH - margin;
          }
          let x = margin;
          for (let c = 0; c < colCount; c++) {
            const w = colW[c];
            // Cell border
            page.drawRectangle({
              x,
              y: y - rowH,
              width: w,
              height: rowH,
              borderColor: rgb(0.7, 0.7, 0.75),
              borderWidth: 0.5,
              color: header ? rgb(0.93, 0.91, 1) : undefined,
            });
            // Cell text — clip by characters to avoid overflow.
            const raw = String(cells[c] ?? "").replace(/[\r\n\t]+/g, " ");
            const safe = raw.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF€]/g, "?");
            let txt = safe;
            const usableW = w - cellPad * 2;
            const f = header ? fontBold : font;
            while (txt && f.widthOfTextAtSize(txt, fontSize) > usableW) {
              txt = txt.slice(0, -1);
            }
            page.drawText(txt, {
              x: x + cellPad,
              y: y - rowH + cellPad + 1,
              size: fontSize,
              font: f,
              color: rgb(0.05, 0.05, 0.1),
            });
            x += w;
          }
          y -= rowH;
        };

        drawRow(rows[0], true);
        for (let i = 1; i < rows.length; i++) {
          drawRow(rows[i]);
        }
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
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        files={files}
        onFiles={(f) => {
          setFiles(f);
          setOut(null);
        }}
        label="Drop a spreadsheet"
        hint=".xlsx, .xls or .csv • each sheet becomes its own pages"
      />

      <div className="mt-5">
        <div className="text-sm font-semibold text-gray-700 mb-2">Page orientation</div>
        <div className="flex gap-2">
          {(["portrait", "landscape"] as const).map((o) => (
            <Button
              key={o}
              variant={orientation === o ? "default" : "outline"}
              size="sm"
              onClick={() => setOrientation(o)}
              className={
                orientation === o
                  ? "bg-gradient-to-r from-indigo-600 to-violet-700 text-white font-bold capitalize"
                  : "capitalize border-gray-200"
              }
            >
              {o}
            </Button>
          ))}
        </div>
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
          filename={files[0].name.replace(/\.(xlsx?|csv|XLSX?|CSV)$/i, "") + ".pdf"}
          kind="pdf"
          fromSlug="excel-to-pdf"
          subtitle="Spreadsheet rendered as a printable PDF."
        />
      )}
    </ToolLayout>
  );
}
