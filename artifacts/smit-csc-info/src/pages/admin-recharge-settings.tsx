import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Loader2, Save, Settings, Percent, RefreshCw, Check,
  Smartphone, Tv, Receipt,
} from "lucide-react";
import {
  adminGetSettings, adminUpdateSettings,
  adminListSlabs, adminUpsertSlab, adminResetSlabs,
  OPERATOR_NAMES,
  type RechargeSettings, type CommissionSlab, type RechargeType,
} from "@/lib/recharge-api";
import { useToast } from "@/hooks/use-toast";

export default function AdminRechargeSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "recharge-settings"], queryFn: adminGetSettings });
  const [s, setS] = useState<RechargeSettings | null>(null);
  useEffect(() => { if (data) setS(data); }, [data]);

  const saveMutation = useMutation({
    mutationFn: (patch: Partial<RechargeSettings>) => adminUpdateSettings(patch),
    onSuccess: () => { toast({ title: "Settings saved" }); qc.invalidateQueries({ queryKey: ["admin", "recharge-settings"] }); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e?.data?.error }),
  });

  if (isLoading || !s) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const u = (k: keyof RechargeSettings, v: any) => setS({ ...s, [k]: v });
  const numR = (paise: number) => (paise / 100).toString();

  return (
    <div className="flex-1 py-8 px-4 bg-gray-50">
      <div className="container mx-auto max-w-4xl space-y-4">
        <Link href="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Admin</Button></Link>

        {/* ── Global Settings ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />Recharge & Wallet Settings</CardTitle>
            <CardDescription>Global controls for recharge portal and wallet</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Section title="Service Toggles">
              <Toggle label="Mobile Recharge" v={s.mobileEnabled} onChange={(v) => u("mobileEnabled", v)} />
              <Toggle label="DTH Recharge" v={s.dthEnabled} onChange={(v) => u("dthEnabled", v)} />
              <Toggle label="Bill Payment" v={s.billEnabled} onChange={(v) => u("billEnabled", v)} />
              <Toggle label="Wallet Top-up" v={s.walletTopupEnabled} onChange={(v) => u("walletTopupEnabled", v)} />
            </Section>
            <Separator />
            <Section title="Recharge Limits">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Min Recharge ₹" v={numR(s.minRecharge)} onChange={(v) => u("minRecharge", Math.round(parseFloat(v) * 100))} />
                <Field label="Max Recharge ₹" v={numR(s.maxRecharge)} onChange={(v) => u("maxRecharge", Math.round(parseFloat(v) * 100))} />
                <Field label="Min Top-up ₹" v={numR(s.minTopup)} onChange={(v) => u("minTopup", Math.round(parseFloat(v) * 100))} />
                <Field label="Max Top-up ₹" v={numR(s.maxTopup)} onChange={(v) => u("maxTopup", Math.round(parseFloat(v) * 100))} />
              </div>
            </Section>
            <Separator />
            <Section title="Wallet Caps">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cap (No KYC) ₹" v={numR(s.walletCapNoKyc)} onChange={(v) => u("walletCapNoKyc", Math.round(parseFloat(v) * 100))} />
                <Field label="Cap (With KYC) ₹" v={numR(s.walletCapKyc)} onChange={(v) => u("walletCapKyc", Math.round(parseFloat(v) * 100))} />
                <Field label="Daily Txn Limit" v={String(s.dailyTxnLimit)} onChange={(v) => u("dailyTxnLimit", parseInt(v) || 0)} />
              </div>
            </Section>
            <Separator />
            <Section title="Master Switch">
              <Toggle label="Recharge Service Enabled (master)" v={s.rechargeEnabled} onChange={(v) => u("rechargeEnabled", v)} />
            </Section>

            <Button className="w-full" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(s)} data-testid="btn-save-settings">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save Settings
            </Button>
          </CardContent>
        </Card>

        {/* ── Commission Manager ── */}
        <CommissionManager />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Commission Manager — edit A1Topup commission % per operator
// ─────────────────────────────────────────────────────────────
function CommissionManager() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "commission-slabs"],
    queryFn: adminListSlabs,
  });

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RechargeType | "all">("all");

  const saveMutation = useMutation({
    mutationFn: (slab: CommissionSlab & { newPct: number }) =>
      adminUpsertSlab({
        id: slab.id,
        type: slab.type,
        operatorCode: slab.operatorCode,
        tier: slab.tier,
        minAmount: slab.minAmount,
        maxAmount: slab.maxAmount,
        percentBp: Math.round(slab.newPct * 100),
        active: slab.active,
      }),
    onSuccess: (_d, slab) => {
      toast({ title: "Updated", description: `${OPERATOR_NAMES[slab.operatorCode || "*"] ?? slab.operatorCode ?? "Wildcard"} → ${slab.newPct}%` });
      qc.invalidateQueries({ queryKey: ["admin", "commission-slabs"] });
      setEdits((e) => { const c = { ...e }; delete c[slab.id]; return c; });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Save failed", description: e?.data?.error?.toString() ?? e?.message }),
    onSettled: () => setSavingId(null),
  });

  const resetMutation = useMutation({
    mutationFn: adminResetSlabs,
    onSuccess: () => {
      toast({ title: "Reset complete", description: "All rates restored to A1 Platinum defaults" });
      qc.invalidateQueries({ queryKey: ["admin", "commission-slabs"] });
      setEdits({});
    },
  });

  const baseSlabs = useMemo(() => {
    const items = (data?.items ?? []).filter((s) => s.tier === "base" && s.active);
    return filter === "all" ? items : items.filter((s) => s.type === filter);
  }, [data, filter]);

  const grouped = useMemo(() => {
    const g: Record<RechargeType, CommissionSlab[]> = { mobile: [], dth: [], bill: [] };
    for (const s of baseSlabs) g[s.type].push(s);
    return g;
  }, [baseSlabs]);

  const handleSave = (slab: CommissionSlab) => {
    const v = edits[slab.id];
    const newPct = parseFloat(v);
    if (isNaN(newPct) || newPct < 0 || newPct > 50) {
      toast({ variant: "destructive", title: "Invalid", description: "Enter 0 – 50" });
      return;
    }
    setSavingId(slab.id);
    saveMutation.mutate({ ...slab, newPct });
  };

  const TYPE_META: Record<RechargeType, { icon: any; label: string; color: string }> = {
    mobile: { icon: Smartphone, label: "Mobile Recharge", color: "bg-blue-50 border-blue-200" },
    dth:    { icon: Tv,         label: "DTH",             color: "bg-purple-50 border-purple-200" },
    bill:   { icon: Receipt,    label: "Bill Payments",   color: "bg-amber-50 border-amber-200" },
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><Percent className="h-5 w-5" />Commission Manager</CardTitle>
            <CardDescription>
              A1Topup base rate per operator. Members get: <b>Premium 90%</b> · <b>Gold 80%</b> · <b>Free 0%</b>.<br />
              <span className="text-xs">Change a value and click ✓ — applied instantly, no deploy needed.</span>
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={resetMutation.isPending}
            onClick={() => { if (confirm("Reset all rates to A1 Platinum defaults? Custom values will be lost.")) resetMutation.mutate(); }}
          >
            {resetMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Reset to Defaults
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filter tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {(["all", "mobile", "dth", "bill"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : TYPE_META[f].label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading rates…
          </div>
        ) : baseSlabs.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-6">No slabs found</div>
        ) : (
          <div className="space-y-5">
            {(Object.keys(grouped) as RechargeType[]).map((type) => {
              const slabs = grouped[type];
              if (!slabs.length) return null;
              const M = TYPE_META[type];
              return (
                <div key={type} className={`border rounded-lg overflow-hidden ${M.color}`}>
                  <div className="px-3 py-2 font-semibold text-sm flex items-center gap-2 bg-white/60">
                    <M.icon className="h-4 w-4" /> {M.label} <Badge variant="secondary" className="ml-1">{slabs.length}</Badge>
                  </div>
                  <div className="bg-white divide-y">
                    {slabs.map((slab) => {
                      const code = slab.operatorCode ?? "*";
                      const opName = code === "*" ? "All others (wildcard)" : (OPERATOR_NAMES[code] ?? code);
                      const currentPct = (slab.percentBp / 100).toFixed(2);
                      const editing = edits[slab.id] !== undefined;
                      const isSaving = savingId === slab.id;
                      const previewPremium = parseFloat(edits[slab.id] ?? currentPct) * 0.9;
                      const previewGold = parseFloat(edits[slab.id] ?? currentPct) * 0.8;

                      return (
                        <div key={slab.id} className="px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{opName}</div>
                            <div className="text-[11px] text-gray-500 font-mono">{code}</div>
                          </div>
                          <div className="text-[11px] text-gray-600 text-right hidden sm:block">
                            <div>Premium: <b className="text-green-700">{isNaN(previewPremium) ? "—" : previewPremium.toFixed(2)}%</b></div>
                            <div>Gold: <b className="text-amber-700">{isNaN(previewGold) ? "—" : previewGold.toFixed(2)}%</b></div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Input
                              type="number"
                              step="0.05"
                              min="0"
                              max="50"
                              className={`w-20 h-9 text-right font-semibold ${editing ? "border-indigo-500 ring-2 ring-indigo-100" : ""}`}
                              value={edits[slab.id] ?? currentPct}
                              onChange={(e) => setEdits({ ...edits, [slab.id]: e.target.value })}
                              onFocus={(e) => e.target.select()}
                              disabled={isSaving}
                            />
                            <span className="text-sm text-gray-500">%</span>
                            <Button
                              size="sm"
                              variant={editing ? "default" : "outline"}
                              className="h-9 px-2"
                              disabled={!editing || isSaving}
                              onClick={() => handleSave(slab)}
                              data-testid={`save-slab-${slab.id}`}
                            >
                              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 text-[11px] text-muted-foreground bg-gray-50 rounded p-2 border">
          💡 <b>Tip:</b> A1Topup પર નવી rates publish થાય ત્યારે અહીંથી જ instant update કરો — code change નહીં, deploy નહીં.
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return <div><h3 className="font-semibold mb-3">{title}</h3><div className="space-y-3">{children}</div></div>;
}
function Toggle({ label, v, onChange }: { label: string; v: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex items-center justify-between"><Label>{label}</Label><Switch checked={v} onCheckedChange={onChange} /></div>;
}
function Field({ label, v, onChange }: { label: string; v: string; onChange: (v: string) => void }) {
  return <div><Label>{label}</Label><Input type="number" step="0.01" value={v} onChange={(e) => onChange(e.target.value)} /></div>;
}
