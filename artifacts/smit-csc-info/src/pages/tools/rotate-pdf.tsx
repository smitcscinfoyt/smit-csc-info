import { useEffect, useState } from "react";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { getTool } from "@/components/tools/tools-data";
import { renderThumbnails, applyRotations, type PageThumb } from "@/lib/tools/pdf-tools";
import { ToolResult } from "@/components/tools/tool-result";
import { Loader2, RotateCw, RotateCcw } from "lucide-react";

type Rot = 0 | 90 | 180 | 270;

export default function RotatePdfPage() {
  const tool = getTool("rotate-pdf")!;
  const [files, setFiles] = useState<File[]>([]);
  const [thumbs, setThumbs] = useState<PageThumb[]>([]);
  const [rotations, setRotations] = useState<Record<number, Rot>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outBlob, setOutBlob] = useState<Blob | null>(null);

  const file = files[0];

  useEffect(() => {
    setOutBlob(null);
    setError(null);
    setThumbs([]);
    setRotations({});
    if (!file) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const t = await renderThumbnails(file);
        if (!cancelled) setThumbs(t);
      } catch {
        if (!cancelled) setError("Could not read this PDF. It may be encrypted or corrupted.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const turn = (idx: number, dir: 1 | -1) => {
    setOutBlob(null);
    const cur = rotations[idx] ?? 0;
    const next = (((cur + dir * 90) % 360) + 360) % 360;
    setRotations({ ...rotations, [idx]: next as Rot });
  };

  const rotateAll = (dir: 1 | -1) => {
    setOutBlob(null);
    const next: Record<number, Rot> = {};
    thumbs.forEach((t) => {
      const cur = rotations[t.index] ?? 0;
      next[t.index] = ((((cur + dir * 90) % 360) + 360) % 360) as Rot;
    });
    setRotations(next);
  };

  const reset = () => {
    setOutBlob(null);
    setRotations({});
  };

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setOutBlob(null);
    try {
      const blob = await applyRotations(file, rotations);
      setOutBlob(blob);
    } catch {
      setError("Failed to save rotated PDF.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolLayout tool={tool} fullBleed={files.length > 0}>
      <DropZone
        accept="application/pdf"
        files={files}
        onFiles={(f) => setFiles(f.slice(0, 1))}
        label="Drop a PDF here"
        hint="Click any page to rotate, or rotate all at once"
        maxSizeMb={50}
      />

      {error && (
        <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {file && thumbs.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-gray-700">{thumbs.length} pages</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => rotateAll(-1)}>
                <RotateCcw className="h-4 w-4 mr-1" /> Rotate all left
              </Button>
              <Button size="sm" variant="outline" onClick={() => rotateAll(1)}>
                <RotateCw className="h-4 w-4 mr-1" /> Rotate all right
              </Button>
              <Button size="sm" variant="ghost" onClick={reset}>
                Reset
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {thumbs.map((t) => {
              const r = rotations[t.index] ?? 0;
              return (
                <div
                  key={t.index}
                  className="relative rounded-xl overflow-hidden border-2 border-gray-200 bg-white"
                >
                  <div className="aspect-[3/4] flex items-center justify-center overflow-hidden bg-gray-50">
                    <img
                      src={t.dataUrl}
                      alt={`Page ${t.index + 1}`}
                      style={{ transform: `rotate(${r}deg)` }}
                      className="max-w-full max-h-full transition-transform duration-300"
                    />
                  </div>
                  <div className="absolute top-1.5 left-1.5 bg-white/90 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-gray-700">
                    {t.index + 1} • {r}°
                  </div>
                  <div className="flex border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => turn(t.index, -1)}
                      className="flex-1 py-1.5 text-xs font-medium text-gray-700 hover:bg-indigo-50 flex items-center justify-center gap-1"
                    >
                      <RotateCcw className="h-3 w-3" /> Left
                    </button>
                    <button
                      type="button"
                      onClick={() => turn(t.index, 1)}
                      className="flex-1 py-1.5 text-xs font-medium text-gray-700 hover:bg-indigo-50 flex items-center justify-center gap-1 border-l border-gray-200"
                    >
                      <RotateCw className="h-3 w-3" /> Right
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button onClick={run} disabled={busy} size="lg">
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <RotateCw className="h-4 w-4 mr-2" /> Apply & Save
                </>
              )}
            </Button>
          </div>

          {outBlob && file && (
            <ToolResult
              blob={outBlob}
              filename={`${file.name.replace(/\.pdf$/i, "")}-rotated.pdf`}
              kind="pdf"
              fromSlug="rotate-pdf"
              subtitle="Page rotations applied"
            />
          )}
        </div>
      )}

      {file && busy && thumbs.length === 0 && (
        <div className="mt-8 flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading pages…
        </div>
      )}
    </ToolLayout>
  );
}
