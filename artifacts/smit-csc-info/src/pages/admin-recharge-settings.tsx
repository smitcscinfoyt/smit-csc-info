import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Loader2, Save, Settings } from "lucide-react";
import { adminGetSettings, adminUpdateSettings, type RechargeSettings } from "@/lib/recharge-api";
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
      <div className="container mx-auto max-w-3xl space-y-4">
        <Link href="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Admin</Button></Link>
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
      </div>
    </div>
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
