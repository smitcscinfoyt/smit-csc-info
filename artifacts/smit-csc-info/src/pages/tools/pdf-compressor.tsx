import { useState } from "react";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTool } from "@/components/tools/tools-data";
import { compressPdf } from "@/lib/tools/pdf";
import { formatBytes } from "@/lib/tools/file";
import { ToolResult } from "@/components/tools/tool-result";
import { Loader2 } from "lucide-react";

const PRESETS = [50, 100, 200, 500];

export default function PdfCompressor() {
  const tool = getTool("pdf-compressor")!;
  const [files, setFiles] = useState<File[]>([]);
  const [target, setTarget] = useState(100);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compress = async () => {
    if (!files[0]) return;
    setBusy(true);
    setOut(null);
    setError(null);
    try {
      const blob = await compressPdf(files[0], target);
      setOut(blob);
    } catch (e) {
      setError("Could not process this PDF. It may be encrypted or corrupted.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolLayout tool={tool} fullBleed={files.length > 0}>
      <DropZone
        accept="application/pdf"
        files={files}
        onFiles={(f) => {
          setFiles(f);
          setOut(null);
          setError(null);
        }}
        label="Drop your PDF"
        hint="PDF only"
        maxSizeMb={50}
      />

      <div className="mt-6">
        <div className="text-sm font-semibold text-gray-700 mb-2">Target file size (KB)</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESETS.map((kb) => (
            <Button
              key={kb}
              variant={target === kb ? "default" : "outline"}
              size="sm"
              onClick={() => setTarget(kb)}
              className={
                target === kb
                  ? "bg-gradient-to-r from-indigo-600 to-violet-700 text-white font-bold"
                  : "border-gray-200"
              }
            >
              {kb} KB
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 max-w-xs">
          <Input
            type="number"
            min={20}
            max={5000}
            value={target}
            onChange={(e) => setTarget(Math.max(20, Number(e.target.value) || 100))}
            className="w-32"
          />
          <span className="text-sm text-gray-500">KB</span>
        </div>
      </div>

      <Button
        onClick={compress}
        disabled={!files[0] || busy}
        className="mt-5 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-bold"
      >
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        Compress PDF
      </Button>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {out && (
        <ToolResult
          blob={out}
          filename={(files[0]?.name.replace(/\.pdf$/i, "") || "document") + "-compressed.pdf"}
          kind="pdf"
          fromSlug="pdf-compressor"
          subtitle={`${formatBytes(files[0]?.size ?? 0)} → ${formatBytes(out.size)} (${Math.round(
            (1 - out.size / (files[0]?.size || 1)) * 100,
          )}% smaller)`}
        />
      )}
    </ToolLayout>
  );
}
