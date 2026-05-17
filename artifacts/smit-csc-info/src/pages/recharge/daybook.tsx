import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Clock, ArrowUpCircle, TrendingUp, ArrowDownCircle, RefreshCw, Banknote, Wallet, CalendarDays } from "lucide-react";
import { getRechargeDashboard, formatINR } from "@/lib/recharge-api";

function todayKeyIST(): string {
  const ist = new Date(Date.now() + 330 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
}
function shiftDays(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + delta);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

export default function DayBookPage() {
  const [date, setDate] = useState<string>(() => todayKeyIST());
  const today = useMemo(() => todayKeyIST(), []);
  const yesterday = useMemo(() => shiftDays(today, -1), [today]);

  const q = useQuery({
    queryKey: ["recharge", "daybook", date],
    queryFn: () => getRechargeDashboard(date),
  });

  const dash = q.data;
  const t = dash?.today;
  const w = dash?.wallet;
  const loading = q.isLoading;

  const cards: Array<{ label: string; value: string; icon: React.ReactNode; bg: string }> = [
    { label: "Opening Balance", value: w ? formatINR(w.openingBalancePaise) : "—", icon: <TrendingUp className="h-7 w-7" />,    bg: "from-cyan-500 to-sky-600" },
    { label: "Closing Balance", value: w ? formatINR(w.closingBalancePaise ?? w.currentBalancePaise) : "—", icon: <Wallet className="h-7 w-7" />, bg: "from-indigo-500 to-purple-600" },
    { label: "Wallet Topup",    value: t ? formatINR(t.walletTopupPaise)   : "—", icon: <ArrowUpCircle className="h-7 w-7" />,   bg: "from-blue-500 to-indigo-600" },
    { label: "Recharge Debit",  value: t ? formatINR(t.rechargeDebitPaise) : "—", icon: <ArrowDownCircle className="h-7 w-7" />, bg: "from-pink-500 to-rose-600" },
    { label: "Refund Credit",   value: t ? formatINR(t.refundCreditPaise)  : "—", icon: <RefreshCw className="h-7 w-7" />,       bg: "from-teal-500 to-emerald-600" },
    { label: "Total Success",   value: t ? String(t.successCount) : "—",          icon: <CheckCircle2 className="h-7 w-7" />,    bg: "from-green-500 to-emerald-600" },
    { label: "Total Failure",   value: t ? String(t.failedCount)  : "—",          icon: <XCircle className="h-7 w-7" />,         bg: "from-rose-500 to-red-600" },
    { label: "Total Pending",   value: t ? String(t.pendingCount) : "—",          icon: <Clock className="h-7 w-7" />,           bg: "from-amber-500 to-orange-500" },
    { label: "Profit",          value: t ? formatINR(t.profitPaise) : "—",        icon: <Banknote className="h-7 w-7" />,        bg: "from-fuchsia-500 to-purple-600" },
  ];

  return (
    <div className="flex-1 py-6 px-4 bg-gray-50">
      <div className="container mx-auto max-w-5xl space-y-4">
        <Link href="/recharge#report"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Reports</Button></Link>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-purple-700" /> Day Book</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 items-center">
            <Input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
              data-testid="input-daybook-date"
            />
            <Button size="sm" variant={date === today ? "default" : "outline"} onClick={() => setDate(today)} data-testid="btn-daybook-today">Today</Button>
            <Button size="sm" variant={date === yesterday ? "default" : "outline"} onClick={() => setDate(yesterday)} data-testid="btn-daybook-yesterday">Yesterday</Button>
            <div className="ml-auto text-xs text-muted-foreground">All times in IST (Asia/Kolkata)</div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {cards.map((c) => (
            <Card key={c.label} className={`overflow-hidden text-white border-0 shadow-md bg-gradient-to-br ${c.bg}`} data-testid={`daybook-kpi-${c.label.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="opacity-90">{c.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs uppercase tracking-wide opacity-90">{c.label}</div>
                  <div className="text-xl font-bold truncate">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : c.value}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-purple-700 via-indigo-600 to-blue-600 px-5 py-3">
            <h2 className="text-white font-bold">Operator-wise Report</h2>
          </div>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-daybook-operators">
                <thead className="bg-gray-100 text-left">
                  <tr>
                    <th className="p-3">Company</th>
                    <th className="p-3 text-right">Success</th>
                    <th className="p-3 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={3} className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></td></tr>
                  ) : (dash?.operators ?? []).length === 0 ? (
                    <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No recharges on this date</td></tr>
                  ) : (
                    <>
                      {dash!.operators.map((o, i) => (
                        <tr key={`${o.type}-${o.operatorCode}-${i}`} className="border-b hover:bg-gray-50">
                          <td className="p-3">
                            <div className="font-medium">{o.operatorName}</div>
                            <div className="text-xs text-muted-foreground uppercase">{o.type}</div>
                          </td>
                          <td className="p-3 text-right">{formatINR(o.successAmountPaise)}<div className="text-xs text-muted-foreground">{o.successCount} txn</div></td>
                          <td className="p-3 text-right text-emerald-700 font-semibold">{formatINR(o.profitPaise)}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-bold">
                        <td className="p-3">Total</td>
                        <td className="p-3 text-right">{formatINR(t?.rechargeDebitPaise ?? 0)}</td>
                        <td className="p-3 text-right text-emerald-700">{formatINR(t?.profitPaise ?? 0)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
