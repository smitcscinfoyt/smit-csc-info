import { useState } from "react";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { getTool } from "@/components/tools/tools-data";
import { ToolResult } from "@/components/tools/tool-result";
import { Loader2, ScanText, Languages } from "lucide-react";

type Lang = "eng" | "guj" | "hin" | "eng+guj" | "eng+hin" | "eng+guj+hin";

const LANG_OPTS: { value: Lang; label: string }[] = [
  { value: "eng", label: "English" },
  { value: "guj", label: "ગુજરાતી" },
  { value: "hin", label: "हिन्दी" },
  { value: "eng+guj", label: "English + ગુજરાતી" },
  { value: "eng+hin", label: "English + हिन्दी" },
  { value: "eng+guj+hin", label: "All three" },
];

export default function PdfToText() {
  const tool = getTool("pdf-to-text")!;
  const [files, setFiles] = useState<File[]>([]);
  const [lang, setLang] = useState<Lang>("eng");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [out, setOut] = useState<{ blob: Blob; preview: string } | null>(null);

  const run = async () => {
    if (!files[0]) return;
    setBusy(true);
    setOut(null);
    setProgress("Loading PDF…");
    try {
      // Render every page → canvas → OCR.
      const pdfjs: any = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const buf = await files[0].arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise;

      const Tesseract: any = await import("tesseract.js");
      const allText: string[] = [];
      // Cap pages at ~12 megapixels to avoid OOM on huge scans.
      const MAX_PIXELS = 12_000_000;
      const MAX_DIM = 3500;
      for (let p = 1; p <= doc.numPages; p++) {
        setProgress(`Reading page ${p} of ${doc.numPages}…`);
        const page = await doc.getPage(p);
        let scale = 2;
        let vp = page.getViewport({ scale });
        // Adaptively shrink scale until the page fits within the budget.
        while ((vp.width * vp.height > MAX_PIXELS || vp.width > MAX_DIM || vp.height > MAX_DIM) && scale > 0.5) {
          scale *= 0.8;
          vp = page.getViewport({ scale });
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;

        // Try fast text extraction first — many PDFs are text-based.
        const tc = await page.getTextContent();
        const textOnly = tc.items.map((it: any) => it.str).join(" ").trim();
        let pageText = "";
        if (textOnly.length > 30) {
          pageText = tc.items
            .map((it: any) => it.str + (it.hasEOL ? "\n" : " "))
            .join("")
            .replace(/[ \t]+\n/g, "\n");
        } else {
          // Fallback to OCR
          setProgress(`Running OCR on page ${p} of ${doc.numPages}…`);
          const result = await Tesseract.recognize(canvas, lang, {
            logger: (m: any) => {
              if (m.status === "recognizing text" && typeof m.progress === "number") {
                setProgress(`OCR page ${p}/${doc.numPages} — ${Math.round(m.progress * 100)}%`);
              }
            },
          });
          pageText = result.data.text || "";
        }
        allText.push(`──── Page ${p} ────\n${pageText.trim()}\n`);
      }
      const full = allText.join("\n");
      const blob = new Blob([full], { type: "text/plain;charset=utf-8" });
      setOut({ blob, preview: full.slice(0, 1500) });
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
        hint="PDF • text + image-based pages both supported"
      />

      <div className="mt-5">
        <div className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
          <Languages className="h-4 w-4" /> OCR language (used only for image-based pages)
        </div>
        <div className="flex flex-wrap gap-2">
          {LANG_OPTS.map((o) => (
            <Button
              key={o.value}
              variant={lang === o.value ? "default" : "outline"}
              size="sm"
              onClick={() => setLang(o.value)}
              className={
                lang === o.value
                  ? "bg-gradient-to-r from-indigo-600 to-violet-700 text-white font-bold"
                  : "border-gray-200"
              }
            >
              {o.label}
            </Button>
          ))}
        </div>
      </div>

      <Button
        onClick={run}
        disabled={files.length === 0 || busy}
        className="mt-5 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-bold"
      >
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ScanText className="h-4 w-4 mr-2" />}
        Extract Text
      </Button>
      {progress && <div className="mt-2 text-xs text-gray-600">{progress}</div>}

      {out && (
        <>
          <ToolResult
            blob={out.blob}
            filename={files[0].name.replace(/\.pdf$/i, "") + ".txt"}
            kind="pdf"
            fromSlug="pdf-to-text"
            subtitle="Plain text extracted from your PDF."
          />

          <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 max-h-64 overflow-auto">
            <pre className="text-xs whitespace-pre-wrap font-mono text-gray-800">{out.preview}{out.preview.length >= 1500 ? "…" : ""}</pre>
          </div>
        </>
      )}
    </ToolLayout>
  );
}
