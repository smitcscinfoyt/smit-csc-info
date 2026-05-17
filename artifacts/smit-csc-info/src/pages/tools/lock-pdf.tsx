import { useState } from "react";
import { ToolLayout } from "@/components/tools/tool-layout";
import { DropZone } from "@/components/tools/drop-zone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTool } from "@/components/tools/tools-data";
import { ToolResult } from "@/components/tools/tool-result";
import { Loader2, Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";

export default function LockPdf() {
  const tool = getTool("lock-pdf")!;
  const [files, setFiles] = useState<File[]>([]);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
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
    if (pwd.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    if (pwd !== pwd2) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    setOut(null);
    try {
      const { PDFDocument } = await import("@cantoo/pdf-lib");
      const buf = await files[0].arrayBuffer();
      const doc: any = await PDFDocument.load(buf, { ignoreEncryption: true });
      doc.encrypt({
        userPassword: pwd,
        ownerPassword: pwd,
        permissions: {
          printing: "highResolution",
          modifying: false,
          copying: false,
          annotating: false,
          fillingForms: true,
          contentAccessibility: true,
          documentAssembly: false,
        },
      });
      const bytes = await doc.save();
      setOut(new Blob([bytes], { type: "application/pdf" }));
    } catch (e: any) {
      setError("Could not lock this PDF: " + (e?.message || e));
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
        label="Drop a PDF file"
        hint="PDF • we'll add a password to open it"
      />

      {files.length > 0 && (
        <div className="mt-5 space-y-4 max-w-md">
          <div>
            <Label className="text-sm font-semibold text-gray-700">New password</Label>
            <div className="relative mt-1">
              <Input
                type={show ? "text" : "password"}
                value={pwd}
                onChange={(e) => {
                  setPwd(e.target.value);
                  setOut(null);
                }}
                placeholder="Enter a strong password"
                className="pr-10"
                autoComplete="new-password"
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

          <div>
            <Label className="text-sm font-semibold text-gray-700">Confirm password</Label>
            <Input
              type={show ? "text" : "password"}
              value={pwd2}
              onChange={(e) => {
                setPwd2(e.target.value);
                setOut(null);
              }}
              placeholder="Re-enter the same password"
              className="mt-1"
              autoComplete="new-password"
            />
          </div>

          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              Save this password somewhere safe. We never store it — if you lose it, the PDF
              cannot be reopened.
            </div>
          </div>
        </div>
      )}

      <Button
        onClick={make}
        disabled={!files[0] || !pwd || !pwd2 || busy}
        className="mt-5 bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-bold"
      >
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
        Lock PDF
      </Button>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {out && (
        <ToolResult
          blob={out}
          filename={files[0].name.replace(/\.pdf$/i, "") + "-locked.pdf"}
          kind="pdf"
          fromSlug="lock-pdf"
          subtitle="Opens only with your password."
          onStartOver={() => {
            setFiles([]);
            setPwd("");
            setPwd2("");
            setOut(null);
            setError(null);
          }}
        />
      )}
    </ToolLayout>
  );
}
