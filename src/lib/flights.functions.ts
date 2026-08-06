import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { LiveFlightSearchResponse } from "./flights";

const inputSchema = z.object({
  travelPlanId: z.string().min(1).max(64),
  origin: z.string().min(1).max(160),
  destination: z.string().min(1).max(160),
  departureDate: z.string().min(4).max(32),
  returnDate: z.string().max(32).nullable().optional(),
  adults: z.number().int().min(1).max(9).nullable().optional(),
  children: z.number().int().min(0).max(9).nullable().optional(),
  cabinClass: z.string().max(32).nullable().optional(),
  currency: z.string().max(8).nullable().optional(),
  market: z.string().max(8).nullable().optional(),
  locale: z.string().max(16).nullable().optional(),
});

/**
 * `search-live-flights` — secure server-side live flight search. The RapidAPI
 * credentials are read only inside this handler; the client receives normalized
 * offers or a friendly error message.
 */
export const searchLiveFlightOffers = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<LiveFlightSearchResponse> => {
    const { searchLiveFlights, cacheKeyFor, readCache, writeCache } =
      await import("./flights.server");
    const key = cacheKeyFor(data);
    const cached = readCache(key);
    if (cached) return { ok: true, result: cached };

    try {
      const result = await searchLiveFlights(data);
      writeCache(key, result);
      return { ok: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Live flight search failed";
      console.error("SEARCH LIVE FLIGHTS ERROR", message);
      return { ok: false, error: message };
    }
  });

/** Airport/location lookup against the live flight provider. */
export const lookupFlightPlaces = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ query: z.string().min(1).max(160), locale: z.string().max(16).optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { searchAirport } = await import("./flights.server");
    try {
      return { ok: true as const, places: await searchAirport(data.query, data.locale ?? "en-US") };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Airport lookup failed";
      console.error("LOOKUP FLIGHT PLACES ERROR", message);
      return { ok: false as const, error: message, places: [] };
    }
  });

/** Optional itinerary detail lookup for a specific live offer. */
export const getLiveFlightDetails = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        itineraryId: z.string().min(1).max(400),
        legs: z.string().max(2000).nullable().optional(),
        currency: z.string().max(8).nullable().optional(),
        market: z.string().max(8).nullable().optional(),
        locale: z.string().max(16).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getFlightDetails } = await import("./flights.server");
    try {
      const details = await getFlightDetails(data);
      // Serialized as JSON so the RPC boundary stays strictly serializable.
      return { ok: true as const, details: JSON.stringify(details ?? null) };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Flight details lookup failed";
      console.error("GET LIVE FLIGHT DETAILS ERROR", message);
      return { ok: false as const, error: message };
    }
  });
