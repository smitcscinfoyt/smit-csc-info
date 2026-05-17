import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Waves, RefreshCw } from "lucide-react";
import { IN_STATES } from "./in-states";

type WaterRecord = {
  state: string;
  reservoir: string;
  district: string;
  basin: string;
  frl: string | number;
  liveCapacity: string | number;
  currentLevel: string | number;
  percentFull: string | number;
  date: string;
  raw: Record<string, string>;
};

type WaterResponse = {
  total: number;
  count: number;
  records: WaterRecord[];
};

const ALL_STATES = "__all__";

function pctNum(s: string | number): number | null {
  if (s === "" || s == null) return null;
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Three-tier color coding requested by the user:
//   < 70%  → green  (normal storage, safe)
//   70–90% → yellow (medium / approaching capacity)
//   ≥ 90%  → red    (overflow risk)
function pctColor(pct: number | null): { bar: string; chip: string; label: string } {
  if (pct == null) {
    return { bar: "bg-gray-300", chip: "bg-gray-100 text-gray-600", label: "—" };
  }
  if (pct >= 90) {
    return { bar: "bg-red-500", chip: "bg-red-100 text-red-700", label: "Overflow" };
  }
  if (pct >= 70) {
    return { bar: "bg-amber-400", chip: "bg-amber-100 text-amber-800", label: "Medium" };
  }
  return { bar: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700", label: "Normal" };
}

export function WaterPanel() {
  const [stateInput, setStateInput] = useState<string>(ALL_STATES);
  const [applied, setApplied] = useState<string>("");

  const { data, isLoading, isFetching, error, refetch } = useQuery<WaterResponse>({
    queryKey: ["live-data", "water", applied],
    queryFn: () => {
      const qs = new URLSearchParams({ limit: "100" });
      if (applied) qs.set("state", applied);
      return apiFetch<WaterResponse>(`/api/live-data/water?${qs.toString()}`);
    },
    staleTime: 10 * 60_000,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Waves className="h-4 w-4 text-blue-600" />
            <h3 className="font-semibold text-sm">Reservoir &amp; Water Levels</h3>
            <span className="text-[10px] text-muted-foreground ml-auto">
              Source: data.gov.in / CWC
            </span>
          </div>
          <div
            data-testid="water-live-coming-soon"
            className="mb-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
            </span>
            <span>
              <strong>Live water-level (Normal / Medium / Overflow)</strong> — Coming soon.
              Below cards show reservoir capacity reference only.
            </span>
          </div>
          <div className="flex gap-2">
            <Select
              value={stateInput}
              onValueChange={(v) => {
                setStateInput(v);
                setApplied(v === ALL_STATES ? "" : v);
              }}
            >
              <SelectTrigger className="flex-1" data-testid="water-state-select">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={ALL_STATES}>All States</SelectItem>
                {IN_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              title="Refresh"
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            Could not fetch reservoir data. The upstream dataset may have changed format —
            please try a different state or refresh later.
          </CardContent>
        </Card>
      )}

      {!isLoading && data && data.records.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No reservoir records returned for this filter.
          </CardContent>
        </Card>
      )}

      {data && data.records.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span className="text-muted-foreground">Color legend:</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded bg-emerald-500" /> Normal (&lt; 70%)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded bg-amber-400" /> Medium (70–90%)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded bg-red-500" /> Overflow (≥ 90%)
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.records.map((r, i) => {
            const pct = pctNum(r.percentFull);
            const c = pctColor(pct);
            return (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-sm truncate">
                        {r.reservoir || "Unnamed Reservoir"}
                      </h4>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {[r.district, r.state].filter(Boolean).join(" · ") || r.basin || "—"}
                      </div>
                    </div>
                    {pct != null ? (
                      <div className="text-right">
                        <span className="text-sm font-bold tabular-nums block">
                          {pct.toFixed(1)}%
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.chip}`}>
                          {c.label}
                        </span>
                      </div>
                    ) : (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.chip}`}>
                        Capacity only
                      </span>
                    )}
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
                    <div
                      className={`h-full ${c.bar} transition-all`}
                      style={{ width: pct != null ? `${Math.min(100, Math.max(0, pct))}%` : "100%" }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    {r.frl !== "" && r.frl != null && (
                      <>
                        <span className="text-muted-foreground">FRL</span>
                        <span className="text-right font-medium">{r.frl} m</span>
                      </>
                    )}
                    {r.liveCapacity !== "" && r.liveCapacity != null && (
                      <>
                        <span className="text-muted-foreground">Live Capacity</span>
                        <span className="text-right font-medium">{r.liveCapacity} BCM</span>
                      </>
                    )}
                    {r.currentLevel !== "" && r.currentLevel != null && (
                      <>
                        <span className="text-muted-foreground">Current</span>
                        <span className="text-right font-medium">{r.currentLevel}</span>
                      </>
                    )}
                    {r.basin && (
                      <>
                        <span className="text-muted-foreground">Basin</span>
                        <span className="text-right font-medium truncate">{r.basin}</span>
                      </>
                    )}
                    {r.date && (
                      <>
                        <span className="text-muted-foreground">As of</span>
                        <span className="text-right font-medium">{r.date}</span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            Note: the public CWC dataset on data.gov.in currently exposes
            reservoir <strong>capacity</strong> (FRL + live capacity) rather than the
            day-to-day storage percentage. Color tiers (Normal / Medium / Overflow) light
            up automatically once a per-day storage % is available for a reservoir.
          </p>
        </>
      )}
    </div>
  );
}
