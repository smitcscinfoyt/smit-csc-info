import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Search, Lock, Unlock, Wallet } from "lucide-react";
import { adminListWallets, adminAdjustWallet, adminFreezeWallet, formatINR } from "@/lib/recharge-api";
import { useToast } from "@/hooks/use-toast";

export default function AdminWallets() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<string | null>(null);
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "wallets", q],
    queryFn: () => adminListWallets(q || undefined, 100),
  });

  const adjustMutation = useMutation({
    mutationFn: () => adminAdjustWallet(adjustTarget!, direction, Math.round(parseFloat(amount) * 100), reason),
    onSuccess: () => {
      toast({ title: "Adjusted" });
      setAdjustTarget(null); setAmount(""); setReason("");
      qc.invalidateQueries({ queryKey: ["admin", "wallets"] });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e?.data?.error }),
  });
  const freezeMutation = useMutation({
    mutationFn: ({ id, frozen }: { id: string; frozen: boolean }) => adminFreezeWallet(id, frozen),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "wallets"] }),
  });

  return (
    <div className="flex-1 py-8 px-4 bg-gray-50">
      <div className="container mx-auto max-w-6xl space-y-4">
        <Link href="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Admin</Button></Link>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" />User Wallets</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="Search by name/email/mobile" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /> :
              !data || data.items.length === 0 ? <div className="text-center py-8 text-muted-foreground">No wallets</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 text-left"><tr>
                      <th className="p-2">User</th><th className="p-2 text-right">Balance</th>
                      <th className="p-2 text-right">Credited</th><th className="p-2 text-right">Debited</th>
                      <th className="p-2">KYC</th><th className="p-2">Status</th><th className="p-2">Actions</th>
                    </tr></thead>
                    <tbody>
                      {data.items.map((w) => (
                        <tr key={w.userId} className="border-b" data-testid={`wallet-${w.userId}`}>
                          <td className="p-2"><div>{w.user?.name || w.user?.email || "—"}</div><div className="text-xs text-muted-foreground">{w.user?.mobile}</div></td>
                          <td className="p-2 text-right font-bold">{formatINR(w.balance)}</td>
                          <td className="p-2 text-right text-green-700">{formatINR(w.totalCredited)}</td>
                          <td className="p-2 text-right text-red-700">{formatINR(w.totalDebited)}</td>
                          <td className="p-2"><Badge variant={w.kycStatus === "approved" ? "default" : "secondary"}>{w.kycStatus}</Badge></td>
                          <td className="p-2">{w.isFrozen ? <Badge variant="destructive">Frozen</Badge> : <Badge>Active</Badge>}</td>
                          <td className="p-2 flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => { setAdjustTarget(w.userId); setDirection("credit"); }}>Adjust</Button>
                            <Button size="sm" variant="outline" onClick={() => freezeMutation.mutate({ id: w.userId, frozen: !w.isFrozen })}>
                              {w.isFrozen ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            </Button>
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

      <Dialog open={!!adjustTarget} onOpenChange={(v) => !v && setAdjustTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Manual Wallet Adjustment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="credit">Credit (add money)</SelectItem><SelectItem value="debit">Debit (deduct)</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Amount ₹</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><Label>Reason (mandatory, audited)</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for manual adjustment" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjustTarget(null)}>Cancel</Button>
            <Button disabled={!amount || !reason || adjustMutation.isPending} onClick={() => adjustMutation.mutate()}>
              {adjustMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
