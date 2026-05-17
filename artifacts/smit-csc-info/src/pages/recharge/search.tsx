import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Search as SearchIcon, Eye, Smartphone, Tv, Receipt } from "lucide-react";
import { searchRecharge, formatINR, type RechargeStatus, type RechargeType, type RechargeRecord } from "@/lib/recharge-api";
import { format } from "date-fns";

const ICONS: Record<string, any> = { mobile: Smartphone, dth: Tv, bill: Receipt };
const STATUS_COLORS: Record<RechargeStatus, string> = {
  success: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-800",
};

export default function SearchTransactionPage() {
  const [q, setQ] = useState("");
  const m = useMutation({
    mutationFn: (val: string) => searchRecharge(val),
  });

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const v = q.trim();
    if (v.length < 3) return;
    m.mutate(v);
  }

  const items = m.data?.recharges ?? [];

  return (
    <div className="flex-1 py-6 px-4 bg-gray-50">
      <div className="container mx-auto max-w-3xl space-y-4">
        <Link href="/recharge#report"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Reports</Button></Link>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><SearchIcon className="h-5 w-5 text-purple-700" /> Search Transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="flex gap-2">
              <Input
                placeholder="Mobile / Account number, TXID, or Order ID (min 3 chars)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="flex-1"
                data-testid="input-search-q"
              />
              <Button type="submit" disabled={q.trim().length < 3 || m.isPending} data-testid="btn-search-go">
                {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
                <span className="ml-2 hidden sm:inline">Search</span>
              </Button>
            </form>
            {m.error && (
              <div className="text-sm text-red-600 mt-2" data-testid="text-search-error">
                {(m.error as any)?.message ?? "Search failed"}
              </div>
            )}
          </CardContent>
        </Card>

        {m.data && (
          <Card>
            <CardContent className="p-0">
              {items.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No transactions match "{m.data.query}"</div>
              ) : (
                <div className="divide-y">
                  {items.map((r: RechargeRecord) => {
                    const Icon = ICONS[r.type] ?? Receipt;
                    return (
                      <div key={r.id} className="py-3 px-4 flex items-center gap-3" data-testid={`search-row-${r.id}`}>
                        <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-purple-700" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{r.operatorName}</span>
                            <Badge className={STATUS_COLORS[r.status as RechargeStatus] ?? "bg-gray-100"}>{r.status}</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground truncate">
                            {r.number} · {format(new Date(r.createdAt), "dd MMM yy, HH:mm")}
                          </div>
                          {(r.providerRequestId || r.providerTxnId) && (
                            <div className="text-xs text-muted-foreground truncate font-mono">
                              {r.providerRequestId && <>REQ: {r.providerRequestId} </>}
                              {r.providerTxnId && <>· TXN: {r.providerTxnId}</>}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold">{formatINR(r.amount)}</div>
                          {r.commissionAmount > 0 && <div className="text-xs text-green-700">+{formatINR(r.commissionAmount)}</div>}
                        </div>
                        <Link href={`/recharge/receipt/${r.id}`}><Button size="sm" variant="ghost" data-testid={`btn-view-${r.id}`}><Eye className="h-4 w-4" /></Button></Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
