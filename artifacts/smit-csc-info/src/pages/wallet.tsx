import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Plus, ShieldAlert, Loader2, ListOrdered, ShieldCheck, Lock } from "lucide-react";
import { getWallet, getLedger, formatINR } from "@/lib/recharge-api";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

export default function WalletPage() {
  const { user } = useAuth();
  const { data: wallet, isLoading } = useQuery({ queryKey: ["wallet"], queryFn: getWallet, enabled: !!user });
  const { data: ledger } = useQuery({ queryKey: ["wallet", "ledger", 20], queryFn: () => getLedger(20, 0), enabled: !!user });

  if (!user) return <div className="flex-1 p-8 text-center">Please <Link href="/login" className="text-primary underline">login</Link></div>;
  if (isLoading || !wallet) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex-1 py-8 px-4 bg-gradient-to-br from-purple-50 via-white to-amber-50">
      <div className="container mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Wallet</h1>
          <p className="text-muted-foreground">Your balance and transaction history</p>
        </div>

        <Card className="border-2 border-primary/20 shadow-lg overflow-hidden bg-gradient-to-br from-purple-700 via-purple-800 to-purple-900 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-purple-100"><Wallet className="h-5 w-5" /><span>Available Balance</span></div>
              {wallet.isFrozen && <Badge variant="destructive"><Lock className="h-3 w-3 mr-1" />Frozen</Badge>}
            </div>
            <div className="text-4xl font-bold tracking-tight" data-testid="wallet-balance">{formatINR(wallet.balance)}</div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link href="/wallet/add">
                <Button size="lg" className="bg-amber-400 text-purple-900 hover:bg-amber-300 font-semibold" data-testid="btn-add-money" disabled={wallet.isFrozen}>
                  <Plus className="h-4 w-4 mr-2" />Add Money
                </Button>
              </Link>
              <Link href="/recharge"><Button size="lg" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20">Recharge</Button></Link>
            </div>
          </CardContent>
        </Card>

        <div className="grid sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center"><ArrowDownToLine className="h-5 w-5 text-green-700" /></div>
              <div><div className="text-xs text-muted-foreground">Total Credited</div><div className="font-bold">{formatINR(wallet.totalCredited)}</div></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center"><ArrowUpFromLine className="h-5 w-5 text-red-700" /></div>
              <div><div className="text-xs text-muted-foreground">Total Debited</div><div className="font-bold">{formatINR(wallet.totalDebited)}</div></div>
            </CardContent>
          </Card>
        </div>

        {wallet.kycStatus !== "approved" && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-4 flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-amber-900">Complete KYC</div>
                <div className="text-sm text-amber-800">
                  Without KYC, wallet limit is ₹{(wallet.cap / 100).toLocaleString("en-IN")}. After KYC, the limit increases to ₹50,000.
                </div>
              </div>
              <Link href="/kyc"><Button variant="outline" size="sm" className="border-amber-400 text-amber-900">Do KYC</Button></Link>
            </CardContent>
          </Card>
        )}
        {wallet.kycStatus === "approved" && (
          <Card className="border-green-300 bg-green-50">
            <CardContent className="p-3 flex items-center gap-2 text-green-800">
              <ShieldCheck className="h-4 w-4" /><span className="text-sm font-medium">KYC Approved — Limit {formatINR(wallet.cap)}</span>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ListOrdered className="h-5 w-5" />Recent History</CardTitle>
            <CardDescription>Last 20 transactions</CardDescription>
          </CardHeader>
          <CardContent>
            {!ledger || ledger.items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No transactions yet</div>
            ) : (
              <div className="divide-y">
                {ledger.items.map((e) => (
                  <div key={e.id} className="py-3 flex items-center justify-between gap-3" data-testid={`ledger-${e.id}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${e.direction === "credit" ? "bg-green-100" : "bg-red-100"}`}>
                        {e.direction === "credit" ? <ArrowDownToLine className="h-4 w-4 text-green-700" /> : <ArrowUpFromLine className="h-4 w-4 text-red-700" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{e.reason}{e.note ? ` — ${e.note}` : ""}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(e.createdAt), "dd MMM yyyy, HH:mm")}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-bold ${e.direction === "credit" ? "text-green-700" : "text-red-700"}`}>
                        {e.direction === "credit" ? "+" : "−"}{formatINR(e.amount)}
                      </div>
                      <div className="text-xs text-muted-foreground">Balance: {formatINR(e.balanceAfter)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
