import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, TrendingUp, CheckCircle2, Banknote, Percent } from "lucide-react";
import { getEarningReport, formatINR } from "@/lib/recharge-api";
import { format } from "date-fns";

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
function startOfMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export default function MyEarningPage() {
  const today = useMemo(() => todayKeyIST(), []);
  const [from, setFrom] = useState<string>(() => shiftDays(today, -6));
  const [to, setTo] = useState<string>(today);

  const q = useQuery({
    queryKey: ["recharge", "earning", from, to],
    queryFn: () => getEarningReport(from, to),
    enabled: !!from && !!to,
  });
  const data = q.data;
  const sumAmt = data?.summary.successAmountPaise ?? 0;
  const sumProfit = data?.summary.profitPaise ?? 0;
  const avgPct = sumAmt > 0 ? ((sumProfit / sumAmt) * 100) : 0;

  return (
    <div className="flex-1 py-6 px-4 bg-gray-50">
      <div className="container mx-auto max-w-5xl space-y-4">
        <Link href="/recharge#report"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Reports</Button></Link>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-purple-700" /> My Earning</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">From</span>
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" data-testid="input-earning-from" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">To</span>
              <Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="w-40" data-testid="input-earning-to" />
            </div>
            <Button size="sm" variant="outline" onClick={() => { setFrom(today); setTo(today); }} data-testid="btn-earning-today">Today</Button>
            <Button size="sm" variant="outline" onClick={() => { const y = shiftDays(today, -1); setFrom(y); setTo(y); }} data-testid="btn-earning-yesterday">Yesterday</Button>
            <Button size="sm" variant="outline" onClick={() => { setFrom(shiftDays(today, -6)); setTo(today); }} data-testid="btn-earning-7d">Last 7 days</Button>
            <Button size="sm" variant="outline" onClick={() => { setFrom(shiftDays(today, -29)); setTo(today); }} data-testid="btn-earning-30d">Last 30 days</Button>
            <Button size="sm" variant="outline" onClick={() => { setFrom(startOfMonth(today)); setTo(today); }} data-testid="btn-earning-mtd">This month</Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-gradient-to-br from-green-500 to-emerald-600 text-white border-0 shadow-md"><CardContent className="p-4 flex items-center gap-3"><CheckCircle2 className="h-7 w-7 opacity-90" /><div><div className="text-xs uppercase opacity-90">Total Success</div><div className="text-xl font-bold">{q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (data?.summary.successCount ?? 0)}</div></div></CardContent></Card>
          <Card className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white border-0 shadow-md"><CardContent className="p-4 flex items-center gap-3"><Banknote className="h-7 w-7 opacity-90" /><div className="min-w-0"><div className="text-xs uppercase opacity-90">Success Amount</div><div className="text-xl font-bold truncate">{q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : formatINR(sumAmt)}</div></div></CardContent></Card>
          <Card className="bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white border-0 shadow-md"><CardContent className="p-4 flex items-center gap-3"><TrendingUp className="h-7 w-7 opacity-90" /><div className="min-w-0"><div className="text-xs uppercase opacity-90">Total Profit</div><div className="text-xl font-bold truncate">{q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : formatINR(sumProfit)}</div></div></CardContent></Card>
          <Card className="bg-gradient-to-br from-amber-500 to-orange-500 text-white border-0 shadow-md"><CardContent className="p-4 flex items-center gap-3"><Percent className="h-7 w-7 opacity-90" /><div><div className="text-xs uppercase opacity-90">Avg Margin</div><div className="text-xl font-bold">{avgPct.toFixed(2)}%</div></div></CardContent></Card>
        </div>

        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-purple-700 via-indigo-600 to-blue-600 px-5 py-3">
            <h2 className="text-white font-bold">Operator-wise Profit</h2>
          </div>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-earning-operators">
                <thead className="bg-gray-100 text-left">
                  <tr>
                    <th className="p-3">Company</th>
                    <th className="p-3 text-right">Success</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3 text-right">Profit</th>
                    <th className="p-3 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {q.isLoading ? (
                    <tr><td colSpan={5} className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></td></tr>
                  ) : (data?.operators ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No earnings in this range</td></tr>
                  ) : (
                    data!.operators.map((o, i) => (
                      <tr key={`${o.type}-${o.operatorCode}-${i}`} className="border-b hover:bg-gray-50">
                        <td className="p-3"><div className="font-medium">{o.operatorName}</div><div className="text-xs text-muted-foreground uppercase">{o.type}</div></td>
                        <td className="p-3 text-right">{o.successCount}</td>
                        <td className="p-3 text-right">{formatINR(o.successAmountPaise)}</td>
                        <td className="p-3 text-right text-emerald-700 font-semibold">{formatINR(o.profitPaise)}</td>
                        <td className="p-3 text-right">{o.successAmountPaise > 0 ? ((o.profitPaise / o.successAmountPaise) * 100).toFixed(2) : "0.00"}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-purple-700 via-indigo-600 to-blue-600 px-5 py-3">
            <h2 className="text-white font-bold">Day-wise Earning</h2>
          </div>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-earning-days">
                <thead className="bg-gray-100 text-left">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3 text-right">Success</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {q.isLoading ? (
                    <tr><td colSpan={4} className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></td></tr>
                  ) : (data?.days ?? []).length === 0 ? (
                    <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No data</td></tr>
                  ) : (
                    data!.days.map((d) => (
                      <tr key={d.day} className="border-b hover:bg-gray-50">
                        <td className="p-3">{format(new Date(d.day + "T00:00:00+05:30"), "dd MMM yyyy, EEE")}</td>
                        <td className="p-3 text-right">{d.successCount}</td>
                        <td className="p-3 text-right">{formatINR(d.successAmountPaise)}</td>
                        <td className="p-3 text-right text-emerald-700 font-semibold">{formatINR(d.profitPaise)}</td>
                      </tr>
                    ))
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
