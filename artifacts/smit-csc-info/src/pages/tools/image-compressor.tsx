import { useEffect, useState } from "react";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTool } from "@/components/tools/tools-data";
import { loadImage, compressToTargetKB } from "@/lib/tools/canvas";
import { formatBytes } from "@/lib/tools/file";
import { ToolResult } from "@/components/tools/tool-result";
import { Loader2 } from "lucide-react";

const PRESETS = [10, 20, 50, 100, 200, 500];

export default function ImageCompressor() {
  const tool = getTool("image-compressor")!;
  const [files, setFiles] = useState<File[]>([]);
  const [target, setTarget] = useState(50);
  const [busy, setBusy] = useState(false);
  const [outBlob, setOutBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ q: number; w: number; h: number } | null>(null);

  useEffect(() => {
    if (!files[0]) {
      setPreviewUrl(null);
      setOutBlob(null);
      setMeta(null);
      return;
    }
    let revoke: string | null = null;
    (async () => {
      setBusy(true);
      const img = await loadImage(files[0]);
      const { blob, quality, width, height } = await compressToTargetKB(img, target);
      setOutBlob(blob);
      setMeta({ q: quality, w: width, h: height });
      const url = URL.createObjectURL(blob);
      revoke = url;
      setPreviewUrl(url);
      setBusy(false);
    })().catch(() => setBusy(false));
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [files, target]);

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
              min={5}
              max={5000}
              value={target}
              onChange={(e) => setTarget(Math.max(5, Number(e.target.value) || 50))}
              className="w-32"
            />
            <span className="text-sm text-gray-500">KB</span>
          </div>
        </div>
      )}

      {previewUrl && outBlob && meta && (
        <>
          <div className="mt-6 grid sm:grid-cols-[auto_1fr] gap-6 items-start">
            <div className="border-2 border-indigo-100 rounded-xl p-2 bg-white shadow-md w-fit">
              <img
                src={previewUrl}
                alt="Preview"
                className="block max-w-[260px] max-h-[260px] object-contain"
              />
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <div className="text-gray-500">Compressed size</div>
                <div className="font-semibold text-gray-900">{formatBytes(outBlob.size)}</div>
              </div>
              <div>
                <div className="text-gray-500">Dimensions</div>
                <div className="font-semibold text-gray-900">
                  {meta.w} × {meta.h} px
                </div>
              </div>
              <div>
                <div className="text-gray-500">Original</div>
                <div className="font-semibold text-gray-900">{formatBytes(files[0].size)}</div>
              </div>
              {busy && (
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Optimising…
                </div>
              )}
            </div>
          </div>
          <ToolResult
            blob={outBlob}
            filename={(files[0]?.name.replace(/\.[^.]+$/, "") || "image") + "-compressed.jpg"}
            kind="image"
            fromSlug="image-compressor"
            subtitle={`${formatBytes(files[0].size)} → ${formatBytes(outBlob.size)} • ${meta.w}×${meta.h}`}
          />
        </>
      )}
    </ToolLayout>
  );
}
