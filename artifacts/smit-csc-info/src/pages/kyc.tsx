import { useEffect, useState, useRef } from "react";
import { useDraftAutosave } from "@/hooks/use-draft-autosave";
import { loadDraft, clearDraft } from "@/lib/draft-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, ShieldCheck, Loader2, Upload, CheckCircle2, XCircle, Clock, AlertCircle, Scan, FileText, Zap } from "lucide-react";
import { getMyKyc, submitKyc, submitDigitalKyc, uploadFileToStorage } from "@/lib/recharge-api";
import type { DigitalKycResponse } from "@/lib/recharge-api";
import { useToast } from "@/hooks/use-toast";

interface FileSlotProps { label: string; path: string; uploading: boolean; onUpload: (f: File) => void; }
function FileSlot({ label, path, uploading, onUpload }: FileSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading} data-testid={`upload-${label}`}>
          {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}{path ? "Change" : "Choose"}
        </Button>
        {path && <CheckCircle2 className="h-5 w-5 text-green-600" />}
      </div>
    </div>
  );
}

export default function KycPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: existing, isLoading } = useQuery({ queryKey: ["kyc", "me"], queryFn: getMyKyc });

  const [tab, setTab] = useState<"manual" | "digital">("digital");
  const [fullName, setFullName] = useState("");
  const [pan, setPan] = useState("");
  const [aadhaarLast4, setAadhaarLast4] = useState("");
  const [paths, setPaths] = useState({ panImagePath: "", aadhaarFrontPath: "", aadhaarBackPath: "", selfiePath: "" });
  const [uploading, setUploading] = useState<string | null>(null);
  const [digitalResult, setDigitalResult] = useState<DigitalKycResponse["ocrResult"] | null>(null);

  // ── Draft autosave ──────────────────────────────────────────
  // KYC has 4 file uploads + 3 text fields. Mobile users frequently
  // background the tab to switch to the camera/gallery; this restores
  // their progress (text + already-uploaded paths) on return.
  const DRAFT_KEY = "kyc:form";
  useEffect(() => {
    const d = loadDraft<{
      tab: "manual" | "digital";
      fullName: string;
      pan: string;
      aadhaarLast4: string;
      paths: typeof paths;
    }>(DRAFT_KEY);
    if (d) {
      if (d.tab) setTab(d.tab);
      if (d.fullName) setFullName(d.fullName);
      if (d.pan) setPan(d.pan);
      if (d.aadhaarLast4) setAadhaarLast4(d.aadhaarLast4);
      if (d.paths) setPaths(d.paths);
    }
  }, []);
  useDraftAutosave(DRAFT_KEY, { tab, fullName, pan, aadhaarLast4, paths });

  const submitMutation = useMutation({
    mutationFn: () => submitKyc({ fullName, panNumber: pan.toUpperCase(), aadhaarLast4, ...paths, selfiePath: paths.selfiePath || undefined }),
    onSuccess: () => {
      toast({ title: "KYC Submitted", description: "Your KYC has been sent for admin review" });
      clearDraft(DRAFT_KEY);
      qc.invalidateQueries({ queryKey: ["kyc", "me"] });
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err?.data?.error || "Submit failed" }),
  });

  const digitalMutation = useMutation({
    mutationFn: () => submitDigitalKyc({ fullName, panNumber: pan.toUpperCase(), aadhaarLast4, ...paths, selfiePath: paths.selfiePath || undefined }),
    onSuccess: (data) => {
      setDigitalResult(data.ocrResult ?? null);
      if (data.ocrResult?.verified) {
        toast({ title: "KYC Verified!", description: "Your identity has been verified automatically" });
        clearDraft(DRAFT_KEY);
      } else {
        toast({ variant: "destructive", title: "Verification Failed", description: "Document verification failed. Please check the details below." });
      }
      qc.invalidateQueries({ queryKey: ["kyc", "me"] });
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err?.data?.error || "Digital verification failed" }),
  });

  const handleUpload = async (slot: keyof typeof paths, file: File) => {
    setUploading(slot);
    try {
      const path = await uploadFileToStorage(file);
      setPaths((p) => ({ ...p, [slot]: path }));
      toast({ title: "Upload successful" });
    } catch {
      toast({ variant: "destructive", title: "Upload failed" });
    } finally {
      setUploading(null);
    }
  };

  const canSubmit = fullName && /^[A-Z]{5}\d{4}[A-Z]$/.test(pan.toUpperCase()) && /^\d{4}$/.test(aadhaarLast4) && paths.panImagePath && paths.aadhaarFrontPath && paths.aadhaarBackPath;

  if (isLoading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex-1 py-8 px-4 bg-gray-50">
      <div className="container mx-auto max-w-xl">
        <Link href="/wallet"><Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="h-4 w-4 mr-2" />Wallet</Button></Link>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />KYC Verification</CardTitle>
            <CardDescription>Complete KYC to increase wallet limit up to ₹50,000</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {existing && (
              <Alert className={existing.status === "approved" ? "border-green-300 bg-green-50" : existing.status === "rejected" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}>
                {existing.status === "approved" ? <CheckCircle2 className="h-4 w-4" /> : existing.status === "rejected" ? <XCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                <AlertDescription>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="mr-1">
                      {existing.status === "approved" ? "Approved" : existing.status === "rejected" ? "Rejected" : "Under Review"}
                    </Badge>
                    {existing.kycMethod === "digital" && <Badge variant="outline" className="text-purple-700 border-purple-300">Digital KYC</Badge>}
                    {existing.kycMethod === "manual" && <Badge variant="outline" className="text-blue-700 border-blue-300">Manual KYC</Badge>}
                  </div>
                  <div className="mt-1">
                    {existing.status === "approved" && "Your KYC has been verified successfully"}
                    {existing.status === "pending" && "Your KYC is under review (24-48 hours)"}
                    {existing.status === "rejected" && (<>Rejection reason: {existing.rejectionReason || "---"}. You may re-apply.</>)}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {(!existing || existing.status === "rejected") && (
              <>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium transition-colors ${tab === "digital" ? "bg-primary text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
                    onClick={() => { setTab("digital"); setDigitalResult(null); }}
                    data-testid="tab-digital"
                  >
                    <Zap className="h-4 w-4" />Digital KYC
                  </button>
                  <button
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium transition-colors ${tab === "manual" ? "bg-primary text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
                    onClick={() => { setTab("manual"); setDigitalResult(null); }}
                    data-testid="tab-manual"
                  >
                    <FileText className="h-4 w-4" />Manual KYC
                  </button>
                </div>

                {tab === "digital" && (
                  <Alert className="border-purple-200 bg-purple-50">
                    <Scan className="h-4 w-4 text-purple-600" />
                    <AlertDescription className="text-purple-800">
                      <strong>Instant Verification:</strong> Upload your documents and get verified automatically using OCR technology. No waiting for admin approval!
                    </AlertDescription>
                  </Alert>
                )}
                {tab === "manual" && (
                  <Alert className="border-blue-200 bg-blue-50">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800">
                      <strong>Manual Review:</strong> Submit your documents for admin review. Verification takes 24-48 hours.
                    </AlertDescription>
                  </Alert>
                )}

                <div><Label>Full Name (as per PAN)</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" data-testid="input-name" /></div>
                <div><Label>PAN Number</Label><Input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} data-testid="input-pan" /></div>
                <div><Label>Aadhaar Last 4 Digits</Label><Input value={aadhaarLast4} onChange={(e) => setAadhaarLast4(e.target.value.replace(/\D/g, ""))} placeholder="1234" maxLength={4} data-testid="input-aadhaar4" /></div>
                <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>All documents must be clear and readable</AlertDescription></Alert>
                <FileSlot label="PAN Card Photo" path={paths.panImagePath} uploading={uploading === "panImagePath"} onUpload={(f) => handleUpload("panImagePath", f)} />
                <FileSlot label="Aadhaar Front" path={paths.aadhaarFrontPath} uploading={uploading === "aadhaarFrontPath"} onUpload={(f) => handleUpload("aadhaarFrontPath", f)} />
                <FileSlot label="Aadhaar Back" path={paths.aadhaarBackPath} uploading={uploading === "aadhaarBackPath"} onUpload={(f) => handleUpload("aadhaarBackPath", f)} />
                <FileSlot label="Selfie (optional)" path={paths.selfiePath} uploading={uploading === "selfiePath"} onUpload={(f) => handleUpload("selfiePath", f)} />

                {tab === "digital" ? (
                  <Button
                    className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white h-12 font-semibold"
                    disabled={!canSubmit || digitalMutation.isPending}
                    onClick={() => digitalMutation.mutate()}
                    data-testid="btn-submit-digital-kyc"
                  >
                    {digitalMutation.isPending ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Verifying Documents...</> : <><Scan className="h-5 w-5 mr-2" />Verify & Submit (Instant)</>}
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-primary text-white h-12 font-semibold"
                    disabled={!canSubmit || submitMutation.isPending}
                    onClick={() => submitMutation.mutate()}
                    data-testid="btn-submit-kyc"
                  >
                    {submitMutation.isPending ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Submitting...</> : "Submit KYC (Manual Review)"}
                  </Button>
                )}

                {digitalResult && (
                  <Card className={`mt-4 ${digitalResult.verified ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-center gap-2">
                        {digitalResult.verified ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
                        <span className="font-semibold text-lg">{digitalResult.verified ? "Verification Successful!" : "Verification Failed"}</span>
                      </div>

                      <div className="grid grid-cols-1 gap-2 text-sm">
                        <div className="flex justify-between items-center p-2 bg-white/60 rounded">
                          <span className="text-gray-600">PAN Detected:</span>
                          <span className="font-mono font-semibold">{digitalResult.panExtracted || "Not found"}</span>
                        </div>
                        <div className="flex justify-between items-center p-2 bg-white/60 rounded">
                          <span className="text-gray-600">Name Detected:</span>
                          <span className="font-semibold">{digitalResult.nameExtracted || "Not found"}</span>
                        </div>
                        <div className="flex justify-between items-center p-2 bg-white/60 rounded">
                          <span className="text-gray-600">Aadhaar Last 4:</span>
                          <span className="font-mono font-semibold">{digitalResult.aadhaarLast4Extracted || "Not found"}</span>
                        </div>
                      </div>

                      {digitalResult.mismatches.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-sm font-semibold text-red-700">Issues found:</span>
                          {digitalResult.mismatches.map((m, i) => (
                            <div key={i} className="text-sm text-red-600 flex items-start gap-1">
                              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                              <span>{m}</span>
                            </div>
                          ))}
                          <p className="text-sm text-gray-600 mt-2">
                            You can fix the issues and try Digital KYC again, or switch to Manual KYC for admin review.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
