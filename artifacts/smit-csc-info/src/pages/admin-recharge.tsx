import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, RefreshCw, Search, Eye } from "lucide-react";
import { adminListRecharges, adminRefundRecharge, formatINR, type RechargeStatus } from "@/lib/recharge-api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const STATUS_COLORS: Record<RechargeStatus, string> = {
  success: "bg-green-100 text-green-800", pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800", failed: "bg-red-100 text-red-800", refunded: "bg-gray-100 text-gray-800",
};

export default function AdminRecharge() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [refundTarget, setRefundTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "recharges", status, type, q],
    queryFn: () => adminListRecharges({ status: status || undefined, type: type || undefined, q: q || undefined, limit: 100 }),
  });

  const refundMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminRefundRecharge(id, reason),
    onSuccess: () => {
      toast({ title: "Refunded" });
      setRefundTarget(null); setReason("");
      qc.invalidateQueries({ queryKey: ["admin", "recharges"] });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e?.data?.error }),
  });

  return (
    <div className="flex-1 py-8 px-4 bg-gray-50">
      <div className="container mx-auto max-w-6xl space-y-4">
        <Link href="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Admin</Button></Link>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <CardTitle>Recharge Transactions</CardTitle>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input placeholder="Search number, email, txn ID" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
              </div>
              <Select value={type || "all"} onValueChange={(v) => setType(v === "all" ? "" : v)}>
                <SelectTrigger className="w-32"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All types</SelectItem><SelectItem value="mobile">Mobile</SelectItem><SelectItem value="dth">DTH</SelectItem><SelectItem value="bill">Bill</SelectItem></SelectContent>
              </Select>
              <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem><SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem><SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div> :
              !data || data.items.length === 0 ? <div className="text-center py-12 text-muted-foreground">No recharges</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 text-left"><tr>
                      <th className="p-2">Type</th><th className="p-2">User</th><th className="p-2">Operator</th><th className="p-2">Number</th>
                      <th className="p-2 text-right">Amount</th><th className="p-2">Status</th><th className="p-2">Time</th><th className="p-2">Action</th>
                    </tr></thead>
                    <tbody>
                      {data.items.map((r) => (
                        <tr key={r.id} className="border-b hover:bg-gray-50" data-testid={`row-${r.id}`}>
                          <td className="p-2 uppercase font-medium">{r.type}</td>
                          <td className="p-2"><div className="text-xs">{r.user?.name || r.user?.email || "—"}</div><div className="text-xs text-muted-foreground">{r.user?.mobile}</div></td>
                          <td className="p-2">{r.operatorName}</td>
                          <td className="p-2 font-mono text-xs">{r.number}</td>
                          <td className="p-2 text-right font-semibold">{formatINR(r.amount)}</td>
                          <td className="p-2"><Badge className={STATUS_COLORS[r.status]}>{r.status}</Badge></td>
                          <td className="p-2 text-xs whitespace-nowrap">{format(new Date(r.createdAt), "dd MMM HH:mm")}</td>
                          <td className="p-2 flex gap-1">
                            <Link href={`/recharge/receipt/${r.id}`}><Button size="sm" variant="ghost"><Eye className="h-4 w-4" /></Button></Link>
                            {(r.status === "success" || r.status === "pending" || r.status === "processing") && (
                              <Button size="sm" variant="outline" onClick={() => setRefundTarget(r.id)} data-testid={`refund-${r.id}`}>Refund</Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={!!refundTarget} onOpenChange={(v) => !v && setRefundTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Manual Refund</DialogTitle></DialogHeader>
          <Textarea placeholder="Reason for refund" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRefundTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!reason || refundMutation.isPending} onClick={() => refundTarget && refundMutation.mutate({ id: refundTarget, reason })}>
              {refundMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
