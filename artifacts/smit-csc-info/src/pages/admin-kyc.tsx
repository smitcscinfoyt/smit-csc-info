import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, ShieldCheck, X, Eye } from "lucide-react";
import { adminListKyc, adminApproveKyc, adminRejectKyc } from "@/lib/recharge-api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function AdminKyc() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [viewing, setViewing] = useState<any>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "kyc", status],
    queryFn: () => adminListKyc(status || undefined),
  });
  const approveMutation = useMutation({
    mutationFn: (id: string) => adminApproveKyc(id),
    onSuccess: () => { toast({ title: "Approved" }); qc.invalidateQueries({ queryKey: ["admin", "kyc"] }); setViewing(null); },
  });
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminRejectKyc(id, reason),
    onSuccess: () => { toast({ title: "Rejected" }); setRejecting(null); setReason(""); qc.invalidateQueries({ queryKey: ["admin", "kyc"] }); setViewing(null); },
  });

  return (
    <div className="flex-1 py-8 px-4 bg-gray-50">
      <div className="container mx-auto max-w-5xl space-y-4">
        <Link href="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Admin</Button></Link>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />KYC Review</CardTitle>
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /> :
              !data || data.items.length === 0 ? <div className="text-center py-8 text-muted-foreground">No records</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 text-left"><tr>
                      <th className="p-2">Name</th><th className="p-2">User</th><th className="p-2">PAN</th>
                      <th className="p-2">Aadhaar*</th><th className="p-2">Method</th><th className="p-2">Status</th><th className="p-2">Submitted</th><th className="p-2">Actions</th>
                    </tr></thead>
                    <tbody>
                      {data.items.map((k) => (
                        <tr key={k.id} className="border-b" data-testid={`kyc-${k.id}`}>
                          <td className="p-2 font-semibold">{k.fullName}</td>
                          <td className="p-2 text-xs">{k.user?.email}<br />{k.user?.mobile}</td>
                          <td className="p-2 font-mono">{k.panNumber}</td>
                          <td className="p-2 font-mono">XXXX{k.aadhaarLast4}</td>
                          <td className="p-2"><Badge variant={k.kycMethod === "digital" ? "outline" : "secondary"} className={k.kycMethod === "digital" ? "text-purple-700 border-purple-300" : ""}>{k.kycMethod === "digital" ? "Digital" : "Manual"}</Badge></td>
                          <td className="p-2"><Badge variant={k.status === "approved" ? "default" : k.status === "rejected" ? "destructive" : "secondary"}>{k.status}</Badge></td>
                          <td className="p-2 text-xs whitespace-nowrap">{format(new Date(k.createdAt), "dd MMM HH:mm")}</td>
                          <td className="p-2"><Button size="sm" variant="outline" onClick={() => setViewing(k)}><Eye className="h-4 w-4 mr-1" />Review</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>KYC Documents — {viewing?.fullName}</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><b>PAN:</b> {viewing.panNumber}</div>
                <div><b>Aadhaar last 4:</b> XXXX{viewing.aadhaarLast4}</div>
                <div><b>Email:</b> {viewing.user?.email}</div>
                <div><b>Mobile:</b> {viewing.user?.mobile}</div>
                <div><b>Method:</b> <Badge variant={viewing.kycMethod === "digital" ? "outline" : "secondary"} className={viewing.kycMethod === "digital" ? "text-purple-700 border-purple-300" : ""}>{viewing.kycMethod === "digital" ? "Digital KYC" : "Manual KYC"}</Badge></div>
                {viewing.ocrConfidence && <div><b>OCR Confidence:</b> {viewing.ocrConfidence}</div>}
              </div>
              {viewing.kycMethod === "digital" && (viewing.ocrPanExtracted || viewing.ocrNameExtracted || viewing.ocrAadhaarExtracted) && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-1 text-sm">
                  <div className="font-semibold text-purple-800 mb-1">OCR Verification Results</div>
                  {viewing.ocrPanExtracted && <div><b>PAN Detected:</b> <span className="font-mono">{viewing.ocrPanExtracted}</span> {viewing.ocrPanExtracted === viewing.panNumber ? <span className="text-green-600 font-semibold">Match</span> : <span className="text-red-600 font-semibold">Mismatch</span>}</div>}
                  {viewing.ocrNameExtracted && <div><b>Name Detected:</b> {viewing.ocrNameExtracted}</div>}
                  {viewing.ocrAadhaarExtracted && <div><b>Aadhaar Last 4 Detected:</b> <span className="font-mono">{viewing.ocrAadhaarExtracted}</span> {viewing.ocrAadhaarExtracted === viewing.aadhaarLast4 ? <span className="text-green-600 font-semibold">Match</span> : <span className="text-red-600 font-semibold">Mismatch</span>}</div>}
                </div>
              )}
              <DocImg label="PAN Card" path={viewing.panImagePath} />
              <DocImg label="Aadhaar Front" path={viewing.aadhaarFrontPath} />
              <DocImg label="Aadhaar Back" path={viewing.aadhaarBackPath} />
              {viewing.selfiePath && <DocImg label="Selfie" path={viewing.selfiePath} />}
              {viewing.status === "pending" && (
                <DialogFooter className="gap-2">
                  <Button variant="destructive" onClick={() => setRejecting(viewing.id)} data-testid="btn-reject"><X className="h-4 w-4 mr-2" />Reject</Button>
                  <Button onClick={() => approveMutation.mutate(viewing.id)} disabled={approveMutation.isPending} data-testid="btn-approve">
                    {approveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}<ShieldCheck className="h-4 w-4 mr-2" />Approve
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejecting} onOpenChange={(v) => !v && setRejecting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject KYC</DialogTitle></DialogHeader>
          <Textarea placeholder="Reason for rejection (shown to user)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!reason || rejectMutation.isPending} onClick={() => rejecting && rejectMutation.mutate({ id: rejecting, reason })}>
              {rejectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocImg({ label, path }: { label: string; path: string }) {
  const url = path?.startsWith("/") ? path : `/${path || ""}`;
  return (
    <div>
      <div className="font-semibold mb-1">{label}</div>
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img src={url} alt={label} className="max-w-full max-h-72 border rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      </a>
      <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">Open original</a>
    </div>
  );
}
