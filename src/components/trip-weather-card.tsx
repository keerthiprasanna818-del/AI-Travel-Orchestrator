import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CloudRain, Loader2, Sun } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getTripWeather } from "@/lib/weather.functions";
import {
  formatTempRange,
  formatWeatherDate,
  weatherLabel,
  type TripWeather,
} from "@/lib/weather";

type Props = {
  destination: string;
  latitude?: number | null;
  longitude?: number | null;
  departureDate: string;
  returnDate: string;
  /** Verified snapshot stored on the plan, used until the live call resolves. */
  initial?: TripWeather | null;
};

/**
 * Weather panel for the dashboard. Reads only from the backend
 * `get-trip-weather` function — never from AI-generated weather.
 * Visual design intentionally mirrors the surrounding assistant cards.
 */
export function TripWeatherCard({
  destination,
  latitude,
  longitude,
  departureDate,
  returnDate,
  initial = null,
}: Props) {
  const fetchWeather = useServerFn(getTripWeather);
  const [weather, setWeather] = useState<TripWeather | null>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWeather({
        data: {
          destination,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          departureDate,
          returnDate,
        },
      });
      if (res.ok) setWeather(res.weather);
      else setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Weather service is unavailable");
    } finally {
      setLoading(false);
    }
  }, [fetchWeather, destination, latitude, longitude, departureDate, returnDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const label = weather ? weatherLabel(weather.dataType) : null;

  return (
    <div className="glass lift rounded-[22px] p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
          {weather?.dataType === "seasonal" ? (
            <CloudRain className="h-4 w-4 text-warning" />
          ) : (
            <Sun className="h-4 w-4 text-warning" />
          )}{" "}
          Weather
        </h3>
        {label ? (
          <span className="shrink-0 rounded-full border border-warning/50 bg-warning/12 px-2 py-0.5 text-[11px] font-medium text-warning">
            {label}
          </span>
        ) : null}
      </div>

      {loading && !weather ? (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading weather…
        </p>
      ) : null}

      {error && !weather ? (
        <div className="mt-3 space-y-2">
          <p className="inline-flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Weather provider failed: {error}</span>
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !error && weather && weather.days.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No weather data available for these dates.</p>
      ) : null}

      {weather?.fallbackNotice ? (
        <p className="mt-3 inline-flex items-start gap-2 text-[11px] text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{weather.fallbackNotice}</span>
        </p>
      ) : null}

      {weather?.current ? (
        <div className="mt-3 flex items-start gap-3">
          {weather.current.iconUrl ? (
            <img
              src={weather.current.iconUrl}
              alt={weather.current.condition}
              loading="lazy"
              className="h-10 w-10 shrink-0 object-contain"
            />
          ) : null}
          <p className="text-sm">
            <span className="text-foreground">
              Now · {Math.round(weather.current.maxTemp)}°C · {weather.current.condition}
            </span>
            <span className="text-muted-foreground">
              {weather.current.feelsLike === null
                ? ""
                : ` · feels like ${Math.round(weather.current.feelsLike)}°C`}
              {weather.current.humidity === null ? "" : ` · ${Math.round(weather.current.humidity)}% humidity`}
              {weather.current.windSpeed === null ? "" : ` · ${Math.round(weather.current.windSpeed)} km/h wind`}
              {weather.current.precipitationProbability === null
                ? ""
                : ` · ${Math.round(weather.current.precipitationProbability)}% chance of rain`}
            </span>
          </p>
        </div>
      ) : null}


      {weather && weather.days.length ? (
        <ul className="mt-3 space-y-2 text-sm">
          {weather.days.map((d) => (
            <li key={d.date} className="text-muted-foreground">
              <div className="flex justify-between gap-2">
                <span className="inline-flex items-center gap-1.5">
                  {d.iconUrl ? (
                    <img
                      src={d.iconUrl}
                      alt={d.condition}
                      loading="lazy"
                      className="h-5 w-5 shrink-0 object-contain"
                    />
                  ) : null}
                  {formatWeatherDate(d.date)}
                </span>
                <span className="text-right text-foreground">
                  {formatTempRange(d)} · {d.condition}
                </span>
              </div>

              <div className="mt-0.5 flex flex-wrap justify-between gap-x-2 text-[11px]">
                <span>
                  {d.precipitationProbability === null
                    ? "Rain n/a"
                    : `Rain ${Math.round(d.precipitationProbability)}%`}
                  {d.humidity === null ? "" : ` · Humidity ${Math.round(d.humidity)}%`}
                  {d.windSpeed === null ? "" : ` · Wind ${Math.round(d.windSpeed)} km/h`}
                </span>
                <span>
                  {d.sunrise && d.sunset ? `↑ ${d.sunrise} ↓ ${d.sunset} · ` : ""}
                  {weatherLabel(d.dataType)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {weather?.bestTimeToVisit ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Best time to explore: </span>
          {weather.bestTimeToVisit}
        </p>
      ) : null}
      {weather?.note ? <p className="mt-3 text-[11px] text-muted-foreground">{weather.note}</p> : null}

      {weather ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {weather.provider} · updated {new Date(weather.lastUpdated).toLocaleString("en-IN")}
          {loading ? " · refreshing…" : ""}
        </p>
      ) : null}
    </div>
  );
}
