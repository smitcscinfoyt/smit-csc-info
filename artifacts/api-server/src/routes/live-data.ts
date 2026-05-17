/**
 * Live Data Dashboard proxy routes.
 *
 * Three public datasets are surfaced to the frontend:
 *   - GET /api/live-data/mandi    → data.gov.in daily mandi prices
 *   - GET /api/live-data/weather  → OpenWeatherMap current + AQI by city
 *   - GET /api/live-data/water    → data.gov.in reservoir storage
 *
 * Same security rationale as routes/pixabay.ts: never expose
 * DATA_GOV_IN_API_KEY / OPENWEATHER_API_KEY to the browser. Vite would
 * bake any VITE_* env into the public bundle. All upstream calls go
 * through this server-side proxy with a per-IP token-bucket throttle.
 */

import { Router, type IRouter, type Request } from "express";

const router: IRouter = Router();

const DATA_GOV_BASE = "https://api.data.gov.in/resource";
const MANDI_RESOURCE = "9ef84268-d588-465a-a308-a864a43d0070";
// CWC "Live Storage at Full Reservoir Level (FRL) of 146 Important
// Reservoirs" — the only active reservoir dataset on data.gov.in at the
// time of writing. All the daily-snapshot resources (per-month CWC /
// Gujarat reports) are marked active=0 and return empty payloads.
// Field shape verified live: { sl__no_, name_of_reservoir, state,
// frl__in_mts__, live_cap__at_frl__in_bcm_ }.
const RESERVOIR_RESOURCE = "97c440ab-1412-4915-aa93-cfe8139ad7e7";
const OWM_BASE = "https://api.openweathermap.org";

function getDataGovKey(): string | null {
  const k = process.env.DATA_GOV_IN_API_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

function getOwmKey(): string | null {
  const k = process.env.OPENWEATHER_API_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

// Per-IP throttle: 30 req/min per IP, mirroring pixabay.ts. Both
// upstreams have generous limits (data.gov.in: ~1000/day per key,
// OpenWeatherMap free: 60/min) so this protects the shared key
// without restricting honest users.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true };
  }
  if (b.count >= RATE_MAX) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true };
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of buckets) if (b.resetAt <= now) buckets.delete(ip);
}, RATE_WINDOW_MS).unref();

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function checkLimit(req: Request, res: import("express").Response): boolean {
  const rl = rateLimit(clientIp(req));
  if (!rl.ok) {
    if (rl.retryAfter) res.setHeader("Retry-After", String(rl.retryAfter));
    res.status(429).json({ error: "rate_limited", retryAfter: rl.retryAfter });
    return false;
  }
  return true;
}

// ─── Mandi cascading options (state → districts + commodities) ──────────
// Derived live from the mandi resource itself: we pull a wide page of
// today's records for the selected state and dedupe district + commodity
// names. Cached in-memory with a 15-minute TTL to keep upstream quota
// usage minimal even if many users open the panel.
type MandiOptions = { districts: string[]; commodities: string[]; markets: string[] };
const mandiOptionsCache = new Map<string, { at: number; data: MandiOptions }>();
const MANDI_OPTIONS_TTL_MS = 15 * 60_000;

router.get("/live-data/mandi/options", async (req, res) => {
  const apiKey = getDataGovKey();
  if (!apiKey) {
    return res.status(503).json({
      error: "data_gov_not_configured",
      message: "Set DATA_GOV_IN_API_KEY on the server.",
    });
  }
  if (!checkLimit(req, res)) return;

  const state = String(req.query.state ?? "").trim();
  if (!state) return res.status(400).json({ error: "missing_state" });

  const cacheKey = state.toLowerCase();
  const cached = mandiOptionsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < MANDI_OPTIONS_TTL_MS) {
    return res.json(cached.data);
  }

  const url = new URL(`${DATA_GOV_BASE}/${MANDI_RESOURCE}`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "500");
  url.searchParams.set("filters[state]", state);

  try {
    const upstream = await fetch(url.toString());
    if (!upstream.ok) {
      return res.status(502).json({ error: "upstream_error", status: upstream.status });
    }
    const data = (await upstream.json()) as {
      records?: Array<{ district?: string; commodity?: string; market?: string }>;
    };
    const districts = Array.from(
      new Set((data.records ?? []).map((r) => r.district?.trim()).filter(Boolean) as string[]),
    ).sort();
    const commodities = Array.from(
      new Set((data.records ?? []).map((r) => r.commodity?.trim()).filter(Boolean) as string[]),
    ).sort();
    const markets = Array.from(
      new Set((data.records ?? []).map((r) => r.market?.trim()).filter(Boolean) as string[]),
    ).sort();
    const result: MandiOptions = { districts, commodities, markets };
    mandiOptionsCache.set(cacheKey, { at: Date.now(), data: result });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "mandi options fetch failed");
    res.status(502).json({ error: "fetch_failed", message: (err as Error).message });
  }
});

// ─── Mandi prices ────────────────────────────────────────────────────────
router.get("/live-data/mandi", async (req, res) => {
  const apiKey = getDataGovKey();
  if (!apiKey) {
    return res.status(503).json({
      error: "data_gov_not_configured",
      message: "Set DATA_GOV_IN_API_KEY on the server.",
    });
  }
  if (!checkLimit(req, res)) return;

  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const state = String(req.query.state ?? "").trim();
  const district = String(req.query.district ?? "").trim();
  const commodity = String(req.query.commodity ?? "").trim();
  const market = String(req.query.market ?? "").trim();

  const url = new URL(`${DATA_GOV_BASE}/${MANDI_RESOURCE}`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  if (state) url.searchParams.set("filters[state]", state);
  if (district) url.searchParams.set("filters[district]", district);
  if (commodity) url.searchParams.set("filters[commodity]", commodity);
  if (market) url.searchParams.set("filters[market]", market);

  try {
    const upstream = await fetch(url.toString());
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      req.log.warn({ status: upstream.status, body: text.slice(0, 300) }, "mandi upstream error");
      return res.status(502).json({ error: "upstream_error", status: upstream.status });
    }
    const data = (await upstream.json()) as {
      total?: number;
      count?: number;
      records?: Array<Record<string, string>>;
    };
    res.json({
      total: data.total ?? 0,
      count: data.count ?? (data.records?.length ?? 0),
      records: (data.records ?? []).map((r) => ({
        state: r.state ?? "",
        district: r.district ?? "",
        market: r.market ?? "",
        commodity: r.commodity ?? "",
        variety: r.variety ?? "",
        grade: r.grade ?? "",
        arrivalDate: r.arrival_date ?? "",
        minPrice: r.min_price ?? "",
        maxPrice: r.max_price ?? "",
        modalPrice: r.modal_price ?? "",
      })),
    });
  } catch (err) {
    req.log.error({ err }, "mandi fetch failed");
    res.status(502).json({ error: "fetch_failed", message: (err as Error).message });
  }
});

// ─── Weather + AQI ───────────────────────────────────────────────────────
router.get("/live-data/weather", async (req, res) => {
  const apiKey = getOwmKey();
  if (!apiKey) {
    return res.status(503).json({
      error: "openweather_not_configured",
      message: "Set OPENWEATHER_API_KEY on the server.",
    });
  }
  if (!checkLimit(req, res)) return;

  const city = String(req.query.city ?? "").trim();
  const stateQ = String(req.query.state ?? "").trim();
  const country = String(req.query.country ?? "IN").trim();
  if (!city) return res.status(400).json({ error: "missing_city" });

  try {
    // Geocode city → lat/lon (free tier endpoint). When a state is
    // supplied we pass it to OWM to disambiguate same-named towns
    // (e.g. "Junagadh" vs other places).
    const geoUrl = new URL(`${OWM_BASE}/geo/1.0/direct`);
    const qParts = [city, stateQ, country].filter(Boolean);
    geoUrl.searchParams.set("q", qParts.join(","));
    geoUrl.searchParams.set("limit", "1");
    geoUrl.searchParams.set("appid", apiKey);

    const geoResp = await fetch(geoUrl.toString());
    if (!geoResp.ok) {
      return res.status(502).json({ error: "geocode_failed", status: geoResp.status });
    }
    const geo = (await geoResp.json()) as Array<{
      name: string;
      lat: number;
      lon: number;
      country: string;
      state?: string;
    }>;
    if (!geo.length) return res.status(404).json({ error: "city_not_found" });

    const place = geo[0]!;
    const { lat, lon } = place;

    // Fetch current weather + AQI in parallel.
    const wUrl = new URL(`${OWM_BASE}/data/2.5/weather`);
    wUrl.searchParams.set("lat", String(lat));
    wUrl.searchParams.set("lon", String(lon));
    wUrl.searchParams.set("units", "metric");
    wUrl.searchParams.set("appid", apiKey);

    const aqiUrl = new URL(`${OWM_BASE}/data/2.5/air_pollution`);
    aqiUrl.searchParams.set("lat", String(lat));
    aqiUrl.searchParams.set("lon", String(lon));
    aqiUrl.searchParams.set("appid", apiKey);

    const [wResp, aqiResp] = await Promise.all([fetch(wUrl.toString()), fetch(aqiUrl.toString())]);
    if (!wResp.ok) {
      return res.status(502).json({ error: "weather_failed", status: wResp.status });
    }

    const w = (await wResp.json()) as {
      main: { temp: number; feels_like: number; humidity: number; pressure: number };
      weather: Array<{ id: number; main: string; description: string; icon: string }>;
      wind: { speed: number; deg?: number };
      visibility?: number;
      sys: { sunrise: number; sunset: number; country?: string };
      dt: number;
      name: string;
    };

    let aqi: {
      aqi: number;
      components: Record<string, number>;
    } | null = null;
    if (aqiResp.ok) {
      const aqiData = (await aqiResp.json()) as {
        list: Array<{ main: { aqi: number }; components: Record<string, number> }>;
      };
      if (aqiData.list?.[0]) {
        aqi = { aqi: aqiData.list[0].main.aqi, components: aqiData.list[0].components };
      }
    }

    res.json({
      place: {
        name: place.name,
        state: place.state ?? "",
        country: place.country,
        lat,
        lon,
      },
      current: {
        temp: w.main.temp,
        feelsLike: w.main.feels_like,
        humidity: w.main.humidity,
        pressure: w.main.pressure,
        windSpeed: w.wind.speed,
        windDeg: w.wind.deg ?? null,
        visibility: w.visibility ?? null,
        condition: w.weather[0]?.main ?? "",
        description: w.weather[0]?.description ?? "",
        icon: w.weather[0]?.icon ?? "",
        sunrise: w.sys.sunrise,
        sunset: w.sys.sunset,
        observedAt: w.dt,
      },
      aqi,
    });
  } catch (err) {
    req.log.error({ err }, "weather fetch failed");
    res.status(502).json({ error: "fetch_failed", message: (err as Error).message });
  }
});

// ─── Reservoir / water levels ────────────────────────────────────────────
router.get("/live-data/water", async (req, res) => {
  const apiKey = getDataGovKey();
  if (!apiKey) {
    return res.status(503).json({
      error: "data_gov_not_configured",
      message: "Set DATA_GOV_IN_API_KEY on the server.",
    });
  }
  if (!checkLimit(req, res)) return;

  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const state = String(req.query.state ?? "").trim();

  const url = new URL(`${DATA_GOV_BASE}/${RESERVOIR_RESOURCE}`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  if (state) url.searchParams.set("filters[state]", state);

  try {
    const upstream = await fetch(url.toString());
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      req.log.warn({ status: upstream.status, body: text.slice(0, 300) }, "water upstream error");
      return res.status(502).json({ error: "upstream_error", status: upstream.status });
    }
    const data = (await upstream.json()) as {
      total?: number;
      count?: number;
      records?: Array<Record<string, string>>;
    };
    // The reservoir dataset has changing column names across years; pass
    // the raw record through alongside a few well-known fields so the UI
    // can render whatever's available without us breaking on schema drift.
    res.json({
      total: data.total ?? 0,
      count: data.count ?? (data.records?.length ?? 0),
      // Map the CWC field names + a few defensive fallbacks for any
      // future resource swap. The current dataset is a *capacity*
      // snapshot (no daily fluctuating level), so percentFull stays
      // empty and the UI gracefully omits the gauge bar.
      records: (data.records ?? []).map((r) => ({
        state: r.state ?? r.state_name ?? "",
        reservoir: r.name_of_reservoir ?? r.reservoir_name ?? r.reservoir ?? "",
        district: r.district ?? "",
        basin: r.basin ?? r.river_basin ?? "",
        // FRL = Full Reservoir Level in metres
        frl: r.frl__in_mts__ ?? r.full_reservoir_level ?? r.frl ?? "",
        // Live capacity at FRL in BCM (Billion Cubic Metres)
        liveCapacity: r.live_cap__at_frl__in_bcm_ ?? r.live_capacity ?? "",
        currentLevel: r.current_level ?? r.live_storage ?? r.present_storage ?? "",
        percentFull: r.percentage_full ?? r.percent_full ?? r.storage_percentage ?? "",
        date: r.date ?? r.as_on_date ?? r.date_of_observation ?? "",
        raw: r,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "water fetch failed");
    res.status(502).json({ error: "fetch_failed", message: (err as Error).message });
  }
});

export default router;
