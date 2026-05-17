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
import {
  Cloud,
  Droplets,
  Wind,
  Eye,
  Sunrise,
  Sunset,
  Thermometer,
  Search,
  Map as MapIcon,
} from "lucide-react";
import { IN_STATES } from "./in-states";
import { getDistricts, getTowns } from "./in-districts";

type WeatherResponse = {
  place: { name: string; state: string; country: string; lat: number; lon: number };
  current: {
    temp: number;
    feelsLike: number;
    humidity: number;
    pressure: number;
    windSpeed: number;
    windDeg: number | null;
    visibility: number | null;
    condition: string;
    description: string;
    icon: string;
    sunrise: number;
    sunset: number;
    observedAt: number;
  };
  aqi: {
    aqi: number;
    components: Record<string, number>;
  } | null;
};

const AQI_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: "Good", color: "bg-emerald-500" },
  2: { label: "Fair", color: "bg-lime-500" },
  3: { label: "Moderate", color: "bg-amber-500" },
  4: { label: "Poor", color: "bg-orange-500" },
  5: { label: "Very Poor", color: "bg-red-600" },
};

function fmtTime(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WeatherPanel() {
  // Cascading state → district → town selectors. Defaults preselect
  // Junagadh (Gujarat) so the first paint shows real weather data
  // without a click.
  const [stateSel, setStateSel] = useState<string>("Gujarat");
  const [districtSel, setDistrictSel] = useState<string>("Junagadh");
  const [townSel, setTownSel] = useState<string>("Junagadh");
  const [applied, setApplied] = useState<{ state: string; town: string }>({
    state: "Gujarat",
    town: "Junagadh",
  });

  const districts = useMemo(() => getDistricts(stateSel), [stateSel]);
  const towns = useMemo(() => getTowns(stateSel, districtSel), [stateSel, districtSel]);

  // Reset cascading children when parent changes.
  useEffect(() => {
    if (districts.length && !districts.includes(districtSel)) {
      setDistrictSel(districts[0] ?? "");
    }
  }, [districts, districtSel]);
  useEffect(() => {
    if (towns.length && !towns.includes(townSel)) {
      setTownSel(towns[0] ?? "");
    }
  }, [towns, townSel]);

  const { data, isLoading, error } = useQuery<WeatherResponse>({
    queryKey: ["live-data", "weather", applied.state, applied.town],
    queryFn: () => {
      const qs = new URLSearchParams({
        city: applied.town,
        state: applied.state,
      });
      return apiFetch<WeatherResponse>(`/api/live-data/weather?${qs.toString()}`);
    },
    enabled: applied.town.length > 0,
    staleTime: 5 * 60_000,
  });

  const apply = () => {
    setApplied({ state: stateSel, town: townSel });
  };

  // Windy embed coordinates: when we have a successful weather fetch,
  // center the map on that lat/lon so it visually matches the search.
  // Otherwise default to Gujarat (Ahmedabad).
  const mapLat = data?.place.lat ?? 23.0225;
  const mapLon = data?.place.lon ?? 72.5714;
  const windyUrl = `https://embed.windy.com/embed2.html?lat=${mapLat}&lon=${mapLon}&detailLat=${mapLat}&detailLon=${mapLon}&width=650&height=450&zoom=8&level=surface&overlay=wind&product=ecmwf&menu=&message=true&marker=true&calendar=&pressure=&type=map&location=coordinates&detail=&metricWind=km%2Fh&metricTemp=%C2%B0C&radarRange=-1`;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cloud className="h-4 w-4 text-sky-600" />
            <h3 className="font-semibold text-sm">Weather &amp; Air Quality</h3>
            <span className="text-[10px] text-muted-foreground ml-auto">
              Source: OpenWeatherMap
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <Select value={stateSel} onValueChange={setStateSel}>
              <SelectTrigger data-testid="weather-state-select">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {IN_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={districtSel}
              onValueChange={setDistrictSel}
              disabled={!districts.length}
            >
              <SelectTrigger data-testid="weather-district-select">
                <SelectValue placeholder={districts.length ? "District" : "No districts"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {districts.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={townSel} onValueChange={setTownSel} disabled={!towns.length}>
              <SelectTrigger data-testid="weather-town-select">
                <SelectValue placeholder={towns.length ? "Town" : "—"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {towns.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={apply} data-testid="weather-search-btn">
              <Search className="h-4 w-4 mr-1" /> Show Weather
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            Could not fetch weather for &quot;{applied.town}, {applied.state}&quot;. The
            OpenWeatherMap API may be temporarily unavailable, or this town name is not
            recognised — try a nearby major town.
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-xs text-muted-foreground">
                    {data.place.state ? `${data.place.state}, ` : ""}
                    {data.place.country}
                  </div>
                  <h4 className="text-2xl font-bold">{data.place.name}</h4>
                  <div className="text-xs text-muted-foreground capitalize mt-1">
                    {data.current.description}
                  </div>
                </div>
                {data.current.icon && (
                  <img
                    src={`https://openweathermap.org/img/wn/${data.current.icon}@2x.png`}
                    alt={data.current.condition}
                    className="h-16 w-16 -mt-2 -mr-2"
                  />
                )}
              </div>
              <div className="flex items-end gap-3">
                <div className="text-5xl font-black">{Math.round(data.current.temp)}°</div>
                <div className="text-xs text-muted-foreground pb-2">
                  Feels like {Math.round(data.current.feelsLike)}°C
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                <div className="flex items-center gap-2">
                  <Droplets className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-muted-foreground">Humidity:</span>
                  <span className="font-semibold">{data.current.humidity}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <Wind className="h-3.5 w-3.5 text-sky-500" />
                  <span className="text-muted-foreground">Wind:</span>
                  <span className="font-semibold">{data.current.windSpeed} m/s</span>
                </div>
                <div className="flex items-center gap-2">
                  <Thermometer className="h-3.5 w-3.5 text-rose-500" />
                  <span className="text-muted-foreground">Pressure:</span>
                  <span className="font-semibold">{data.current.pressure} hPa</span>
                </div>
                <div className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-muted-foreground">Visibility:</span>
                  <span className="font-semibold">
                    {data.current.visibility != null
                      ? `${(data.current.visibility / 1000).toFixed(1)} km`
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Sunrise className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-muted-foreground">Sunrise:</span>
                  <span className="font-semibold">{fmtTime(data.current.sunrise)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sunset className="h-3.5 w-3.5 text-orange-500" />
                  <span className="text-muted-foreground">Sunset:</span>
                  <span className="font-semibold">{fmtTime(data.current.sunset)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h4 className="font-semibold text-sm mb-3">Air Quality Index</h4>
              {data.aqi ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className={`h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white ${AQI_LABEL[data.aqi.aqi]?.color ?? "bg-gray-500"}`}
                    >
                      {data.aqi.aqi}
                    </div>
                    <div>
                      <div className="text-lg font-bold">
                        {AQI_LABEL[data.aqi.aqi]?.label ?? "Unknown"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        OpenWeatherMap AQI scale (1 = Good, 5 = Very Poor)
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    {Object.entries(data.aqi.components).map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-border/30 py-1">
                        <span className="text-muted-foreground uppercase">{k}</span>
                        <span className="font-semibold">{v.toFixed(2)} μg/m³</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Air quality data is not available for this location.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Windy interactive map — always visible so users can pan/zoom */}
      {/* across India even before searching a specific town. Centers on  */}
      {/* the searched coordinates after a successful weather lookup.    */}
      <Card>
        <CardContent className="p-0 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
            <MapIcon className="h-4 w-4 text-indigo-600" />
            <h3 className="font-semibold text-sm">Live Weather Map</h3>
            <span className="text-[10px] text-muted-foreground ml-auto">
              Source: Windy.com (wind, rain, clouds, temperature overlays)
            </span>
          </div>
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              key={`${mapLat}-${mapLon}`}
              src={windyUrl}
              title="Windy weather map"
              className="absolute inset-0 w-full h-full border-0"
              loading="lazy"
              allow="geolocation"
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
            />
          </div>
          <div className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border/40">
            Tip: use the layer buttons on the right edge of the map to switch between Wind,
            Rain, Temperature, Clouds and other overlays.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
