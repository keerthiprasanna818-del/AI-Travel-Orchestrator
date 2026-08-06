import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { LiveHotelSearchResponse } from "./hotels";

const searchSchema = z.object({
  travelPlanId: z.string().min(1).max(64),
  destination: z.string().min(1).max(160),
  checkInDate: z.string().min(4).max(32),
  checkOutDate: z.string().min(4).max(32),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  adults: z.number().int().min(1).max(16).nullable().optional(),
  children: z.number().int().min(0).max(16).nullable().optional(),
  rooms: z.number().int().min(1).max(8).nullable().optional(),
  currency: z.string().max(8).nullable().optional(),
  market: z.string().max(8).nullable().optional(),
  locale: z.string().max(16).nullable().optional(),
});

/**
 * `search-live-hotels` — secure server-side live hotel search. RapidAPI
 * credentials are read only inside this handler; the client receives normalized
 * offers or a friendly error message.
 */
export const searchLiveHotelOffers = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => searchSchema.parse(input))
  .handler(async ({ data }): Promise<LiveHotelSearchResponse> => {
    const { searchLiveHotels, cacheKeyFor, readCache, writeCache } =
      await import("./hotels.server");
    const key = cacheKeyFor(data);
    const cached = readCache(key);
    if (cached) return { ok: true, result: cached };

    try {
      const result = await searchLiveHotels(data);
      writeCache(key, result);
      return { ok: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Live hotel search failed";
      console.error("SEARCH LIVE HOTELS ERROR", message);
      return { ok: false, error: message };
    }
  });

/** Hotel destination / location lookup against the live provider. */
export const lookupHotelDestinations = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ query: z.string().min(1).max(160), locale: z.string().max(16).optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { searchHotelDestination } = await import("./hotels.server");
    try {
      const places = await searchHotelDestination(data.query, data.locale ?? "en-US");
      return { ok: true as const, places };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Hotel destination lookup failed";
      console.error("LOOKUP HOTEL DESTINATIONS ERROR", message);
      return { ok: false as const, error: message, places: [] };
    }
  });

/** Optional detail lookup for a single live hotel result. */
export const getLiveHotelDetails = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        hotelId: z.string().min(1).max(64),
        checkInDate: z.string().min(4).max(32),
        checkOutDate: z.string().min(4).max(32),
        adults: z.number().int().min(1).max(16).nullable().optional(),
        children: z.number().int().min(0).max(16).nullable().optional(),
        rooms: z.number().int().min(1).max(8).nullable().optional(),
        currency: z.string().max(8).nullable().optional(),
        market: z.string().max(8).nullable().optional(),
        locale: z.string().max(16).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getHotelDetails } = await import("./hotels.server");
    try {
      const details = await getHotelDetails(data);
      // Serialized as JSON so the RPC boundary stays strictly serializable.
      return { ok: true as const, details: JSON.stringify(details ?? null) };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Hotel details lookup failed";
      console.error("GET LIVE HOTEL DETAILS ERROR", message);
      return { ok: false as const, error: message };
    }
  });
