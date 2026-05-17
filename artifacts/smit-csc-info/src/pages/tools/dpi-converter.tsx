import { useEffect, useState } from "react";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTool } from "@/components/tools/tools-data";
import { loadImage, canvasToBlob, setJpegDPI } from "@/lib/tools/canvas";
import { formatBytes } from "@/lib/tools/file";
import { ToolResult } from "@/components/tools/tool-result";
import { Loader2 } from "lucide-react";

const PRESETS = [72, 150, 200, 300, 600];

export default function DpiConverter() {
  const tool = getTool("dpi-converter")!;
  const [files, setFiles] = useState<File[]>([]);
  const [dpi, setDpi] = useState(300);
  const [busy, setBusy] = useState(false);
  const [outBlob, setOutBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!files[0]) {
      setPreviewUrl(null);
      setOutBlob(null);
      return;
    }
    let revoke: string | null = null;
    (async () => {
      setBusy(true);
      const img = await loadImage(files[0]);
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      let blob = await canvasToBlob(canvas, "image/jpeg", 0.95);
      blob = await setJpegDPI(blob, dpi);
      setOutBlob(blob);
      const url = URL.createObjectURL(blob);
      revoke = url;
      setPreviewUrl(url);
      setBusy(false);
    })().catch(() => setBusy(false));
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [files, dpi]);

  return (
    <ToolLayout tool={tool}>
      <DropZone
        accept="image/jpeg,image/png"
        files={files}
        onFiles={setFiles}
        label="Drop your image"
        hint="JPG or PNG"
      />

      {files[0] && (
        <div className="mt-6">
          <div className="text-sm font-semibold text-gray-700 mb-2">Target DPI</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESETS.map((d) => (
              <Button
                key={d}
                variant={dpi === d ? "default" : "outline"}
                size="sm"
                onClick={() => setDpi(d)}
                className={
                  dpi === d
                    ? "bg-gradient-to-r from-indigo-600 to-violet-700 text-white font-bold"
                    : "border-gray-200"
                }
              >
                {d} DPI
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2 max-w-xs">
            <Input
              type="number"
              min={72}
              max={1200}
              value={dpi}
              onChange={(e) => setDpi(Math.max(72, Number(e.target.value) || 300))}
              className="w-32"
            />
            <span className="text-sm text-gray-500">DPI</span>
          </div>
        </div>
      )}

      {previewUrl && (
        <>
          <div className="mt-6 grid sm:grid-cols-[auto_1fr] gap-6 items-start">
            <div className="border-2 border-indigo-100 rounded-xl p-2 bg-white shadow-md w-fit">
              <img
                src={previewUrl}
                alt="Preview"
                className="block max-w-[260px] max-h-[260px] object-contain"
              />
              <div className="text-center text-[11px] text-gray-500 mt-1.5">{dpi} DPI</div>
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <div className="text-gray-500">File size</div>
                <div className="font-semibold text-gray-900">
                  {outBlob ? formatBytes(outBlob.size) : "—"}
                </div>
              </div>
              {busy && (
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Updating…
                </div>
              )}
            </div>
          </div>
          {outBlob && (
            <ToolResult
              blob={outBlob}
              filename={(files[0]?.name.replace(/\.[^.]+$/, "") || "image") + `-${dpi}dpi.jpg`}
              kind="image"
              fromSlug="dpi-converter"
              subtitle={`Set to ${dpi} DPI • ${formatBytes(outBlob.size)}`}
            />
          )}
        </>
      )}
    </ToolLayout>
  );
}
