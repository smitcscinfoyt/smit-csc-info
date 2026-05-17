import { useEffect, useState } from "react";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { getTool } from "@/components/tools/tools-data";
import { applyWatermark, renderThumbnails, type PageThumb } from "@/lib/tools/pdf-tools";
import { ToolResult } from "@/components/tools/tool-result";
import { usePrimeDownloadGate } from "@/hooks/use-prime-download-gate";
import { useAutoResumeDownload } from "@/hooks/use-auto-resume-download";
import { downloadBlob } from "@/lib/tools/file";
import { Loader2, Stamp } from "lucide-react";

type PagesScope = "all" | "odd" | "even" | "first" | "last";

const PRESETS = [
  { label: "VERIFIED BY SMIT CSC", color: "#dc2626" },
  { label: "DRAFT", color: "#94a3b8" },
  { label: "CONFIDENTIAL", color: "#1e40af" },
  { label: "CSC OPERATOR COPY", color: "#7c3aed" },
];

function hexToRgb(hex: string) {
  const m = hex.replace("#", "");
  const v = parseInt(m, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

export default function WatermarkPdfPage() {
  const tool = getTool("watermark-pdf")!;
  const { requirePrime, modal: primeGateModal } = usePrimeDownloadGate({
    toolId: "watermark-pdf",
    toolTitle: tool.title,
    actionLabel: "Download",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [thumbs, setThumbs] = useState<PageThumb[]>([]);
  const [text, setText] = useState("VERIFIED BY SMIT CSC");
  const [color, setColor] = useState("#dc2626");
  const [fontSize, setFontSize] = useState(60);
  const [opacity, setOpacity] = useState(0.25);
  const [rotation, setRotation] = useState(-30);
  const [scope, setScope] = useState<PagesScope>("all");
  const [busy, setBusy] = useState(false);
  const [outBlob, setOutBlob] = useState<Blob | null>(null);
  const firstFile = files[0];
  useAutoResumeDownload({
    toolId: "watermark-pdf",
    ready: !!outBlob && !!firstFile,
    run: () => {
      if (outBlob && firstFile) {
        downloadBlob(outBlob, `${firstFile.name.replace(/\.pdf$/i, "")}-watermarked.pdf`);
      }
    },
  });
  const [error, setError] = useState<string | null>(null);

  const file = files[0];

  useEffect(() => {
    setOutBlob(null);
    setError(null);
    setThumbs([]);
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await renderThumbnails(file, 280);
        if (!cancelled) setThumbs(t.slice(0, 1)); // just preview first page
      } catch {
        if (!cancelled) setError("Could not read this PDF.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const run = async () => {
    if (!file) return;
    if (!text.trim()) {
      setError("Watermark text cannot be empty.");
      return;
    }
    setBusy(true);
    setOutBlob(null);
    setError(null);
    try {
      const blob = await applyWatermark(file, {
        text: text.trim(),
        fontSize,
        opacity,
        rotationDeg: rotation,
        color: hexToRgb(color),
        pages: scope,
      });
      setOutBlob(blob);
    } catch {
      setError("Failed to apply watermark.");
    } finally {
      setBusy(false);
    }
  };

  const previewSrc = thumbs[0]?.dataUrl;
  const previewW = thumbs[0]?.width ?? 280;
  const previewH = thumbs[0]?.height ?? 396;

  return (
    <ToolLayout tool={tool} fullBleed={files.length > 0}>
      <DropZone
        accept="application/pdf"
        files={files}
        onFiles={(f) => setFiles(f.slice(0, 1))}
        label="Drop a PDF to watermark"
        hint="Add CSC stamp, DRAFT, or any custom text"
        maxSizeMb={50}
      />

      {error && (
        <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {file && (
        <div className="mt-6 grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2 block">
                Watermark Text
              </label>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setText(p.label);
                      setColor(p.color);
                    }}
                    className="text-[11px] font-semibold rounded-md border border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 px-2 py-1"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-1 block">
                  Color
                </label>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  disabled={busy}
                  className="w-full h-10 rounded-lg border border-gray-300 cursor-pointer"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-1 block">
                  Apply to
                </label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as PagesScope)}
                  disabled={busy}
                  className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm bg-white"
                >
                  <option value="all">All pages</option>
                  <option value="odd">Odd pages</option>
                  <option value="even">Even pages</option>
                  <option value="first">First page only</option>
                  <option value="last">Last page only</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-bold uppercase tracking-wider text-gray-600">Font size</span>
                <span className="font-mono text-gray-700">{fontSize}pt</span>
              </div>
              <input
                type="range"
                min={20}
                max={140}
                step={2}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                disabled={busy}
                className="w-full accent-indigo-500"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-bold uppercase tracking-wider text-gray-600">Opacity</span>
                <span className="font-mono text-gray-700">{opacity.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                disabled={busy}
                className="w-full accent-indigo-500"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-bold uppercase tracking-wider text-gray-600">Rotation</span>
                <span className="font-mono text-gray-700">{rotation}°</span>
              </div>
              <input
                type="range"
                min={-90}
                max={90}
                step={5}
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
                disabled={busy}
                className="w-full accent-indigo-500"
              />
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button onClick={run} disabled={busy} size="lg">
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Applying…
                  </>
                ) : (
                  <>
                    <Stamp className="h-4 w-4 mr-2" /> Apply Watermark
                  </>
                )}
              </Button>
            </div>

            {outBlob && file && (
              <ToolResult
                blob={outBlob}
                filename={`${file.name.replace(/\.pdf$/i, "")}-watermarked.pdf`}
                kind="pdf"
                fromSlug="watermark-pdf"
                subtitle={`Watermark "${text}" applied`}
                requirePrime={requirePrime}
              />
            )}
            {primeGateModal}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-600">
              Live Preview (page 1)
            </div>
            <div
              className="relative rounded-xl border-2 border-gray-200 bg-white overflow-hidden mx-auto"
              style={{ maxWidth: 320 }}
            >
              {previewSrc ? (
                <>
                  <img src={previewSrc} alt="Page 1" className="w-full h-auto block" />
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    aria-hidden
                  >
                    <span
                      style={{
                        color,
                        opacity,
                        fontSize: `${(fontSize / 595) * (previewW || 280)}px`,
                        transform: `rotate(${rotation}deg)`,
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                        fontFamily: "Helvetica, Arial, sans-serif",
                      }}
                    >
                      {text || " "}
                    </span>
                  </div>
                </>
              ) : (
                <div className="aspect-[3/4] flex items-center justify-center text-xs text-gray-400">
                  Loading preview…
                </div>
              )}
            </div>
            <p className="text-[11px] text-gray-500 text-center">
              Preview is approximate — final PDF will be exact.
            </p>
          </div>
        </div>
      )}
    </ToolLayout>
  );
}
