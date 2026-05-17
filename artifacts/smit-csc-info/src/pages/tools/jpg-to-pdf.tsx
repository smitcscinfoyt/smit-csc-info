import { useState } from "react";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { getTool } from "@/components/tools/tools-data";
import { imagesToPdf } from "@/lib/tools/pdf";
import { ToolResult } from "@/components/tools/tool-result";
import { Loader2 } from "lucide-react";

export default function JpgToPdf() {
  const tool = getTool("jpg-to-pdf")!;
  const [files, setFiles] = useState<File[]>([]);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Blob | null>(null);

  const make = async () => {
    if (files.length === 0) return;
    setBusy(true);
    setOut(null);
    try {
      const blob = await imagesToPdf(files, { orientation });
      setOut(blob);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolLayout tool={tool}>
      <DropZone
        accept="image/jpeg,image/png"
        multiple
        files={files}
        onFiles={(f) => {
          setFiles(f);
          setOut(null);
        }}
        label="Drop one or more images"
        hint="JPG or PNG • each becomes a page"
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
        onClick={make}
        disabled={files.length === 0 || busy}
        className="mt-5 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-bold"
      >
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        Convert to PDF
      </Button>

      {out && (
        <ToolResult
          blob={out}
          filename="converted.pdf"
          kind="pdf"
          fromSlug="jpg-to-pdf"
          subtitle={`${files.length} image${files.length > 1 ? "s" : ""} combined into a PDF`}
        />
      )}
    </ToolLayout>
  );
}
