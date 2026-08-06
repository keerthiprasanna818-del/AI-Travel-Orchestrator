import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { TripWeatherResponse } from "./weather";

const inputSchema = z.object({
  destination: z.string().min(1).max(160),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  departureDate: z.string().min(4).max(32),
  returnDate: z.string().min(4).max(32),
});

/**
 * `get-trip-weather` — secure server-side weather resolver. All provider
 * access (and any provider key) stays on the server; the client only ever
 * receives the normalised weather payload.
 */
export const getTripWeather = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<TripWeatherResponse> => {
    const { getTripWeatherData } = await import("./weather.server");
    try {
      const weather = await getTripWeatherData({
        destination: data.destination,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        departureDate: data.departureDate,
        returnDate: data.returnDate,
      });
      return { ok: true, weather };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Weather provider is unavailable";
      console.error("GET TRIP WEATHER ERROR", message);
      return { ok: false, error: message };
    }
  });
