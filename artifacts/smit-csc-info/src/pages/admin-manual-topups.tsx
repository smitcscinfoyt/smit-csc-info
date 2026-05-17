import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Check, X, ExternalLink } from "lucide-react";
import {
  adminListManualTopups, adminApproveManualTopup, adminRejectManualTopup,
  formatINR, type ManualTopupAdminItem,
} from "@/lib/recharge-api";
import { useToast } from "@/hooks/use-toast";

export default function AdminManualTopups() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"awaiting_review" | "success" | "rejected">("awaiting_review");
  const [rejectTarget, setRejectTarget] = useState<ManualTopupAdminItem | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "manual-topups", tab],
    queryFn: () => adminListManualTopups(tab),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => adminApproveManualTopup(id),
    onSuccess: () => {
      toast({ title: "Approved", description: "Credited to wallet" });
      qc.invalidateQueries({ queryKey: ["admin", "manual-topups"] });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e?.data?.error }),
  });

  const rejectMutation = useMutation({
    mutationFn: () => adminRejectManualTopup(rejectTarget!.id, reason.trim() || "Rejected"),
    onSuccess: () => {
      toast({ title: "Rejected" });
      setRejectTarget(null); setReason("");
      qc.invalidateQueries({ queryKey: ["admin", "manual-topups"] });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e?.data?.error }),
  });

  return (
    <div className="flex-1 py-8 px-4 bg-gray-50">
      <div className="container mx-auto max-w-6xl space-y-4">
        <Link href="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Admin</Button></Link>
        <Card>
          <CardHeader>
            <CardTitle>Manual Wallet Top-ups</CardTitle>
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mt-3">
              <TabsList>
                <TabsTrigger value="awaiting_review" data-testid="tab-pending">Pending</TabsTrigger>
                <TabsTrigger value="success" data-testid="tab-approved">Approved</TabsTrigger>
                <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /> :
              !data || data.items.length === 0 ? <div className="text-center py-12 text-muted-foreground">No entries</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 text-left"><tr>
                      <th className="p-2">Date</th>
                      <th className="p-2">User</th>
                      <th className="p-2">Channel</th>
                      <th className="p-2 text-right">Amount</th>
                      <th className="p-2">UTR</th>
                      <th className="p-2">Proof</th>
                      <th className="p-2">Note</th>
                      {tab === "awaiting_review" && <th className="p-2">Actions</th>}
                      {tab !== "awaiting_review" && <th className="p-2">Admin Note</th>}
                    </tr></thead>
                    <tbody>
                      {data.items.map((r) => (
                        <tr key={r.id} className="border-b align-top" data-testid={`row-${r.id}`}>
                          <td className="p-2 whitespace-nowrap">{new Date(r.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</td>
                          <td className="p-2">
                            <div className="font-medium">{r.userName || "—"}</div>
                            <div className="text-xs text-muted-foreground">{r.userMobile || r.userEmail}</div>
                          </td>
                          <td className="p-2"><Badge variant="outline">{r.channel?.toUpperCase() || r.method}</Badge></td>
                          <td className="p-2 text-right font-bold">{formatINR(r.amountPaise)}</td>
                          <td className="p-2 font-mono text-xs">{r.utr}</td>
                          <td className="p-2">
                            {r.proofUrl ? (
                              <a href={r.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                                View <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : "—"}
                          </td>
                          <td className="p-2 max-w-[200px] text-xs">{r.userNote || "—"}</td>
                          {tab === "awaiting_review" ? (
                            <td className="p-2 flex gap-1">
                              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(r.id)} data-testid={`btn-approve-${r.id}`}>
                                <Check className="h-4 w-4 mr-1" />Approve
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => { setRejectTarget(r); setReason(""); }} data-testid={`btn-reject-${r.id}`}>
                                <X className="h-4 w-4 mr-1" />Reject
                              </Button>
                            </td>
                          ) : (
                            <td className="p-2 text-xs">{r.adminNote || "—"}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject top-up #{rejectTarget?.id}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="text-sm">Amount: <b>{rejectTarget && formatINR(rejectTarget.amountPaise)}</b></div>
            <div className="text-sm">UTR: <span className="font-mono">{rejectTarget?.utr}</span></div>
            <Textarea placeholder="Reason for rejection (UTR not found, duplicate, wrong amount...)" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} data-testid="input-reject-reason" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setReason(""); }}>Cancel</Button>
            <Button variant="destructive" disabled={rejectMutation.isPending} onClick={() => rejectMutation.mutate()} data-testid="btn-confirm-reject">
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
