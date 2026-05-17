import { useEffect, useMemo, useState } from "react";
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
import { Sprout, Search, RefreshCw, Languages } from "lucide-react";
import { IN_STATES } from "./in-states";
import { useLanguage } from "@/lib/i18n";
import {
  MANDI_UI,
  trState,
  trDistrict,
  trMarket,
  trCommodity,
  trVariety,
  type MandiLang,
} from "./mandi-i18n";

// Agmarknet returns arrival_date as "DD/MM/YYYY". Reformat to short locale-aware
// "DD MMM" so the column fits inside the table viewport on all screens.
const MONTHS_SHORT: Record<MandiLang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  hi: ["जन", "फर", "मार्च", "अप्रै", "मई", "जून", "जुल", "अग", "सित", "अक्टू", "नव", "दिस"],
  gu: ["જાન્યુ", "ફેબ્રુ", "માર્ચ", "એપ્રિ", "મે", "જૂન", "જુલા", "ઓગ", "સપ્ટે", "ઓક્ટો", "નવે", "ડિસે"],
};

function formatArrivalDate(raw: string, lang: MandiLang): string {
  if (!raw) return "";
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return raw;
  const day = parseInt(m[1], 10);
  const monthIdx = parseInt(m[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11 || isNaN(day)) return raw;
  const months = MONTHS_SHORT[lang] ?? MONTHS_SHORT.en;
  return `${day} ${months[monthIdx]}`;
}

type MandiRecord = {
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  grade: string;
  arrivalDate: string;
  minPrice: string;
  maxPrice: string;
  modalPrice: string;
};

type MandiResponse = {
  total: number;
  count: number;
  records: MandiRecord[];
};

type MandiOptions = {
  districts: string[];
  commodities: string[];
  markets: string[];
};

const ANY = "__any__";

export function MandiPanel() {
  const { language } = useLanguage();
  const initialLang: MandiLang =
    language === "hi" || language === "gu" || language === "en"
      ? (language as MandiLang)
      : "gu";
  const [lang, setLang] = useState<MandiLang>(initialLang);
  const ui = MANDI_UI[lang];

  const [stateSel, setStateSel] = useState<string>("Gujarat");
  const [marketSel, setMarketSel] = useState<string>(ANY);
  const [commoditySel, setCommoditySel] = useState<string>(ANY);
  const [applied, setApplied] = useState<{
    state: string;
    market: string;
    commodity: string;
  }>({ state: "Gujarat", market: "", commodity: "" });

  // Cascading options endpoint: districts + commodities for the
  // selected state, derived live from today's mandi records and
  // cached server-side for 15 minutes.
  const { data: opts, isLoading: optsLoading } = useQuery<MandiOptions>({
    queryKey: ["live-data", "mandi-options", stateSel],
    queryFn: () =>
      apiFetch<MandiOptions>(
        `/api/live-data/mandi/options?state=${encodeURIComponent(stateSel)}`,
      ),
    enabled: !!stateSel,
    staleTime: 15 * 60_000,
  });

  const markets = useMemo(() => opts?.markets ?? [], [opts]);
  const commodities = useMemo(() => opts?.commodities ?? [], [opts]);

  // Reset child selectors if the previously chosen value isn't in the
  // new state's option list.
  useEffect(() => {
    if (marketSel !== ANY && !markets.includes(marketSel)) setMarketSel(ANY);
  }, [markets, marketSel]);
  useEffect(() => {
    if (commoditySel !== ANY && !commodities.includes(commoditySel)) setCommoditySel(ANY);
  }, [commodities, commoditySel]);

  const { data, isLoading, isFetching, error, refetch } = useQuery<MandiResponse>({
    queryKey: ["live-data", "mandi", applied],
    queryFn: () => {
      const qs = new URLSearchParams({ limit: "100" });
      if (applied.state) qs.set("state", applied.state);
      if (applied.market) qs.set("market", applied.market);
      if (applied.commodity) qs.set("commodity", applied.commodity);
      return apiFetch<MandiResponse>(`/api/live-data/mandi?${qs.toString()}`);
    },
    staleTime: 5 * 60_000,
  });

  const apply = () => {
    setApplied({
      state: stateSel,
      market: marketSel === ANY ? "" : marketSel,
      commodity: commoditySel === ANY ? "" : commoditySel,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Sprout className="h-4 w-4 text-emerald-600" />
            <h3 className="font-semibold text-sm">{ui.title}</h3>
            <span className="text-[10px] text-muted-foreground">
              {ui.source}
            </span>
            <div
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/60 p-0.5"
              role="group"
              aria-label={ui.langLabel}
            >
              <Languages className="h-3.5 w-3.5 text-indigo-600 ml-1.5" />
              {(["en", "hi", "gu"] as const).map((code) => {
                const label = code === "en" ? "EN" : code === "hi" ? "हिन्दी" : "ગુજરાતી";
                const active = lang === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLang(code)}
                    data-testid={`mandi-lang-${code}`}
                    className={[
                      "px-2.5 py-1 rounded-md text-[11px] font-bold transition-all",
                      active
                        ? "bg-gradient-to-r from-indigo-600 to-violet-700 text-white shadow-sm"
                        : "text-indigo-700 hover:bg-white",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <Select value={stateSel} onValueChange={setStateSel}>
              <SelectTrigger data-testid="mandi-state-select">
                <SelectValue placeholder={ui.state}>
                  {trState(stateSel, lang)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {IN_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {trState(s, lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={marketSel}
              onValueChange={setMarketSel}
              disabled={optsLoading}
            >
              <SelectTrigger data-testid="mandi-market-select">
                <SelectValue
                  placeholder={optsLoading ? ui.loading : ui.allMandis}
                />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={ANY}>{ui.allMandis}</SelectItem>
                {markets.map((m) => (
                  <SelectItem key={m} value={m}>
                    {trMarket(m, lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={commoditySel}
              onValueChange={setCommoditySel}
              disabled={optsLoading}
            >
              <SelectTrigger data-testid="mandi-commodity-select">
                <SelectValue
                  placeholder={optsLoading ? ui.loading : ui.allCommodities}
                >
                  {commoditySel === ANY ? ui.allCommodities : trCommodity(commoditySel, lang)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={ANY}>{ui.allCommodities}</SelectItem>
                {commodities.map((c) => (
                  <SelectItem key={c} value={c}>
                    {trCommodity(c, lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button onClick={apply} className="flex-1" data-testid="mandi-search-btn">
                <Search className="h-4 w-4 mr-1" /> {ui.search}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetch()}
                title={ui.refresh}
                disabled={isFetching}
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
          {!optsLoading && opts && markets.length === 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {ui.noMarketsForState(trState(stateSel, lang))}
            </p>
          )}
        </CardContent>
      </Card>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            {ui.failedLoad}
          </CardContent>
        </Card>
      )}

      {!isLoading && data && data.records.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {ui.noRecords}
          </CardContent>
        </Card>
      )}

      {data && data.records.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm sm:text-base">
              <thead className="bg-indigo-50/80 sticky top-0">
                <tr className="text-left">
                  <th className="px-4 py-3 font-bold text-indigo-900 whitespace-nowrap">{ui.thCommodity}</th>
                  <th className="px-4 py-3 font-bold text-indigo-900 whitespace-nowrap">{ui.thMarket}</th>
                  <th className="px-4 py-3 font-bold text-indigo-900 whitespace-nowrap">{ui.thDistrict}</th>
                  <th className="px-4 py-3 font-bold text-indigo-900 whitespace-nowrap">{ui.thState}</th>
                  <th className="px-4 py-3 font-bold text-indigo-900 text-right whitespace-nowrap">{ui.thMin}</th>
                  <th className="px-4 py-3 font-bold text-indigo-900 text-right whitespace-nowrap">{ui.thMax}</th>
                  <th className="px-4 py-3 font-bold text-indigo-900 text-right whitespace-nowrap">{ui.thModal}</th>
                  <th className="px-4 py-3 font-bold text-indigo-900 whitespace-nowrap">{ui.thDate}</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((r, i) => (
                  <tr key={i} className="border-t border-border/40 hover:bg-indigo-50/40">
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {trCommodity(r.commodity, lang)}
                      {r.variety && (
                        <span className="text-muted-foreground font-normal"> · {trVariety(r.variety, lang)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{trMarket(r.market, lang)}</td>
                    <td className="px-4 py-3">{trDistrict(r.district, lang)}</td>
                    <td className="px-4 py-3">{trState(r.state, lang)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.minPrice}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.maxPrice}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700 tabular-nums">
                      {r.modalPrice}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatArrivalDate(r.arrivalDate, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 text-xs sm:text-sm text-muted-foreground border-t border-border/40 bg-muted/20">
              {ui.showing(data.records.length, data.total)}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
