import type {
  TripWeather,
  WeatherDataType,
  WeatherIconKey,
  WeatherReading,
} from "./weather";

/** Open-Meteo publishes a 16-day forecast horizon. */
const FORECAST_HORIZON_DAYS = 16;
const MAX_DAYS = 14;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

function daysFromToday(date: string): number {
  const target = new Date(`${date}T00:00:00Z`).getTime();
  const today = new Date(`${isoDate(new Date())}T00:00:00Z`).getTime();
  return Math.round((target - today) / 86_400_000);
}

function clampRange(start: string, end: string): { start: string; end: string } {
  const span = Math.max(0, daysFromToday(end) - daysFromToday(start));
  return { start, end: span > MAX_DAYS ? addDays(start, MAX_DAYS) : end };
}

function hhmm(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /T(\d{2}:\d{2})/.exec(value);
  return m?.[1] ?? null;
}

/** WMO weather code → readable condition + icon key. */
function decodeWmo(code: number | null | undefined): { condition: string; icon: WeatherIconKey } {
  const c = code ?? -1;
  if (c === 0) return { condition: "Clear sky", icon: "sun" };
  if (c === 1) return { condition: "Mainly clear", icon: "sun" };
  if (c === 2) return { condition: "Partly cloudy", icon: "cloud-sun" };
  if (c === 3) return { condition: "Overcast", icon: "cloud" };
  if (c === 45 || c === 48) return { condition: "Fog", icon: "cloud-fog" };
  if (c >= 51 && c <= 57) return { condition: "Drizzle", icon: "cloud-drizzle" };
  if (c >= 61 && c <= 65) return { condition: "Rain", icon: "cloud-rain" };
  if (c === 66 || c === 67) return { condition: "Freezing rain", icon: "cloud-rain" };
  if (c >= 71 && c <= 77) return { condition: "Snow", icon: "snowflake" };
  if (c >= 80 && c <= 82) return { condition: "Rain showers", icon: "cloud-rain" };
  if (c === 85 || c === 86) return { condition: "Snow showers", icon: "snowflake" };
  if (c >= 95) return { condition: "Thunderstorm", icon: "cloud-lightning" };
  return { condition: "Mixed conditions", icon: "cloud" };
}

type OpenMeteoDaily = {
  time?: string[];
  weather_code?: (number | null)[];
  temperature_2m_max?: (number | null)[];
  temperature_2m_min?: (number | null)[];
  precipitation_probability_max?: (number | null)[];
  wind_speed_10m_max?: (number | null)[];
  relative_humidity_2m_mean?: (number | null)[];
  precipitation_sum?: (number | null)[];
  sunrise?: string[];
  sunset?: string[];
};

type OpenMeteoResponse = {
  daily?: OpenMeteoDaily;
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    precipitation?: number;
  };
  error?: boolean;
  reason?: string;
};

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`${label} request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

function readingsFromDaily(
  daily: OpenMeteoDaily,
  destination: string,
  dataType: WeatherDataType,
  lastUpdated: string,
  dateOverride?: (index: number) => string,
): WeatherReading[] {
  const times = daily.time ?? [];
  return times.map((time, i) => {
    const { condition, icon } = decodeWmo(daily.weather_code?.[i]);
    const min = daily.temperature_2m_min?.[i];
    const max = daily.temperature_2m_max?.[i];
    return {
      destination,
      date: dateOverride ? dateOverride(i) : time,
      minTemp: typeof min === "number" ? min : 0,
      maxTemp: typeof max === "number" ? max : 0,
      feelsLike: null,
      iconUrl: null,
      condition: dataType === "seasonal" ? `${condition} (seasonal average)` : condition,
      humidity: daily.relative_humidity_2m_mean?.[i] ?? null,
      precipitationProbability: daily.precipitation_probability_max?.[i] ?? null,
      windSpeed: daily.wind_speed_10m_max?.[i] ?? null,
      sunrise: hhmm(daily.sunrise?.[i]),
      sunset: hhmm(daily.sunset?.[i]),
      icon,
      dataType,
      lastUpdated,
    };
  });
}

const DAILY_FIELDS =
  "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean,sunrise,sunset";

/** Live current conditions + daily forecast inside the provider horizon. */
async function fetchForecast(
  destination: string,
  lat: number,
  lon: number,
  start: string,
  end: string,
  includeCurrent: boolean,
): Promise<{ current: WeatherReading | null; days: WeatherReading[]; lastUpdated: string }> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: DAILY_FIELDS,
    timezone: "auto",
    start_date: start,
    end_date: end,
    wind_speed_unit: "kmh",
  });
  if (includeCurrent) {
    params.set("current", "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation");
  }
  const data = await fetchJson<OpenMeteoResponse>(
    `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
    "Weather forecast",
  );
  if (data.error) throw new Error(data.reason ?? "Weather provider returned an error");

  const lastUpdated = new Date().toISOString();
  const days = readingsFromDaily(data.daily ?? {}, destination, "forecast", lastUpdated);

  let current: WeatherReading | null = null;
  if (data.current) {
    const { condition, icon } = decodeWmo(data.current.weather_code);
    const today = days[0];
    current = {
      destination,
      date: (data.current.time ?? lastUpdated).slice(0, 10),
      minTemp: today?.minTemp ?? data.current.temperature_2m ?? 0,
      maxTemp: today?.maxTemp ?? data.current.temperature_2m ?? 0,
      feelsLike: null,
      iconUrl: null,
      condition,
      humidity: data.current.relative_humidity_2m ?? null,
      precipitationProbability: today?.precipitationProbability ?? null,
      windSpeed: data.current.wind_speed_10m ?? null,
      sunrise: today?.sunrise ?? null,
      sunset: today?.sunset ?? null,
      icon,
      dataType: "live",
      lastUpdated,
    };
  }
  return { current, days, lastUpdated };
}

/**
 * Seasonal climate guidance for dates beyond the forecast horizon: the same
 * calendar window averaged from the three most recent historical years.
 * Clearly marked as a seasonal estimate — never presented as live weather.
 */
async function fetchSeasonal(
  destination: string,
  lat: number,
  lon: number,
  start: string,
  end: string,
): Promise<{ days: WeatherReading[]; lastUpdated: string }> {
  const year = new Date(`${start}T00:00:00Z`).getUTCFullYear();
  const currentYear = new Date().getUTCFullYear();
  const offsets = [1, 2, 3].map((n) => year - n).filter((y) => y <= currentYear);
  const lastUpdated = new Date().toISOString();

  const results = await Promise.all(
    offsets.map(async (y) => {
      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        daily:
          "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean,sunrise,sunset",
        timezone: "auto",
        start_date: start.replace(/^\d{4}/, String(y)),
        end_date: end.replace(/^\d{4}/, String(y)),
        wind_speed_unit: "kmh",
      });
      try {
        const data = await fetchJson<OpenMeteoResponse>(
          `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`,
          "Seasonal climate",
        );
        return data.daily ?? null;
      } catch {
        return null;
      }
    }),
  );

  const valid = results.filter((d): d is OpenMeteoDaily => Boolean(d?.time?.length));
  if (!valid.length) throw new Error("Seasonal climate data is unavailable for this destination");

  const base = valid[0]!;
  const length = base.time?.length ?? 0;
  const avg = (pick: (d: OpenMeteoDaily) => (number | null)[] | undefined, i: number) => {
    const values = valid
      .map((d) => pick(d)?.[i])
      .filter((v): v is number => typeof v === "number");
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  };

  const days: WeatherReading[] = [];
  for (let i = 0; i < length; i += 1) {
    const codes = valid
      .map((d) => d.weather_code?.[i])
      .filter((v): v is number => typeof v === "number");
    const medianCode = codes.length ? codes.sort((a, b) => a - b)[Math.floor(codes.length / 2)]! : null;
    const { condition, icon } = decodeWmo(medianCode);
    const rain = avg((d) => d.precipitation_sum, i);
    days.push({
      destination,
      date: addDays(start, i),
      minTemp: avg((d) => d.temperature_2m_min, i) ?? 0,
      maxTemp: avg((d) => d.temperature_2m_max, i) ?? 0,
      feelsLike: null,
      iconUrl: null,
      condition: `${condition} (seasonal average)`,
      humidity: avg((d) => d.relative_humidity_2m_mean, i),
      // Historical rainfall converted into a coarse likelihood band.
      precipitationProbability:
        rain === null ? null : Math.max(0, Math.min(95, Math.round(rain * 12))),
      windSpeed: avg((d) => d.wind_speed_10m_max, i),
      sunrise: hhmm(base.sunrise?.[i]),
      sunset: hhmm(base.sunset?.[i]),
      icon,
      dataType: "seasonal",
      lastUpdated,
    });
  }
  return { days, lastUpdated };
}

/** Resolves coordinates from a destination name using GeoNames (server-side). */
async function geocode(destination: string): Promise<{ lat: number; lon: number } | null> {
  const username = process.env["GEONAMES_USERNAME"];
  if (!username) return null;
  const city = destination.split(",")[0]?.trim() || destination;
  const url = `https://secure.geonames.org/searchJSON?q=${encodeURIComponent(
    city,
  )}&maxRows=1&orderby=population&featureClass=P&username=${encodeURIComponent(username)}`;
  try {
    const data = await fetchJson<{ geonames?: { lat?: string; lng?: string }[] }>(url, "Geocoding");
    const row = data.geonames?.[0];
    if (!row?.lat || !row?.lng) return null;
    return { lat: Number(row.lat), lon: Number(row.lng) };
  } catch {
    return null;
  }
}

export type TripWeatherInput = {
  destination: string;
  latitude?: number | null;
  longitude?: number | null;
  departureDate: string;
  returnDate: string;
};

/* ------------------------- WeatherAPI.com (live) ------------------------- */

type WeatherApiDay = {
  date?: string;
  day?: {
    maxtemp_c?: number;
    mintemp_c?: number;
    avgtemp_c?: number;
    avghumidity?: number;
    maxwind_kph?: number;
    daily_chance_of_rain?: number;
    condition?: { text?: string; icon?: string; code?: number };
  };
  astro?: { sunrise?: string; sunset?: string };
};

type WeatherApiResponse = {
  location?: { name?: string; lat?: number; lon?: number };
  current?: {
    temp_c?: number;
    feelslike_c?: number;
    humidity?: number;
    wind_kph?: number;
    precip_mm?: number;
    last_updated?: string;
    condition?: { text?: string; icon?: string; code?: number };
  };
  forecast?: { forecastday?: WeatherApiDay[] };
  error?: { message?: string };
};

/** WeatherAPI condition text → the shared icon key used by the UI. */
function iconFromText(text: string | null | undefined): WeatherIconKey {
  const t = (text ?? "").toLowerCase();
  if (t.includes("thunder")) return "cloud-lightning";
  if (t.includes("snow") || t.includes("sleet") || t.includes("ice") || t.includes("blizzard"))
    return "snowflake";
  if (t.includes("drizzle")) return "cloud-drizzle";
  if (t.includes("rain") || t.includes("shower")) return "cloud-rain";
  if (t.includes("mist") || t.includes("fog")) return "cloud-fog";
  if (t.includes("partly")) return "cloud-sun";
  if (t.includes("cloud") || t.includes("overcast")) return "cloud";
  if (t.includes("sun") || t.includes("clear")) return "sun";
  return "cloud";
}

function absoluteIcon(icon: string | null | undefined): string | null {
  if (!icon) return null;
  return icon.startsWith("//") ? `https:${icon}` : icon;
}

function to24h(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value.trim());
  if (!m) return value;
  let h = Number(m[1]) % 12;
  if (m[3]!.toUpperCase() === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/**
 * Live current conditions plus a short forecast from WeatherAPI.com.
 * The API key is read inside this server-only helper and never leaves it.
 */
async function fetchWeatherApi(
  destination: string,
  lat: number,
  lon: number,
): Promise<{ current: WeatherReading | null; days: WeatherReading[]; lastUpdated: string } | null> {
  const key = process.env["WEATHER_API_KEY"];
  if (!key) return null;
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(
    key,
  )}&q=${lat},${lon}&days=3&aqi=no&alerts=no`;
  const data = await fetchJson<WeatherApiResponse>(url, "WeatherAPI");
  if (data.error) throw new Error(data.error.message ?? "WeatherAPI returned an error");

  const lastUpdated = new Date().toISOString();
  const days: WeatherReading[] = (data.forecast?.forecastday ?? []).map((d) => ({
    destination,
    date: d.date ?? "",
    minTemp: d.day?.mintemp_c ?? 0,
    maxTemp: d.day?.maxtemp_c ?? 0,
    feelsLike: d.day?.avgtemp_c ?? null,
    condition: d.day?.condition?.text ?? "Mixed conditions",
    humidity: d.day?.avghumidity ?? null,
    precipitationProbability: d.day?.daily_chance_of_rain ?? null,
    windSpeed: d.day?.maxwind_kph ?? null,
    sunrise: to24h(d.astro?.sunrise),
    sunset: to24h(d.astro?.sunset),
    icon: iconFromText(d.day?.condition?.text),
    iconUrl: absoluteIcon(d.day?.condition?.icon),
    dataType: "forecast",
    lastUpdated,
  }));

  let current: WeatherReading | null = null;
  if (data.current) {
    const today = days[0];
    current = {
      destination,
      date: (data.current.last_updated ?? lastUpdated).slice(0, 10),
      minTemp: today?.minTemp ?? data.current.temp_c ?? 0,
      maxTemp: data.current.temp_c ?? today?.maxTemp ?? 0,
      feelsLike: data.current.feelslike_c ?? null,
      condition: data.current.condition?.text ?? "Mixed conditions",
      humidity: data.current.humidity ?? null,
      precipitationProbability: today?.precipitationProbability ?? null,
      windSpeed: data.current.wind_kph ?? null,
      sunrise: today?.sunrise ?? null,
      sunset: today?.sunset ?? null,
      icon: iconFromText(data.current.condition?.text),
      iconUrl: absoluteIcon(data.current.condition?.icon),
      dataType: "live",
      lastUpdated,
    };
  }
  return { current, days, lastUpdated };
}

/** Derives a short "best time to visit" line purely from the fetched readings. */
function bestTimeSummary(days: WeatherReading[], current: WeatherReading | null): string | null {
  const sample = days.length ? days : current ? [current] : [];
  if (!sample.length) return null;
  const avg = (nums: number[]) => nums.reduce((a, b) => a + b, 0) / nums.length;
  const maxAvg = avg(sample.map((d) => d.maxTemp));
  const rainVals = sample
    .map((d) => d.precipitationProbability)
    .filter((v): v is number => typeof v === "number");
  const rainAvg = rainVals.length ? avg(rainVals) : null;
  const windVals = sample.map((d) => d.windSpeed).filter((v): v is number => typeof v === "number");
  const windAvg = windVals.length ? avg(windVals) : null;

  const parts: string[] = [];
  if (maxAvg >= 32)
    parts.push("Days are hot — plan sightseeing before 11 AM or after 5 PM and keep hydrating");
  else if (maxAvg <= 15) parts.push("Days stay cool — midday, 11 AM to 4 PM, is the most comfortable window; pack layers");
  else parts.push("Comfortable daytime temperatures — mornings and late afternoons are ideal for outdoor plans");

  if (rainAvg !== null && rainAvg >= 50)
    parts.push(`high rain chance (~${Math.round(rainAvg)}%), so carry an umbrella and keep indoor options ready`);
  else if (rainAvg !== null && rainAvg >= 25)
    parts.push(`occasional showers possible (~${Math.round(rainAvg)}%)`);

  if (windAvg !== null && windAvg >= 30)
    parts.push(`windy conditions (~${Math.round(windAvg)} km/h) — expect exposed viewpoints and water activities to be affected`);

  const best = sample.reduce((a, b) => {
    const score = (d: WeatherReading) => d.maxTemp - (d.precipitationProbability ?? 0) / 4;
    return score(b) > score(a) ? b : a;
  });
  if (sample.length > 1) parts.push(`${formatDay(best.date)} looks like the best day of the window`);

  return `${parts.join("; ")}.`;
}

function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Production weather resolver used by both the dashboard and the AI generation
 * flow. Live current conditions and a 3-day forecast come from WeatherAPI.com
 * (server-only key); the Open-Meteo layer covers the rest of the trip window
 * and clearly-marked seasonal climate guidance beyond the forecast horizon.
 */
export async function getTripWeatherData(input: TripWeatherInput): Promise<TripWeather> {

  const destination = input.destination.trim();
  let lat = typeof input.latitude === "number" ? input.latitude : null;
  let lon = typeof input.longitude === "number" ? input.longitude : null;

  if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon)) {
    const geo = await geocode(destination);
    if (!geo) throw new Error(`Could not resolve coordinates for ${destination || "the destination"}`);
    lat = geo.lat;
    lon = geo.lon;
  }

  const today = isoDate(new Date());
  const rawStart = input.departureDate || today;
  const rawEnd = input.returnDate || rawStart;
  const startOffset = daysFromToday(rawStart);
  const endOffset = daysFromToday(rawEnd);

  // Past or already-started trips still show the live window from today.
  const start = startOffset < 0 ? today : rawStart;
  const end = endOffset < daysFromToday(start) ? start : rawEnd;
  const { start: s, end: e } = clampRange(start, end);

  const withinHorizon = daysFromToday(s) <= FORECAST_HORIZON_DAYS;
  const tripStarted = startOffset <= 0;

  // Live layer (WeatherAPI.com). Never fatal: a failure degrades to Open-Meteo.
  let live: { current: WeatherReading | null; days: WeatherReading[]; lastUpdated: string } | null =
    null;
  let liveFailed = false;
  try {
    live = await fetchWeatherApi(destination, lat, lon);
  } catch (err) {
    liveFailed = true;
    console.error("WEATHERAPI ERROR", err instanceof Error ? err.message : err);
  }
  const fallbackNotice = liveFailed
    ? "Live weather is temporarily unavailable — showing backup forecast data instead."
    : null;

  const mergeLive = (base: WeatherReading[]): WeatherReading[] => {
    if (!live?.days.length) return base;
    const byDate = new Map(live.days.map((d) => [d.date, d]));
    const merged = base.map((d) => byDate.get(d.date) ?? d);
    for (const d of live.days) {
      if (d.date >= s && d.date <= e && !merged.some((m) => m.date === d.date)) merged.push(d);
    }
    return merged.sort((a, b) => a.date.localeCompare(b.date));
  };

  if (withinHorizon) {
    const horizonEnd =
      daysFromToday(e) > FORECAST_HORIZON_DAYS ? addDays(today, FORECAST_HORIZON_DAYS) : e;
    let base: { current: WeatherReading | null; days: WeatherReading[]; lastUpdated: string };
    try {
      base = await fetchForecast(
        destination,
        lat,
        lon,
        s,
        horizonEnd,
        daysFromToday(s) <= 3 || tripStarted,
      );
    } catch (err) {
      if (!live) throw err;
      base = { current: null, days: [], lastUpdated: live.lastUpdated };
    }
    const days = mergeLive(base.days);
    const current = live?.current ?? base.current;
    return {
      destination,
      latitude: lat,
      longitude: lon,
      provider: live ? "WeatherAPI.com" : "Open-Meteo",
      dataType: current ? "live" : "forecast",
      lastUpdated: live?.lastUpdated ?? base.lastUpdated,
      current,
      days,
      note:
        horizonEnd !== e
          ? "Later travel days fall beyond the live forecast horizon and are not shown as forecast."
          : null,
      bestTimeToVisit: bestTimeSummary(days, current),
      fallbackNotice,
    };
  }

  const { days, lastUpdated } = await fetchSeasonal(destination, lat, lon, s, e);
  return {
    destination,
    latitude: lat,
    longitude: lon,
    provider: live ? "WeatherAPI.com + Open-Meteo climate archive" : "Open-Meteo climate archive",
    dataType: "seasonal",
    lastUpdated,
    current: live?.current ?? null,
    days,
    note: "Your travel dates are beyond the live forecast range, so these are seasonal climate estimates from recent years — not a live forecast.",
    bestTimeToVisit: bestTimeSummary(days, live?.current ?? null),
    fallbackNotice,
  };
}


/** Compact weather brief handed to the AI so it can tailor packing and timing. */
export function weatherBriefForPrompt(weather: TripWeather | null): string {
  if (!weather || !weather.days.length) return "No verified weather data is available.";
  const label =
    weather.dataType === "seasonal" ? "SEASONAL CLIMATE ESTIMATE" : "VERIFIED LIVE/FORECAST DATA";
  const lines = weather.days
    .slice(0, MAX_DAYS)
    .map(
      (d) =>
        `- ${d.date}: ${Math.round(d.minTemp)}-${Math.round(d.maxTemp)}°C, ${d.condition}, humidity ${
          d.humidity === null ? "n/a" : `${Math.round(d.humidity)}%`
        }, rain chance ${
          d.precipitationProbability === null ? "n/a" : `${Math.round(d.precipitationProbability)}%`
        }, wind ${d.windSpeed === null ? "n/a" : `${Math.round(d.windSpeed)} km/h`}`,
    )
    .join("\n");
  return `${label} for ${weather.destination} (source: ${weather.provider}):\n${lines}`;
}
