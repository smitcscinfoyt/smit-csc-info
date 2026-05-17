import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Download, BookOpen } from "lucide-react";
import { getLedgerRange, formatINR } from "@/lib/recharge-api";
import { format } from "date-fns";

const LEDGER_LABEL: Record<string, string> = {
  topup: "Wallet Top-up",
  recharge_debit: "Recharge",
  recharge_refund: "Recharge Refund",
  commission: "Commission",
  admin_credit: "Admin Credit",
  admin_debit: "Admin Debit",
  reversal: "Reversal",
  money_transfer_debit: "Money Transfer",
  money_transfer_refund: "Money Transfer Refund",
  money_transfer_charge: "DMT Charge",
};

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

function csvCell(v: any): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  // BOM for Excel UTF-8 support
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function LedgerReportPage() {
  const today = useMemo(() => todayKeyIST(), []);
  const sevenAgo = useMemo(() => shiftDays(today, -6), [today]);
  const [from, setFrom] = useState<string>(sevenAgo);
  const [to, setTo] = useState<string>(today);

  const q = useQuery({
    queryKey: ["wallet", "ledger", "range", from, to],
    queryFn: () => getLedgerRange(from, to),
    enabled: !!from && !!to,
  });

  const data = q.data;

  function setQuick(days: number) {
    setFrom(shiftDays(today, -(days - 1)));
    setTo(today);
  }

  function exportCsv() {
    if (!data) return;
    const header = ["Date", "Description", "Type", "Reference", "Credit (₹)", "Debit (₹)", "Balance After (₹)", "Note"];
    const body = data.entries.map((e) => [
      format(new Date(e.createdAt), "dd-MM-yyyy HH:mm:ss"),
      LEDGER_LABEL[e.type] ?? e.type,
      e.direction.toUpperCase(),
      e.refCode ?? (e.refId != null ? `#${e.refId}` : ""),
      e.direction === "credit" ? (e.amountPaise / 100).toFixed(2) : "",
      e.direction === "debit" ? (e.amountPaise / 100).toFixed(2) : "",
      (e.balanceAfterPaise / 100).toFixed(2),
      e.note ?? "",
    ]);
    const totals = ["", "TOTAL", "", "", (data.summary.creditPaise / 100).toFixed(2), (data.summary.debitPaise / 100).toFixed(2), (data.summary.closingBalancePaise / 100).toFixed(2), ""];
    downloadCsv(`wallet-ledger-${from}_to_${to}.csv`, [header, ...body, totals]);
  }

  return (
    <div className="flex-1 py-6 px-4 bg-gray-50">
      <div className="container mx-auto max-w-6xl space-y-4">
        <Link href="/recharge#report"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Reports</Button></Link>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-purple-700" /> Ledger Report</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">From</span>
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" data-testid="input-ledger-from" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">To</span>
              <Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="w-40" data-testid="input-ledger-to" />
            </div>
            <Button size="sm" variant="outline" onClick={() => setQuick(1)} data-testid="btn-ledger-today">Today</Button>
            <Button size="sm" variant="outline" onClick={() => setQuick(7)} data-testid="btn-ledger-7d">Last 7 days</Button>
            <Button size="sm" variant="outline" onClick={() => setQuick(30)} data-testid="btn-ledger-30d">Last 30 days</Button>
            <Button size="sm" className="ml-auto" onClick={exportCsv} disabled={!data || data.entries.length === 0} data-testid="btn-ledger-export">
              <Download className="h-4 w-4 mr-2" />Export CSV
            </Button>
          </CardContent>
        </Card>

        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Opening Balance</div><div className="text-lg font-bold">{formatINR(data.summary.openingBalancePaise)}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Total Credit</div><div className="text-lg font-bold text-emerald-700">+ {formatINR(data.summary.creditPaise)}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Total Debit</div><div className="text-lg font-bold text-rose-700">− {formatINR(data.summary.debitPaise)}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Closing Balance</div><div className="text-lg font-bold">{formatINR(data.summary.closingBalancePaise)}</div></CardContent></Card>
          </div>
        )}

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-ledger">
                <thead className="bg-gray-100 text-left">
                  <tr>
                    <th className="p-3 whitespace-nowrap">Date</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right whitespace-nowrap">Credit</th>
                    <th className="p-3 text-right whitespace-nowrap">Debit</th>
                    <th className="p-3 text-right whitespace-nowrap">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {q.isLoading ? (
                    <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></td></tr>
                  ) : !data || data.entries.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No ledger entries in this range</td></tr>
                  ) : (
                    data.entries.map((e) => (
                      <tr key={e.id} className="border-b hover:bg-gray-50" data-testid={`ledger-row-${e.id}`}>
                        <td className="p-3 whitespace-nowrap text-xs">{format(new Date(e.createdAt), "dd MMM yy, HH:mm")}</td>
                        <td className="p-3">
                          <div className="font-medium">{LEDGER_LABEL[e.type] ?? e.type}</div>
                          <div className="text-xs text-muted-foreground">
                            {e.refCode ?? (e.refId != null ? `#${e.refId}` : "")}
                            {e.note ? <> · {e.note}</> : null}
                          </div>
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          {e.direction === "credit" ? (
                            <span className="text-emerald-700 font-semibold">+ {formatINR(e.amountPaise)}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          {e.direction === "debit" ? (
                            <span className="text-rose-700 font-semibold">− {formatINR(e.amountPaise)}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap font-medium">{formatINR(e.balanceAfterPaise)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {data && data.entries.length >= 5000 && (
              <div className="p-3 text-xs text-amber-700 bg-amber-50 border-t">
                <Badge variant="outline">Truncated</Badge> Showing first 5000 entries. Narrow the date range to see more.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
