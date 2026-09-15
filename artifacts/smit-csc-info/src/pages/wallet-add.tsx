import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Wallet, IndianRupee, ShieldCheck } from "lucide-react";
import { getWallet, initWalletTopup, formatINR } from "@/lib/recharge-api";
import { useToast } from "@/hooks/use-toast";
import { VyaparPaymentDialog, type VyaparPaymentData } from "@/components/vyapar-payment-dialog";

const QUICK_AMOUNTS = [100, 500, 1000, 2000, 5000];

export default function WalletAdd() {
  // ALL hooks declared unconditionally at the top (React rules of hooks)
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [amount, setAmount] = useState("");
  const [paymentDialog, setPaymentDialog] = useState<{
    open: boolean;
    data: VyaparPaymentData | null;
  }>({ open: false, data: null });

  const { data: wallet } = useQuery({ queryKey: ["wallet"], queryFn: getWallet });

  // Derived values computed BEFORE useMutation so the onError closure
  // can safely reference them without TDZ / stale-closure issues.
  // This prevents React error #310 ("Rendered more hooks than previous render").
  const numAmount = parseFloat(amount) || 0;
  const capRemaining = wallet ? wallet.capRemaining / 100 : Infinity;
  const exceedsCap = numAmount * 100 > (wallet?.capRemaining ?? Infinity);

  const initMutation = useMutation({
    mutationFn: (rupees: number) => initWalletTopup(Math.round(rupees * 100)),
    onSuccess: (res) => {
      setPaymentDialog({
        open: true,
        data: {
          orderId: res.orderId,
          clientTxnId: res.transactionId,
          amountRupees: res.amountRupees || res.amountPaise / 100,
          qrCode: res.qrCode,
          upiString: res.upiString,
          upiIntent: res.upiIntent,
          merchantName: res.merchantName || "Smit CSC Info",
          title: "Wallet Top-up",
          backText: "Back to Wallet",
        },
      });
    },
    onError: (err: any) => {
      const rawMsg = String(err?.data?.error || err?.message || "");
      const httpStatus = err?.status ?? 0;

      // Gateway server-side errors (429 high-volume, 500 crash, 502/503 outage)
      // are all TEMPORARY. The backend generates a fresh unique order ID on every
      // call, so the user just needs to retry with the same amount.
      // NEVER suggest changing the amount.
      const isTemporary =
        httpStatus === 429 ||
        httpStatus === 500 ||
        httpStatus === 502 ||
        httpStatus === 503 ||
        rawMsg.toLowerCase().includes("high volume") ||
        rawMsg.toLowerCase().includes("internal_server_error") ||
        rawMsg.toLowerCase().includes("unexpected error") ||
        rawMsg.toLowerCase().includes("temporarily");

      if (isTemporary) {
        toast({
          variant: "destructive",
          title: "Payment channel temporarily unavailable",
          description:
            "The payment gateway is busy. Please wait a moment and tap 'Pay via UPI' again — your amount will not change.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Payment failed",
          description: rawMsg || "Could not initiate payment. Please try again.",
        });
      }
    },
  });

  const handleSubmit = () => {
    if (numAmount < 10) {
      toast({ variant: "destructive", title: "Error", description: "Minimum ₹10 required" });
      return;
    }
    if (numAmount > 50000) {
      toast({ variant: "destructive", title: "Error", description: "Maximum ₹50,000 per transaction" });
      return;
    }
    if (exceedsCap) {
      toast({
        variant: "destructive",
        title: "Limit exceeded",
        description: `You can add up to ₹${capRemaining.toLocaleString("en-IN")}. Complete KYC for higher limits.`,
      });
      return;
    }
    initMutation.mutate(numAmount);
  };

  const handlePaymentSuccess = async () => {
    await qc.invalidateQueries({ queryKey: ["wallet"] });
    await qc.invalidateQueries({ queryKey: ["wallet-ledger"] });
    toast({
      title: "Money Added Successfully!",
      description: `₹${numAmount.toLocaleString("en-IN")} has been credited to your wallet.`,
    });
    setPaymentDialog({ open: false, data: null });
    setLocation("/wallet");
  };

  const handlePaymentCancel = () => {
    setPaymentDialog({ open: false, data: null });
  };

  return (
    <div className="flex-1 py-8 px-4 bg-gray-50">
      <div className="container mx-auto max-w-lg">
        <Link href="/wallet">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Wallet
          </Button>
        </Link>

        <Card className="shadow-lg border-0 ring-1 ring-gray-200 rounded-2xl">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Wallet className="h-6 w-6 text-primary" />
              Add Money to Wallet
            </CardTitle>
            <CardDescription>
              Instant deposit via UPI (PhonePe, Google Pay, Paytm, BHIM, QR)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            {wallet && (
              <div className="flex items-center justify-between p-3.5 bg-blue-50/60 border border-blue-100 rounded-xl">
                <span className="text-xs font-semibold text-blue-900">Current Wallet Balance:</span>
                <span className="font-bold text-gray-900 text-base">{formatINR(wallet.balance)}</span>
              </div>
            )}

            <div>
              <Label htmlFor="amount" className="text-sm font-semibold text-gray-700">
                Amount to Add (₹)
              </Label>
              <div className="relative mt-1.5">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  id="amount"
                  type="number"
                  inputMode="numeric"
                  min="10"
                  max="50000"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="500"
                  className="pl-10 text-xl font-bold h-12 rounded-xl"
                  data-testid="input-amount"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((a) => (
                <Button
                  key={a}
                  type="button"
                  variant={numAmount === a ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAmount(String(a))}
                  className="rounded-lg font-semibold"
                  data-testid={`quick-${a}`}
                >
                  ₹{a}
                </Button>
              ))}
            </div>

            {exceedsCap && wallet && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
                This amount exceeds your wallet limit ({formatINR(wallet.capRemaining)}).{" "}
                <Link href="/kyc" className="underline font-semibold">
                  Complete KYC
                </Link>
              </div>
            )}

            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-13 text-base rounded-xl shadow-md transition-all"
              disabled={initMutation.isPending || numAmount < 10 || exceedsCap}
              onClick={handleSubmit}
              data-testid="btn-pay"
            >
              {initMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Initiating Payment...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-5 w-5 mr-2" />
                  Pay ₹{numAmount > 0 ? numAmount.toLocaleString("en-IN") : "0"} via UPI
                </>
              )}
            </Button>

            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center space-y-1">
              <p className="text-xs font-medium text-gray-600">
                100% Secure Payment powered by VyaparGateway
              </p>
              <p className="text-[11px] text-muted-foreground">
                Money will be credited to your wallet balance instantly after UPI payment.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* VyaparGateway UPI Payment Dialog */}
      <VyaparPaymentDialog
        open={paymentDialog.open}
        payment={paymentDialog.data}
        onSuccess={handlePaymentSuccess}
        onCancel={handlePaymentCancel}
      />
    </div>
  );
}
