import { useState } from "react";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTool } from "@/components/tools/tools-data";
import { ToolResult } from "@/components/tools/tool-result";
import { Loader2, Unlock, Eye, EyeOff, ShieldAlert } from "lucide-react";

export default function UnlockPdf() {
  const tool = getTool("unlock-pdf")!;
  const [files, setFiles] = useState<File[]>([]);
  const [pwd, setPwd] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onPick = (f: File[]) => {
    setFiles(f);
    setOut(null);
    setError(null);
  };

  const make = async () => {
    if (!files[0]) return;
    setBusy(true);
    setError(null);
    setOut(null);
    try {
      const { PDFDocument } = await import("@cantoo/pdf-lib");
      const buf = await files[0].arrayBuffer();
      let doc: any;
      try {
        doc = await PDFDocument.load(buf, {
          ignoreEncryption: false,
          password: pwd,
        } as any);
      } catch (e: any) {
        const msg = String(e?.message || e).toLowerCase();
        if (msg.includes("password") || msg.includes("encrypt")) {
          setError(
            pwd
              ? "Wrong password. Please check and try again."
              : "This PDF is password protected — please enter the password.",
          );
          return;
        }
        throw e;
      }
      const bytes = await doc.save();
      setOut(new Blob([bytes], { type: "application/pdf" }));
    } catch (e: any) {
      setError("Could not unlock this PDF: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolLayout tool={tool}>
      <DropZone
        accept="application/pdf"
        files={files}
        onFiles={onPick}
        label="Drop a password-protected PDF"
        hint="PDF • we'll remove the password so it opens freely"
      />

      {files.length > 0 && (
        <div className="mt-5 space-y-4 max-w-md">
          <div>
            <Label className="text-sm font-semibold text-gray-700">PDF password</Label>
            <div className="relative mt-1">
              <Input
                type={show ? "text" : "password"}
                value={pwd}
                onChange={(e) => {
                  setPwd(e.target.value);
                  setOut(null);
                  setError(null);
                }}
                placeholder="Enter the password used to open this PDF"
                className="pr-10"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              Only unlock PDFs that you own or have permission to modify. Everything happens in your
              browser — your file and password never leave your device.
            </div>
          </div>
        </div>
      )}

      <Button
        onClick={make}
        disabled={!files[0] || busy}
        className="mt-5 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-bold"
      >
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Unlock className="h-4 w-4 mr-2" />}
        Unlock PDF
      </Button>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {out && (
        <ToolResult
          blob={out}
          filename={files[0].name.replace(/\.pdf$/i, "") + "-unlocked.pdf"}
          kind="pdf"
          fromSlug="unlock-pdf"
          subtitle="Opens without any password."
          onStartOver={() => {
            setFiles([]);
            setPwd("");
            setOut(null);
            setError(null);
          }}
        />
      )}
    </ToolLayout>
  );
}
