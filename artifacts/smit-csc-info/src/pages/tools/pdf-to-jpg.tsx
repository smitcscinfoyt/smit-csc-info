import { useEffect, useState } from "react";
import JSZip from "jszip";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { getTool } from "@/components/tools/tools-data";
import { renderPagesAsJpg } from "@/lib/tools/pdf-tools";
import { downloadBlob, formatBytes } from "@/lib/tools/file";
import { Download, Loader2, Image as ImageIcon, Archive } from "lucide-react";

type Item = { index: number; blob: Blob; url: string; width: number; height: number };

export default function PdfToJpgPage() {
  const tool = getTool("pdf-to-jpg")!;
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ cur: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [dpi, setDpi] = useState(200);

  const file = files[0];

  // Revoke object URLs on item replacement / unmount.
  useEffect(() => {
    return () => {
      items.forEach((i) => URL.revokeObjectURL(i.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    setItems((prev) => {
      prev.forEach((i) => URL.revokeObjectURL(i.url));
      return [];
    });
    setError(null);
    setProgress({ cur: 0, total: 0 });
  }, [file]);

  const run = async () => {
    if (!file) return;
    // Memory guard: warn for very large PDFs at high DPI.
    if (file.size > 25 * 1024 * 1024 && dpi >= 300) {
      const ok = window.confirm(
        "This is a large PDF at 300 DPI. It may use a lot of memory. Continue?",
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    items.forEach((i) => URL.revokeObjectURL(i.url));
    setItems([]);
    try {
      const out = await renderPagesAsJpg(file, dpi, 0.92, (cur, total) =>
        setProgress({ cur, total }),
      );
      setItems(
        out.map((o) => ({
          ...o,
          url: URL.createObjectURL(o.blob),
        })),
      );
    } catch {
      setError("Could not convert this PDF. It may be encrypted or corrupted.");
    } finally {
      setBusy(false);
    }
  };

  const downloadOne = (it: Item) => {
    const base = file?.name.replace(/\.pdf$/i, "") ?? "page";
    downloadBlob(it.blob, `${base}-page-${it.index + 1}.jpg`);
  };

  const downloadAll = async () => {
    if (items.length === 0 || !file) return;
    const zip = new JSZip();
    const base = file.name.replace(/\.pdf$/i, "");
    items.forEach((it) => {
      const num = String(it.index + 1).padStart(3, "0");
      zip.file(`${base}-page-${num}.jpg`, it.blob);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `${base}-pages.zip`);
  };

  return (
    <ToolLayout tool={tool} fullBleed={files.length > 0}>
      <DropZone
        accept="application/pdf"
        files={files}
        onFiles={(f) => setFiles(f.slice(0, 1))}
        label="Drop a PDF here"
        hint="Each page will be converted to a JPG image"
        maxSizeMb={50}
      />

      {file && (
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            Quality (DPI):
            <select
              value={dpi}
              onChange={(e) => setDpi(Number(e.target.value))}
              disabled={busy}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value={100}>100 DPI (small)</option>
              <option value={150}>150 DPI (web)</option>
              <option value={200}>200 DPI (balanced)</option>
              <option value={300}>300 DPI (print)</option>
            </select>
          </label>
          <Button onClick={run} disabled={busy} size="lg">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Converting{" "}
                {progress.total > 0 ? `${progress.cur}/${progress.total}` : ""}…
              </>
            ) : (
              <>
                <ImageIcon className="h-4 w-4 mr-2" /> Convert to JPG
              </>
            )}
          </Button>
        </div>
      )}

      {error && (
        <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-gray-700">
              {items.length} JPG image{items.length === 1 ? "" : "s"} ready
            </div>
            <Button
              onClick={downloadAll}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Archive className="h-4 w-4 mr-1" /> Download all (ZIP)
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {items.map((it) => (
              <div
                key={it.index}
                className="rounded-xl border-2 border-gray-200 bg-white overflow-hidden"
              >
                <img src={it.url} alt={`Page ${it.index + 1}`} className="w-full h-auto block" />
                <div className="flex items-center justify-between p-2 border-t border-gray-200">
                  <div className="text-xs font-semibold text-gray-700">
                    Page {it.index + 1} • {formatBytes(it.blob.size)}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => downloadOne(it)}
                    className="h-7 w-7 text-indigo-600 hover:bg-indigo-50"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
