import { useEffect, useState } from "react";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { getTool } from "@/components/tools/tools-data";
import {
  loadImage,
  drawContainFit,
  canvasToBlob,
  setJpegDPI,
  CM_TO_PX_300,
} from "@/lib/tools/canvas";
import { formatBytes } from "@/lib/tools/file";
import { ToolResult } from "@/components/tools/tool-result";
import { Loader2 } from "lucide-react";

const TARGET_W = CM_TO_PX_300(4.5);
const TARGET_H = CM_TO_PX_300(2);

export default function SignatureResizer() {
  const tool = getTool("signature-resizer")!;
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [outBlob, setOutBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);

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
      const canvas = drawContainFit(img, TARGET_W, TARGET_H, "#ffffff");
      let blob = await canvasToBlob(canvas, "image/jpeg", 0.95);
      blob = await setJpegDPI(blob, 300);
      setOutBlob(blob);
      const url = URL.createObjectURL(blob);
      revoke = url;
      setPreviewUrl(url);
      setBusy(false);
    })().catch(() => setBusy(false));
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [files]);

  return (
    <ToolLayout tool={tool}>
      <DropZone
        accept="image/jpeg,image/png"
        files={files}
        onFiles={setFiles}
        label="Drop your signature image"
        hint="JPG or PNG • will be sized to 2 × 4.5 cm"
      />

      {previewUrl && (
        <>
          <div className="mt-6 grid sm:grid-cols-[auto_1fr] gap-6 items-start">
            <div className="border-2 border-indigo-100 rounded-xl p-2 bg-white shadow-md w-fit">
              <img
                src={previewUrl}
                alt="Preview"
                className="block"
                style={{ width: 360, height: 160 }}
              />
              <div className="text-center text-[11px] text-gray-500 mt-1.5">
                4.5 × 2 cm @ 300 DPI
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <div className="text-gray-500">Output size</div>
                <div className="font-semibold text-gray-900">
                  {TARGET_W} × {TARGET_H} px
                </div>
              </div>
              <div>
                <div className="text-gray-500">File size</div>
                <div className="font-semibold text-gray-900">
                  {outBlob ? formatBytes(outBlob.size) : "—"}
                </div>
              </div>
              {busy && (
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Processing…
                </div>
              )}
            </div>
          </div>
          {outBlob && (
            <ToolResult
              blob={outBlob}
              filename="signature.jpg"
              kind="image"
              fromSlug="signature-resizer"
              subtitle={`4.5 × 2 cm @ 300 DPI • ${formatBytes(outBlob.size)}`}
            />
          )}
        </>
      )}
    </ToolLayout>
  );
}
