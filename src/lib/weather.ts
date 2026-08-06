/**
 * Shared weather contract used by the backend weather function, the AI
 * generation flow and the dashboard. Never contains provider keys.
 */

export type WeatherDataType = "live" | "forecast" | "seasonal";

export type WeatherIconKey =
  | "sun"
  | "cloud-sun"
  | "cloud"
  | "cloud-rain"
  | "cloud-drizzle"
  | "cloud-lightning"
  | "snowflake"
  | "cloud-fog"
  | "wind";

export type WeatherReading = {
  /** Human readable destination the reading belongs to. */
  destination: string;
  /** ISO date (YYYY-MM-DD) the reading describes. */
  date: string;
  /** Minimum temperature in °C. */
  minTemp: number;
  /** Maximum temperature in °C. */
  maxTemp: number;
  /** Apparent ("feels like") temperature in °C when the provider supplies it. */
  feelsLike: number | null;
  condition: string;
  /** Relative humidity, percent. */
  humidity: number | null;
  /** Probability of precipitation, percent. */
  precipitationProbability: number | null;
  /** Wind speed in km/h. */
  windSpeed: number | null;
  /** Local sunrise time (HH:mm) when the provider supplies it. */
  sunrise: string | null;
  /** Local sunset time (HH:mm) when the provider supplies it. */
  sunset: string | null;
  icon: WeatherIconKey;
  /** Absolute provider icon URL when available (WeatherAPI condition icon). */
  iconUrl: string | null;
  dataType: WeatherDataType;
  /** ISO timestamp of when the value was fetched from the provider. */
  lastUpdated: string;
};

export type TripWeather = {
  destination: string;
  latitude: number;
  longitude: number;
  provider: string;
  /** Overall nature of the trip-window data. */
  dataType: WeatherDataType;
  lastUpdated: string;
  /** Present only when the trip is near-term and live conditions exist. */
  current: WeatherReading | null;
  /** One entry per travel day inside the trip window. */
  days: WeatherReading[];
  /** Set when the range is beyond the provider forecast horizon. */
  note: string | null;
  /** Short guidance derived from the fetched data — never hardcoded. */
  bestTimeToVisit?: string | null;
  /** Set when live WeatherAPI data could not be reached and we fell back. */
  fallbackNotice?: string | null;
};


export type TripWeatherResponse =
  | { ok: true; weather: TripWeather }
  | { ok: false; error: string };

export const WEATHER_LABELS: Record<WeatherDataType, string> = {
  live: "Live",
  forecast: "Forecast",
  seasonal: "Seasonal Estimate",
};

export function weatherLabel(type: WeatherDataType): string {
  return WEATHER_LABELS[type] ?? "Seasonal Estimate";
}

export function formatWeatherDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function formatTempRange(r: Pick<WeatherReading, "minTemp" | "maxTemp">): string {
  return `${Math.round(r.minTemp)}°–${Math.round(r.maxTemp)}°C`;
}
