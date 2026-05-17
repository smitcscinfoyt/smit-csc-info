import { useState } from "react";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { getTool } from "@/components/tools/tools-data";
import { aadhaarMergePdf, aadhaarMergeJpg } from "@/lib/tools/pdf";
import { ToolResult } from "@/components/tools/tool-result";
import { Loader2, FileImage } from "lucide-react";

export default function AadhaarMerger() {
  const tool = getTool("aadhaar-merger")!;
  const [front, setFront] = useState<File[]>([]);
  const [back, setBack] = useState<File[]>([]);
  const [busy, setBusy] = useState<"pdf" | "jpg" | null>(null);
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null);

  const ready = front.length === 1 && back.length === 1;

  const make = async (kind: "pdf" | "jpg") => {
    if (!ready) return;
    setBusy(kind);
    setResult(null);
    try {
      const blob =
        kind === "pdf"
          ? await aadhaarMergePdf(front[0], back[0])
          : await aadhaarMergeJpg(front[0], back[0]);
      setResult({ blob, name: kind === "pdf" ? "aadhaar-merged.pdf" : "aadhaar-merged.jpg" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <ToolLayout tool={tool} fullBleed={front.length > 0 || back.length > 0}>
      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-2">Front side</div>
          <DropZone
            accept="image/jpeg,image/png"
            files={front}
            onFiles={setFront}
            label="Drop Aadhaar front"
            hint="JPG or PNG"
          />
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-2">Back side</div>
          <DropZone
            accept="image/jpeg,image/png"
            files={back}
            onFiles={setBack}
            label="Drop Aadhaar back"
            hint="JPG or PNG"
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          onClick={() => make("pdf")}
          disabled={!ready || busy !== null}
          className="bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-bold"
        >
          {busy === "pdf" ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileImage className="h-4 w-4 mr-2" />
          )}
          Merge to PDF
        </Button>
        <Button
          variant="outline"
          onClick={() => make("jpg")}
          disabled={!ready || busy !== null}
          className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold"
        >
          {busy === "jpg" ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileImage className="h-4 w-4 mr-2" />
          )}
          Merge to JPG
        </Button>
      </div>

      {result && (
        <ToolResult
          blob={result.blob}
          filename={result.name}
          kind={result.name.endsWith(".pdf") ? "pdf" : "image"}
          fromSlug="aadhaar-merger"
          subtitle="Aadhaar front and back combined"
        />
      )}
    </ToolLayout>
  );
}
