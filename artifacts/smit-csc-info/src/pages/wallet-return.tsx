import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { verifyWalletTopup, formatINR } from "@/lib/recharge-api";

export default function WalletReturn() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"checking" | "success" | "pending" | "failed">("checking");
  const [balance, setBalance] = useState<number | null>(null);
  const [tries, setTries] = useState(0);

  const verify = useMutation({
    mutationFn: (txn: string) => verifyWalletTopup(txn),
    onSuccess: (res) => {
      setBalance(res.balance);
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["wallet", "ledger", 20] });
      if (res.status === "success") setStatus("success");
      else if (res.status === "failed") setStatus("failed");
      else setStatus("pending");
    },
    onError: () => setStatus("failed"),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const txn = params.get("txn");
    if (!txn) { setStatus("failed"); return; }
    verify.mutate(txn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "pending" || tries >= 5) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const txn = params.get("txn");
      if (txn) { setTries((n) => n + 1); verify.mutate(txn); }
    }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tries]);

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-gray-50">
      <Card className="w-full max-w-md shadow-xl">
        <CardContent className="pt-10 pb-8 px-8 text-center">
          {status === "checking" && (<>
            <Loader2 className="h-16 w-16 text-primary mx-auto animate-spin mb-4" />
            <h1 className="text-2xl font-bold mb-2">Verifying payment...</h1>
            <p className="text-muted-foreground">Please wait a moment</p>
          </>)}
          {status === "success" && (<>
            <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2 text-green-800">Success!</h1>
            <p className="text-muted-foreground mb-2">Money has been credited to your wallet.</p>
            {balance !== null && <p className="text-lg font-semibold mb-6">New Balance: {formatINR(balance)}</p>}
            <div className="flex flex-col gap-2">
              <Button onClick={() => setLocation("/wallet")} data-testid="btn-go-wallet">View Wallet</Button>
              <Button variant="outline" onClick={() => setLocation("/recharge")}>Recharge</Button>
            </div>
          </>)}
          {status === "pending" && (<>
            <Clock className="h-16 w-16 text-amber-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2 text-amber-800">Processing</h1>
            <p className="text-muted-foreground mb-6">Your payment is being processed. Money will be credited shortly.</p>
            <Link href="/wallet"><Button variant="outline">View Wallet</Button></Link>
          </>)}
          {status === "failed" && (<>
            <XCircle className="h-16 w-16 text-red-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2 text-red-800">Payment Failed</h1>
            <p className="text-muted-foreground mb-6">Your payment could not be completed. If money was deducted, it will be refunded in 3-5 days.</p>
            <div className="flex flex-col gap-2">
              <Link href="/wallet/add"><Button>Try Again</Button></Link>
              <Link href="/wallet"><Button variant="outline">View Wallet</Button></Link>
            </div>
          </>)}
        </CardContent>
      </Card>
    </div>
  );
}
