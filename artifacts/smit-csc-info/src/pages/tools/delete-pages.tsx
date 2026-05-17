import { useEffect, useState } from "react";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { getTool } from "@/components/tools/tools-data";
import { renderThumbnails, extractPages, type PageThumb } from "@/lib/tools/pdf-tools";
import { ToolResult } from "@/components/tools/tool-result";
import { Loader2, Trash2, RotateCcw } from "lucide-react";

export default function DeletePages() {
  const tool = getTool("delete-pages")!;
  const [files, setFiles] = useState<File[]>([]);
  const [thumbs, setThumbs] = useState<PageThumb[]>([]);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Blob | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (files.length === 0) {
      setThumbs([]);
      setRemoved(new Set());
      setOut(null);
      setError(null);
      return;
    }
    (async () => {
      setBusy(true);
      setError(null);
      setProgress("Loading PDF…");
      try {
        const t = await renderThumbnails(files[0], 220);
        if (active) {
          if (t.length === 0) {
            setError("This PDF has no pages.");
            setThumbs([]);
          } else {
            setThumbs(t);
            setRemoved(new Set());
            setOut(null);
          }
        }
      } catch (e: any) {
        if (active) setError("Could not read this PDF: " + (e?.message || e));
      } finally {
        if (active) {
          setBusy(false);
          setProgress("");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [files]);

  const toggle = (idx: number) =>
    setRemoved((p) => {
      const n = new Set(p);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      setOut(null);
      return n;
    });

  const make = async () => {
    if (!files[0] || removed.size === 0) return;
    setBusy(true);
    setError(null);
    setProgress("Removing pages…");
    try {
      const keep = thumbs.map((_, i) => i).filter((i) => !removed.has(i));
      if (keep.length === 0) {
        setError("You must keep at least one page.");
        return;
      }
      const blob = await extractPages(files[0], keep);
      setOut(blob);
    } catch (e: any) {
      setError("Could not save the new PDF: " + (e?.message || e));
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <ToolLayout tool={tool} fullBleed={files.length > 0}>
      <DropZone
        accept="application/pdf"
        files={files}
        onFiles={(f) => setFiles(f)}
        label="Drop a PDF file"
        hint="PDF • click pages to mark for deletion"
      />

      {thumbs.length > 0 && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRemoved(new Set())}
              className="border-gray-200"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
            <span className="text-xs text-gray-600">
              {removed.size} of {thumbs.length} marked for deletion
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {thumbs.map((t, i) => {
              const isRemoved = removed.has(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggle(i)}
                  className={`relative rounded-xl overflow-hidden border-2 transition ${
                    isRemoved
                      ? "border-red-500 ring-2 ring-red-300"
                      : "border-gray-200 hover:border-indigo-400"
                  }`}
                >
                  <img src={t.dataUrl} className={`w-full ${isRemoved ? "opacity-30" : ""}`} alt={`Page ${i + 1}`} />
                  <div className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                    Page {i + 1}
                  </div>
                  {isRemoved && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-red-600 text-white rounded-full p-2">
                        <Trash2 className="h-5 w-5" />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      <Button
        onClick={make}
        disabled={removed.size === 0 || busy}
        className="mt-5 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-bold"
      >
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
        Delete {removed.size || ""} Page{removed.size === 1 ? "" : "s"}
      </Button>
      {progress && <div className="mt-2 text-xs text-gray-500">{progress}</div>}
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {out && (
        <ToolResult
          blob={out}
          filename={files[0].name.replace(/\.pdf$/i, "") + "-trimmed.pdf"}
          kind="pdf"
          fromSlug="delete-pages"
          subtitle={`${thumbs.length - removed.size} page${thumbs.length - removed.size === 1 ? "" : "s"} kept`}
          onStartOver={() => {
            setFiles([]);
            setThumbs([]);
            setRemoved(new Set());
            setOut(null);
            setError(null);
          }}
        />
      )}
    </ToolLayout>
  );
}
