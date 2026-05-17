import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Wallet, IndianRupee, Copy, Check, Upload, Building2, QrCode, ShieldCheck } from "lucide-react";
import {
  getWallet, initWalletTopup, formatINR,
  getPaymentInfo, submitManualTopup, uploadFileToStorage,
} from "@/lib/recharge-api";
import { useToast } from "@/hooks/use-toast";

const QUICK_AMOUNTS = [100, 500, 1000, 2000, 5000];

export default function WalletAdd() {
  return (
    <div className="flex-1 py-8 px-4 bg-gray-50">
      <div className="container mx-auto max-w-xl">
        <Link href="/wallet"><Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="h-4 w-4 mr-2" />Wallet</Button></Link>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" />Add Money to Wallet</CardTitle>
            <CardDescription>PhonePe Gateway or Manual Payment (Bank / UPI QR)</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="phonepe" className="w-full">
              <TabsList className="grid grid-cols-2 w-full mb-4">
                <TabsTrigger value="phonepe" data-testid="tab-phonepe">PhonePe Gateway</TabsTrigger>
                <TabsTrigger value="manual" data-testid="tab-manual">Manual Payment</TabsTrigger>
              </TabsList>
              <TabsContent value="phonepe"><PhonePeTab /></TabsContent>
              <TabsContent value="manual"><ManualTab /></TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── PhonePe gateway flow (existing) ─────────────────────────────────────────
function PhonePeTab() {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const { data: wallet } = useQuery({ queryKey: ["wallet"], queryFn: getWallet });

  const initMutation = useMutation({
    mutationFn: (rupees: number) => initWalletTopup(Math.round(rupees * 100)),
    onSuccess: (res) => { window.location.href = res.redirectUrl; },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Error", description: err?.data?.error || "Could not start payment. Please try Manual Payment." });
    },
  });

  const numAmount = parseFloat(amount) || 0;
  const capRemaining = wallet ? wallet.capRemaining / 100 : Infinity;
  const exceedsCap = numAmount * 100 > (wallet?.capRemaining ?? Infinity);

  const handleSubmit = () => {
    if (numAmount < 10) return toast({ variant: "destructive", title: "Error", description: "Minimum ₹10 required" });
    if (numAmount > 50000) return toast({ variant: "destructive", title: "Error", description: "Maximum ₹50,000 per transaction" });
    if (exceedsCap) return toast({ variant: "destructive", title: "Limit exceeded", description: `You can add up to ₹${capRemaining.toLocaleString("en-IN")}. Complete KYC for higher limits.` });
    initMutation.mutate(numAmount);
  };

  return (
    <div className="space-y-5">
      {wallet && <div className="text-sm text-muted-foreground">Current Balance: <span className="font-semibold text-gray-900">{formatINR(wallet.balance)}</span></div>}
      <div>
        <Label htmlFor="amount">Amount (₹)</Label>
        <div className="relative mt-1">
          <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input id="amount" type="number" inputMode="numeric" min="10" max="50000" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" className="pl-9 text-lg font-semibold" data-testid="input-amount" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK_AMOUNTS.map((a) => (
          <Button key={a} type="button" variant="outline" size="sm" onClick={() => setAmount(String(a))} data-testid={`quick-${a}`}>₹{a}</Button>
        ))}
      </div>
      {exceedsCap && wallet && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
          This amount exceeds your limit ({formatINR(wallet.capRemaining)}). <Link href="/kyc" className="underline">Complete KYC</Link>
        </div>
      )}
      <Button className="w-full bg-primary hover:bg-primary/90 text-white font-semibold h-12 text-base" disabled={initMutation.isPending || numAmount < 10 || exceedsCap} onClick={handleSubmit} data-testid="btn-pay">
        {initMutation.isPending ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Processing...</> : <>Pay ₹{numAmount > 0 ? numAmount.toLocaleString("en-IN") : "0"} via PhonePe</>}
      </Button>
      <p className="text-xs text-center text-muted-foreground">Money will be credited to your wallet instantly after successful payment.</p>
    </div>
  );
}

// ─── Manual deposit (bank / UPI QR) ──────────────────────────────────────────
function ManualTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: info, isLoading } = useQuery({ queryKey: ["payment-info"], queryFn: getPaymentInfo });
  const { data: wallet } = useQuery({ queryKey: ["wallet"], queryFn: getWallet });

  const [channel, setChannel] = useState<"bank" | "upi">("upi");
  const [amount, setAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [note, setNote] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const numAmount = parseFloat(amount) || 0;
  const capRemaining = wallet ? wallet.capRemaining / 100 : Infinity;
  const exceedsCap = numAmount * 100 > (wallet?.capRemaining ?? Infinity);

  const submitMutation = useMutation({
    mutationFn: () => submitManualTopup({
      amountPaise: Math.round(numAmount * 100),
      channel, utr: utr.trim(), proofUrl,
      userNote: note.trim() || undefined,
    }),
    onSuccess: (res) => {
      toast({ title: "Submitted", description: res.message });
      setAmount(""); setUtr(""); setNote(""); setProofUrl("");
      qc.invalidateQueries({ queryKey: ["wallet-topups"] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Error", description: err?.data?.error || "Could not submit" });
    },
  });

  const copy = async (key: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(key); setTimeout(() => setCopied(null), 1500); } catch {}
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast({ variant: "destructive", title: "Error", description: "Max 5 MB" });
    setUploading(true);
    try {
      const url = await uploadFileToStorage(file);
      setProofUrl(url);
      toast({ title: "Uploaded" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Upload Error", description: e?.message || "Try again" });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (numAmount < 10) return toast({ variant: "destructive", title: "Error", description: "Minimum ₹10" });
    if (numAmount > 50000) return toast({ variant: "destructive", title: "Error", description: "Maximum ₹50,000" });
    if (exceedsCap) return toast({ variant: "destructive", title: "Limit exceeded", description: `You can add up to ₹${capRemaining.toLocaleString("en-IN")}.` });
    if (utr.trim().length < 4) return toast({ variant: "destructive", title: "Error", description: "Enter UTR / Transaction ID" });
    if (!proofUrl) return toast({ variant: "destructive", title: "Error", description: "Upload payment screenshot" });
    submitMutation.mutate();
  };

  if (isLoading || !info) return <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;

  return (
    <div className="space-y-5">
      {/* Step 1: Pay via UPI or Bank */}
      <Tabs value={channel} onValueChange={(v) => setChannel(v as "bank" | "upi")}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="upi" data-testid="tab-upi"><QrCode className="h-4 w-4 mr-2" />UPI / QR</TabsTrigger>
          <TabsTrigger value="bank" data-testid="tab-bank"><Building2 className="h-4 w-4 mr-2" />Bank Transfer</TabsTrigger>
        </TabsList>

        <TabsContent value="upi" className="mt-4">
          <div className="rounded-lg border bg-white p-4 text-center space-y-3">
            <div className="font-semibold text-sm">{info.upi.merchantName}</div>
            <img src={info.upi.qrImageUrl} alt="UPI QR" className="mx-auto w-64 h-64 object-contain bg-white border rounded" data-testid="img-qr" />
            <div className="flex items-center justify-center gap-2 bg-gray-50 border rounded px-3 py-2">
              <span className="text-xs text-muted-foreground">UPI ID:</span>
              <span className="font-mono text-sm font-semibold">{info.upi.upiId}</span>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => copy("upi", info.upi.upiId)} data-testid="copy-upi">
                {copied === "upi" ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">Terminal: {info.upi.terminalId}</div>
            <p className="text-xs text-gray-700">Scan QR or copy UPI ID and pay via any UPI app (PhonePe / GPay / Paytm / BHIM).</p>
          </div>
        </TabsContent>

        <TabsContent value="bank" className="mt-4">
          <div className="rounded-lg border bg-white divide-y text-sm">
            {[
              ["Bank", info.bank.bankName],
              ["Account Name", info.bank.accountName],
              ["Account Number", info.bank.accountNumber],
              ["IFSC", info.bank.ifsc],
              ["Branch", info.bank.branch],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2 p-3">
                <div>
                  <div className="text-xs text-muted-foreground">{k}</div>
                  <div className="font-medium break-all">{v}</div>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => copy(k, v)} data-testid={`copy-${k}`}>
                  {copied === k ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
        {info.notes.map((n, i) => <div key={i}>• {n}</div>)}
      </div>

      {/* Step 2: Submit proof */}
      <div className="space-y-3 pt-2 border-t">
        <div className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />After payment, fill below:</div>

        <div>
          <Label htmlFor="m-amount">Paid Amount (₹)</Label>
          <div className="relative mt-1">
            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input id="m-amount" type="number" inputMode="numeric" min="10" max="50000" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" className="pl-9" data-testid="input-m-amount" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((a) => (
            <Button key={a} type="button" variant="outline" size="sm" onClick={() => setAmount(String(a))}>₹{a}</Button>
          ))}
        </div>

        <div>
          <Label htmlFor="m-utr">UTR / Transaction ID</Label>
          <Input id="m-utr" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="e.g. T2405031234567890123" className="mt-1 uppercase" data-testid="input-utr" />
          <p className="text-xs text-muted-foreground mt-1">Find this in your UPI app success screen or bank SMS.</p>
        </div>

        <div>
          <Label htmlFor="m-proof">Payment Screenshot</Label>
          <div className="mt-1 flex items-center gap-2">
            <Input id="m-proof" type="file" accept="image/*" onChange={(e) => onUpload(e.target.files?.[0])} disabled={uploading} data-testid="input-proof" />
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            {proofUrl && <Check className="h-5 w-5 text-green-600" />}
          </div>
          {proofUrl && <a href={proofUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline mt-1 inline-block">View uploaded image</a>}
        </div>

        <div>
          <Label htmlFor="m-note">Remarks (optional)</Label>
          <Textarea id="m-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write any note (optional)" rows={2} className="mt-1" data-testid="input-note" />
        </div>

        {exceedsCap && wallet && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
            This amount exceeds your limit ({formatINR(wallet.capRemaining)}). <Link href="/kyc" className="underline">Complete KYC</Link>
          </div>
        )}

        <Button className="w-full bg-primary hover:bg-primary/90 text-white font-semibold h-12" disabled={submitMutation.isPending || uploading} onClick={handleSubmit} data-testid="btn-submit-manual">
          {submitMutation.isPending ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Submitting...</> : <><Upload className="h-5 w-5 mr-2" />Submit for Verification</>}
        </Button>
        <p className="text-xs text-center text-muted-foreground">Wallet will be credited within 5–30 minutes after admin verification.</p>
      </div>
    </div>
  );
}
