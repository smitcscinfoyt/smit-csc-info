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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Loader2, Plus, Trash2, Edit, Info, RotateCcw } from "lucide-react";
import { adminListSlabs, adminUpsertSlab, adminDeleteSlab, adminResetSlabs, formatINR, OPERATOR_NAMES, type CommissionSlab, type RechargeType } from "@/lib/recharge-api";
import { useToast } from "@/hooks/use-toast";

interface FormState { id?: string; type: RechargeType; operatorCode: string; minAmount: string; maxAmount: string; pct: string; active: boolean; }
const empty: FormState = { type: "mobile", operatorCode: "", minAmount: "10", maxAmount: "5000", pct: "3.8", active: true };

function opLabel(code: string | null): string {
  if (!code || code === "*") return "ALL";
  return OPERATOR_NAMES[code] ?? code;
}

type SlabGroup = { type: string; label: string; items: CommissionSlab[] };

function groupSlabs(items: CommissionSlab[]): SlabGroup[] {
  const active = items.filter((s) => s.active && s.tier === "base");
  const groups: SlabGroup[] = [];
  const mobileItems = active.filter((s) => s.type === "mobile");
  const dthItems = active.filter((s) => s.type === "dth");
  const billItems = active.filter((s) => s.type === "bill");
  if (mobileItems.length) groups.push({ type: "mobile", label: "Mobile Prepaid", items: mobileItems });
  if (dthItems.length) groups.push({ type: "dth", label: "DTH", items: dthItems });
  if (billItems.length) groups.push({ type: "bill", label: "Bill / Utility", items: billItems });
  return groups;
}

export default function AdminCommission() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);

  const { data, isLoading } = useQuery({ queryKey: ["admin", "slabs"], queryFn: adminListSlabs });

  const saveMutation = useMutation({
    mutationFn: () => adminUpsertSlab({
      ...(form.id ? { id: form.id } : {}),
      type: form.type, operatorCode: form.operatorCode || null,
      tier: "base",
      minAmount: Math.round(parseFloat(form.minAmount) * 100), maxAmount: Math.round(parseFloat(form.maxAmount) * 100),
      percentBp: Math.round(parseFloat(form.pct) * 100),
      active: form.active,
    }),
    onSuccess: () => { toast({ title: "Saved" }); setOpen(false); qc.invalidateQueries({ queryKey: ["admin", "slabs"] }); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e?.data?.error }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminDeleteSlab(id),
    onSuccess: () => { toast({ title: "Deleted" }); qc.invalidateQueries({ queryKey: ["admin", "slabs"] }); },
  });
  const resetMutation = useMutation({
    mutationFn: () => adminResetSlabs(),
    onSuccess: () => { toast({ title: "Reset to A1Topup PLATINUM rates" }); qc.invalidateQueries({ queryKey: ["admin", "slabs"] }); },
  });

  const openEdit = (s?: CommissionSlab) => {
    setForm(s ? {
      id: s.id, type: s.type, operatorCode: s.operatorCode || "",
      minAmount: (s.minAmount / 100).toString(), maxAmount: (s.maxAmount / 100).toString(),
      pct: (s.percentBp / 100).toString(), active: s.active,
    } : empty);
    setOpen(true);
  };

  const groups = data ? groupSlabs(data.items) : [];

  return (
    <div className="flex-1 py-8 px-4 bg-gray-50">
      <div className="container mx-auto max-w-5xl space-y-4">
        <Link href="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Admin</Button></Link>

        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Commission Share Model (A1Topup PLATINUM):</strong> Base rate = what you receive from A1Topup. Users earn a share based on tier:
            <span className="font-semibold"> Login Only = 0%</span>,
            <span className="font-semibold"> Gold = 80%</span>,
            <span className="font-semibold"> Premium / Prime = 90%</span>
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle>Base Commission Rates (A1Topup PLATINUM)</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { if (confirm("Reset all rates to A1Topup PLATINUM defaults?")) resetMutation.mutate(); }} disabled={resetMutation.isPending}>
                <RotateCcw className="h-4 w-4 mr-1" />Reset Defaults
              </Button>
              <Button onClick={() => openEdit()} data-testid="btn-add-slab"><Plus className="h-4 w-4 mr-2" />Add Rate</Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /> :
              groups.length === 0 ? <div className="text-center py-8 text-muted-foreground">No active rates</div> : (
                <div className="space-y-6">
                  {groups.map((g) => (
                    <div key={g.type}>
                      <h3 className="font-semibold text-base mb-2 text-gray-700">{g.label}</h3>
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-100 text-left"><tr>
                            <th className="p-2">Operator</th>
                            <th className="p-2 text-right">Base %</th>
                            <th className="p-2 text-right text-amber-700">Gold (80%)</th>
                            <th className="p-2 text-right text-purple-700">Premium (90%)</th>
                            <th className="p-2 text-right">Min</th>
                            <th className="p-2 text-right">Max</th>
                            <th className="p-2">Actions</th>
                          </tr></thead>
                          <tbody>
                            {g.items.map((s) => {
                              const basePct = s.percentBp / 100;
                              return (
                                <tr key={s.id} className="border-b hover:bg-gray-50" data-testid={`slab-${s.id}`}>
                                  <td className="p-2 font-medium">
                                    {opLabel(s.operatorCode)}
                                    {s.operatorCode && s.operatorCode !== "*" && (
                                      <span className="text-xs text-gray-400 ml-1">({s.operatorCode})</span>
                                    )}
                                  </td>
                                  <td className="p-2 text-right font-semibold">{basePct.toFixed(2)}%</td>
                                  <td className="p-2 text-right text-amber-700 font-medium">{(basePct * 0.8).toFixed(2)}%</td>
                                  <td className="p-2 text-right text-purple-700 font-medium">{(basePct * 0.9).toFixed(2)}%</td>
                                  <td className="p-2 text-right text-gray-500">{formatINR(s.minAmount)}</td>
                                  <td className="p-2 text-right text-gray-500">{formatINR(s.maxAmount)}</td>
                                  <td className="p-2 flex gap-1">
                                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Edit className="h-4 w-4" /></Button>
                                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete rate?")) deleteMutation.mutate(s.id); }}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "Edit Base Rate" : "Add Base Rate"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as RechargeType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="mobile">Mobile</SelectItem><SelectItem value="dth">DTH</SelectItem><SelectItem value="bill">Bill</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Operator Code (blank = all operators)</Label><Input value={form.operatorCode} onChange={(e) => setForm({ ...form, operatorCode: e.target.value })} placeholder="e.g. A for Airtel, RC for Jio" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Min Amount (Rs)</Label><Input type="number" value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: e.target.value })} /></div>
              <div><Label>Max Amount (Rs)</Label><Input type="number" value={form.maxAmount} onChange={(e) => setForm({ ...form, maxAmount: e.target.value })} /></div>
            </div>
            <div><Label>Base Commission % (A1Topup PLATINUM rate)</Label><Input type="number" step="0.01" value={form.pct} onChange={(e) => setForm({ ...form, pct: e.target.value })} /></div>
            {form.pct && (
              <div className="text-xs text-gray-600 bg-gray-50 rounded p-2 space-y-0.5">
                <div>Login Only (Silver): <strong>0.00%</strong> (no commission)</div>
                <div>Gold (80% share): <strong>{(parseFloat(form.pct || "0") * 0.8).toFixed(2)}%</strong></div>
                <div>Premium / Prime (90% share): <strong>{(parseFloat(form.pct || "0") * 0.9).toFixed(2)}%</strong></div>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Active</label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>{saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
