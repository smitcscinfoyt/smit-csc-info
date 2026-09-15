import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Wallet, IndianRupee, ShieldCheck, AlertCircle } from "lucide-react";
import { getWallet, initWalletTopup, formatINR } from "@/lib/recharge-api";
import { useToast } from "@/hooks/use-toast";
import { VyaparPaymentDialog, type VyaparPaymentData } from "@/components/vyapar-payment-dialog";

const QUICK_AMOUNTS = [100, 500, 1000, 2000, 5000];

export default function WalletAdd() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [amount, setAmount] = useState("");
  const [rateLimitAmount, setRateLimitAmount] = useState<number | null>(null);
  const { data: wallet } = useQuery({ queryKey: ["wallet"], queryFn: getWallet });

  const [paymentDialog, setPaymentDialog] = useState<{
    open: boolean;
    data: VyaparPaymentData | null;
  }>({
    open: false,
    data: null,
  });

  const initMutation = useMutation({
    mutationFn: (rupees: number) => initWalletTopup(Math.round(rupees * 100)),
    onSuccess: (res) => {
      setRateLimitAmount(null);
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
      const is429 =
        err?.status === 429 ||
        rawMsg.includes("429") ||
        rawMsg.toLowerCase().includes("high volume");

      if (is429) {
        setRateLimitAmount(numAmount);
        toast({
          variant: "destructive",
          title: "Gateway Busy for ₹" + numAmount,
          description: `All gateway channels are currently busy with ₹${numAmount}. Please wait 2 minutes or try ₹${numAmount + 1}.`,
        });
      } else {
        setRateLimitAmount(null);
        toast({
          variant: "destructive",
          title: "Error",
          description: rawMsg || "Could not initiate payment. Please try again.",
        });
      }
    },
  });

  const numAmount = parseFloat(amount) || 0;
  const capRemaining = wallet ? wallet.capRemaining / 100 : Infinity;
  const exceedsCap = numAmount * 100 > (wallet?.capRemaining ?? Infinity);

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

            {rateLimitAmount === numAmount && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 space-y-2 text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-semibold text-amber-950">
                      ₹{numAmount} માટે ગેટવે ચેનલ હાલમાં વ્યસ્ત છે (High Volume)
                    </p>
                    <p className="mt-0.5 text-amber-800">
                      અગાઉનો ઓર્ડર પ્રોસેસમાં હોવાથી ગેટવે આ જ રકમ તરત સ્વીકારતો નથી. તમે 2 મિનિટ રાહ જોઈ શકો છો અથવા ₹{numAmount + 1} સાથે તરત આગળ વધી શકો છો.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg shadow-sm"
                  onClick={() => {
                    const nextAmt = numAmount + 1;
                    setAmount(String(nextAmt));
                    setRateLimitAmount(null);
                    initMutation.mutate(nextAmt);
                  }}
                >
                  ₹{numAmount + 1} સાથે તરત પેમેન્ટ કરો (Pay ₹{numAmount + 1})
                </Button>
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

      {/* Device-Based VyaparGateway Modal */}
      <VyaparPaymentDialog
        open={paymentDialog.open}
        payment={paymentDialog.data}
        onSuccess={handlePaymentSuccess}
        onCancel={handlePaymentCancel}
      />
    </div>
  );
}
