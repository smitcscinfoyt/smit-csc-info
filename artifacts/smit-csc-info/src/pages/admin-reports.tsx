import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Download, TrendingUp, TrendingDown, Wallet, Zap, Users, Percent } from "lucide-react";
import {
  adminReportsSummary,
  adminReportsTimeseries,
  adminReportsOperators,
  adminReportsUsers,
  adminReportsExportUrl,
  formatINR,
} from "@/lib/recharge-api";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, PieChart, Pie, Cell,
} from "recharts";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const TYPE_LABELS: Record<string, string> = { mobile: "Mobile", dth: "DTH", bill: "Bill" };
const PIE_COLORS = ["#7c3aed", "#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#ec4899"];

export default function AdminReports() {
  const { toast } = useToast();
  const [from, setFrom] = useState<string>(daysAgoIso(30));
  const [to, setTo] = useState<string>(todayIso());
  const [groupBy, setGroupBy] = useState<"day" | "month">("day");

  const summaryQ = useQuery({
    queryKey: ["admin", "reports", "summary", from, to],
    queryFn: () => adminReportsSummary(from, to),
  });
  const tsQ = useQuery({
    queryKey: ["admin", "reports", "ts", from, to, groupBy],
    queryFn: () => adminReportsTimeseries(from, to, groupBy),
  });
  const opQ = useQuery({
    queryKey: ["admin", "reports", "operators", from, to],
    queryFn: () => adminReportsOperators(from, to),
  });
  const userQ = useQuery({
    queryKey: ["admin", "reports", "users", from, to],
    queryFn: () => adminReportsUsers(from, to, 20),
  });

  const setRange = (days: number) => {
    setFrom(daysAgoIso(days));
    setTo(todayIso());
  };

  const downloadCsv = async (kind: "recharges" | "wallet") => {
    try {
      const url = adminReportsExportUrl(from, to, kind);
      // Use apiFetch only for auth header; fetch CSV manually since apiFetch parses JSON.
      const token = sessionStorage.getItem("auth_token");
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = `${kind}-${from}-to-${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      toast({ title: "Downloaded", description: `${kind === "wallet" ? "Wallet Ledger" : "Recharge"} CSV` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: String(e?.message ?? e) });
    }
  };

  const tsData = useMemo(() => {
    return (tsQ.data?.points ?? []).map((p) => ({
      bucket: p.bucket,
      count: p.count,
      success: p.successCount,
      failed: p.failedCount,
      amount: p.amountPaise / 100,
      commission: p.commissionPaise / 100,
    }));
  }, [tsQ.data]);

  const opChartData = useMemo(() => {
    const items = opQ.data?.items ?? [];
    return items.slice(0, 8).map((o) => ({
      name: o.operatorName,
      amount: o.amountPaise / 100,
      commission: o.commissionPaise / 100,
      count: o.count,
    }));
  }, [opQ.data]);

  const typeBreakdown = useMemo(() => {
    const items = opQ.data?.items ?? [];
    const map: Record<string, number> = {};
    for (const o of items) {
      map[o.type] = (map[o.type] ?? 0) + o.amountPaise;
    }
    return Object.entries(map).map(([type, paise]) => ({
      name: TYPE_LABELS[type] ?? type,
      value: paise / 100,
    }));
  }, [opQ.data]);

  const s = summaryQ.data?.recharges;
  const successRate = s && s.total > 0 ? (s.successCount / s.total) * 100 : 0;

  return (
    <div className="flex-1 py-8 px-4 bg-gray-50">
      <div className="container mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Link href="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Admin</Button></Link>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => downloadCsv("recharges")} data-testid="btn-export-recharges">
              <Download className="h-4 w-4 mr-2" />Recharge CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => downloadCsv("wallet")} data-testid="btn-export-wallet">
              <Download className="h-4 w-4 mr-2" />Wallet CSV
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Reports & Analytics</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap items-end">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">From</label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" data-testid="input-from" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">To</label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" data-testid="input-to" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Group by</label>
                <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "day" | "month")}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Daily</SelectItem>
                    <SelectItem value="month">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-1 ml-auto">
                <Button size="sm" variant="outline" onClick={() => setRange(7)}>7d</Button>
                <Button size="sm" variant="outline" onClick={() => setRange(30)}>30d</Button>
                <Button size="sm" variant="outline" onClick={() => setRange(90)}>90d</Button>
                <Button size="sm" variant="outline" onClick={() => setRange(365)}>1y</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total Sales" icon={<TrendingUp className="h-4 w-4 text-purple-600" />}
            value={s ? formatINR(s.totalAmountPaise) : "—"}
            sub={s ? `${s.successCount} successful` : ""}
            loading={summaryQ.isLoading}
          />
          <KpiCard
            label="Commission / Profit" icon={<Percent className="h-4 w-4 text-amber-600" />}
            value={s ? formatINR(s.totalCommissionPaise) : "—"}
            sub={s && s.totalAmountPaise > 0 ? `${((s.totalCommissionPaise / s.totalAmountPaise) * 100).toFixed(2)}% margin` : ""}
            loading={summaryQ.isLoading}
          />
          <KpiCard
            label="Success Rate" icon={<Zap className="h-4 w-4 text-green-600" />}
            value={s ? `${successRate.toFixed(1)}%` : "—"}
            sub={s ? `${s.total} total / ${s.failedCount} failed` : ""}
            loading={summaryQ.isLoading}
          />
          <KpiCard
            label="Wallet Top-up" icon={<Wallet className="h-4 w-4 text-blue-600" />}
            value={summaryQ.data ? formatINR(summaryQ.data.walletTopup.amountPaise) : "—"}
            sub={summaryQ.data ? `${summaryQ.data.walletTopup.count} top-ups` : ""}
            loading={summaryQ.isLoading}
          />
          <KpiCard
            label="Unique Users" icon={<Users className="h-4 w-4 text-indigo-600" />}
            value={s ? String(s.uniqueUsers) : "—"}
            sub={s ? "in this period" : ""}
            loading={summaryQ.isLoading}
          />
          <KpiCard
            label="Processing" icon={<Loader2 className="h-4 w-4 text-amber-600" />}
            value={s ? String(s.processingCount) : "—"}
            sub={s ? "pending + processing" : ""}
            loading={summaryQ.isLoading}
          />
          <KpiCard
            label="Refund" icon={<TrendingDown className="h-4 w-4 text-red-600" />}
            value={s ? formatINR(s.refundedAmountPaise) : "—"}
            sub={s ? `${s.refundedCount} refunds` : ""}
            loading={summaryQ.isLoading}
          />
          <KpiCard
            label="Failed" icon={<TrendingDown className="h-4 w-4 text-red-600" />}
            value={s ? String(s.failedCount) : "—"}
            sub={s && s.total > 0 ? `${((s.failedCount / s.total) * 100).toFixed(1)}%` : ""}
            loading={summaryQ.isLoading}
          />
        </div>

        {/* Time-series chart */}
        <Card>
          <CardHeader><CardTitle>{groupBy === "month" ? "Monthly" : "Daily"} Sales Trend</CardTitle></CardHeader>
          <CardContent>
            {tsQ.isLoading ? (
              <div className="h-64 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : tsData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={tsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any, n: any) => [n === "count" || n === "success" || n === "failed" ? v : `₹${Number(v).toLocaleString("en-IN")}`, n]} />
                  <Legend />
                  <Area type="monotone" dataKey="amount" name="Sales ₹" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="commission" name="Commission ₹" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.25} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Type pie */}
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle>By Type</CardTitle></CardHeader>
            <CardContent>
              {typeBreakdown.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-muted-foreground">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={typeBreakdown} dataKey="value" nameKey="name" outerRadius={80} label={(e) => `${e.name}`}>
                      {typeBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString("en-IN")}`} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Daily count */}
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Success vs Failed ({groupBy === "month" ? "Monthly" : "Daily"})</CardTitle></CardHeader>
            <CardContent>
              {tsData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-muted-foreground">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={tsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="success" name="Success" fill="#10b981" stackId="s" />
                    <Bar dataKey="failed" name="Failed" fill="#ef4444" stackId="s" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tables */}
        <Tabs defaultValue="operators">
          <TabsList>
            <TabsTrigger value="operators">By Operator</TabsTrigger>
            <TabsTrigger value="users">Top Users</TabsTrigger>
          </TabsList>

          <TabsContent value="operators">
            <Card>
              <CardContent className="pt-6">
                {opQ.isLoading ? (
                  <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>
                ) : (opQ.data?.items ?? []).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No data</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="table-operators">
                      <thead className="bg-gray-100 text-left">
                        <tr>
                          <th className="p-2">Type</th><th className="p-2">Operator</th>
                          <th className="p-2 text-right">Total</th><th className="p-2 text-right">Success</th>
                          <th className="p-2 text-right">Failed</th><th className="p-2 text-right">Success %</th>
                          <th className="p-2 text-right">Sales</th><th className="p-2 text-right">Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(opQ.data?.items ?? []).map((o, i) => (
                          <tr key={`${o.type}-${o.operatorCode}-${i}`} className="border-b hover:bg-gray-50">
                            <td className="p-2 uppercase font-medium">{TYPE_LABELS[o.type] ?? o.type}</td>
                            <td className="p-2">{o.operatorName}</td>
                            <td className="p-2 text-right">{o.count}</td>
                            <td className="p-2 text-right text-green-700">{o.successCount}</td>
                            <td className="p-2 text-right text-red-700">{o.failedCount}</td>
                            <td className="p-2 text-right">{(o.successRate * 100).toFixed(1)}%</td>
                            <td className="p-2 text-right font-semibold">{formatINR(o.amountPaise)}</td>
                            <td className="p-2 text-right text-amber-700">{formatINR(o.commissionPaise)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardContent className="pt-6">
                {userQ.isLoading ? (
                  <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>
                ) : (userQ.data?.items ?? []).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No data</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="table-users">
                      <thead className="bg-gray-100 text-left">
                        <tr>
                          <th className="p-2">User</th><th className="p-2">Mobile</th>
                          <th className="p-2 text-right">Total Recharges</th><th className="p-2 text-right">Success</th>
                          <th className="p-2 text-right">Sales</th><th className="p-2 text-right">Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(userQ.data?.items ?? []).map((u) => (
                          <tr key={u.userId} className="border-b hover:bg-gray-50">
                            <td className="p-2"><div className="font-medium">{u.name ?? "—"}</div><div className="text-xs text-muted-foreground">{u.email}</div></td>
                            <td className="p-2 font-mono text-xs">{u.mobile ?? "—"}</td>
                            <td className="p-2 text-right">{u.count}</td>
                            <td className="p-2 text-right text-green-700">{u.successCount}</td>
                            <td className="p-2 text-right font-semibold">{formatINR(u.amountPaise)}</td>
                            <td className="p-2 text-right text-amber-700">{formatINR(u.commissionPaise)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, icon, loading }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`kpi-${label}`}>
          {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : value}
        </div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

void apiFetch;
