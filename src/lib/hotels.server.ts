import type {
  LiveHotelOffer,
  LiveHotelPlace,
  LiveHotelSearchInput,
  LiveHotelSearchResult,
} from "./hotels";
import { nightsBetween, sizedHotelImage } from "./hotels";

/**
 * Server-only RapidAPI (Skyscanner Flights & Travel API) hotel client.
 *
 * Credentials are read from RAPIDAPI_FLIGHTS_KEY / RAPIDAPI_FLIGHTS_HOST inside
 * the request path only — never returned to the client, never logged, never
 * bundled for the browser. Provider failures are logged server-side with the
 * status and a truncated body; callers get a friendly message.
 *
 * Nothing here invents data: names, prices, ratings, images, availability and
 * booking URLs are used only when the provider returns them.
 */

const PROVIDER = "Skyscanner (RapidAPI)";
const MAX_OFFERS = 10;

type Creds = { key: string; host: string };

function credentials(): Creds {
  const key = process.env["RAPIDAPI_FLIGHTS_KEY"];
  const host = process.env["RAPIDAPI_FLIGHTS_HOST"];
  if (!key || !host) throw new Error("Live hotel search is not configured");
  return { key, host: host.replace(/^https?:\/\//, "").replace(/\/+$/, "") };
}

async function callProvider<T>(
  creds: Creds,
  path: string,
  params: Record<string, string | undefined>,
  attempt = 0,
): Promise<T> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") query.set(k, v);

  const res = await fetch(`https://${creds.host}${path}?${query.toString()}`, {
    headers: {
      "x-rapidapi-key": creds.key,
      "x-rapidapi-host": creds.host,
      accept: "application/json",
    },
  });

  if (res.ok) return (await res.json()) as T;

  const body = (await res.text()).slice(0, 600);
  console.error("RAPIDAPI HOTELS ERROR", { path, status: res.status, attempt, body });

  // The provider's autosuggest occasionally answers 503 for a single request.
  if (res.status >= 500 && attempt < 2) {
    await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    return callProvider<T>(creds, path, params, attempt + 1);
  }

  if (res.status === 401 || res.status === 403)
    throw new Error("Live hotel provider rejected the request");
  if (res.status === 429)
    throw new Error("Live hotel provider rate limit reached. Please retry shortly.");
  if (res.status === 422) throw new Error("Live hotel search parameters were rejected");
  throw new Error("Live hotel provider is temporarily unavailable");
}

/* --------------------------- helpers / normalizers -------------------------- */

const str = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

function coords(raw: unknown): { lat: number | null; lng: number | null } {
  const node = obj(raw);
  return { lat: num(node["lat"]) ?? null, lng: num(node["lng"]) ?? null };
}

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* --------------------------- destination lookup ---------------------------- */

type DestinationResponse = { places?: unknown };

function readPlace(raw: unknown): LiveHotelPlace | null {
  const node = obj(raw);
  const entityId = str(node["entityId"]);
  const name = str(node["name"]);
  if (!entityId || !name) return null;
  const hierarchy = str(node["hierarchy"]).split("|").filter(Boolean);
  const { lat, lng } = coords(node["coordinates"]);
  return {
    entityId,
    name,
    label: hierarchy.length
      ? hierarchy.filter((v, i, arr) => arr.indexOf(v) === i).join(", ")
      : name,
    type: str(node["type"]).toLowerCase(),
    latitude: lat,
    longitude: lng,
  };
}

const TYPE_RANK: Record<string, number> = {
  city: 0,
  district: 1,
  "sub-region": 1,
  subregion: 1,
  region: 2,
  airport: 3,
  hotel: 4,
};

/**
 * Hotel destination / location lookup. Works for any destination worldwide;
 * cities are preferred over districts, airports and single properties.
 */
export async function searchHotelDestination(
  query: string,
  locale = "en-US",
): Promise<LiveHotelPlace[]> {
  const creds = credentials();
  const cleaned = query.split(",")[0]!.trim() || query.trim();
  const payload = await callProvider<DestinationResponse>(creds, "/hotels/searchDestination", {
    query: cleaned,
    locale,
  });
  const rows = Array.isArray(payload.places) ? payload.places : [];
  const places = rows.map(readPlace).filter((p): p is LiveHotelPlace => !!p);
  return places.sort((a, b) => (TYPE_RANK[a.type] ?? 5) - (TYPE_RANK[b.type] ?? 5));
}

/**
 * Pick the destination entity for a search: the best-ranked place, biased to the
 * one nearest the supplied trip coordinates when GeoNames gave us any.
 */
function pickDestination(
  places: LiveHotelPlace[],
  latitude?: number | null,
  longitude?: number | null,
): LiveHotelPlace | null {
  if (!places.length) return null;
  const areas = places.filter((p) => p.type !== "hotel");
  const pool = areas.length ? areas : places;
  if (latitude != null && longitude != null) {
    const withCoords = pool.filter((p) => p.latitude != null && p.longitude != null);
    if (withCoords.length) {
      return withCoords.reduce((best, p) =>
        haversine(latitude, longitude, p.latitude!, p.longitude!) <
        haversine(latitude, longitude, best.latitude!, best.longitude!)
          ? p
          : best,
      );
    }
  }
  return pool[0]!;
}

/* ------------------------------ hotel search ------------------------------- */

type SearchHotelsResponse = { hotels?: unknown; total?: unknown; destinationName?: unknown };

function readOffer(
  raw: unknown,
  ctx: { destination: string; nights: number; currency: string; lastUpdated: string },
): LiveHotelOffer | null {
  const node = obj(raw);
  const hotelId = str(node["hotelId"]) || str(node["id"]);
  const hotelName = str(node["name"]);
  if (!hotelId || !hotelName) return null;

  const price = obj(node["price"]);
  const pricePerNight = num(price["amount"]);
  const currency = (str(price["currency"]) || ctx.currency).toUpperCase();
  const { lat, lng } = coords(node["coordinates"]);

  const images = (Array.isArray(node["images"]) ? node["images"] : [])
    .map((image) => sizedHotelImage(typeof image === "string" ? image : str(obj(image)["url"])))
    .filter((url): url is string => !!url)
    .filter((url, i, arr) => arr.indexOf(url) === i);

  const amenities = (Array.isArray(node["amenities"]) ? node["amenities"] : [])
    .map((a) => str(a))
    .filter(Boolean)
    .filter((a, i, arr) => arr.indexOf(a) === i);

  const bookingUrl = str(node["url"]);
  const verified = /^https:\/\/([a-z0-9-]+\.)*skyscanner\.[a-z.]+\//i.test(bookingUrl);

  return {
    hotelId,
    provider: PROVIDER,
    hotelName,
    destination: ctx.destination,
    address: str(node["address"]) || null,
    latitude: lat,
    longitude: lng,
    starRating: num(node["stars"]),
    guestRating: num(node["rating"]) ?? num(obj(node["rating"])["score"]),
    reviewCount: num(node["reviewCount"]) ?? num(obj(node["rating"])["count"]),
    roomType: str(node["roomType"]) || null,
    amenities,
    imageUrls: images,
    primaryImageUrl: images[0] ?? null,
    pricePerNight,
    // Stay total derived from the provider's per-night rate and the trip length.
    totalPrice: pricePerNight != null ? Math.round(pricePerNight * ctx.nights) : null,
    currency,
    taxesAndFees: num(node["taxesAndFees"]),
    cancellationPolicy: str(node["cancellationPolicy"]) || null,
    distanceFromCityCentre: str(node["distance"]) || null,
    availabilityStatus: pricePerNight != null ? "Available" : "Rates on request",
    bookingUrl: bookingUrl || null,
    bookingUrlVerified: verified,
    lastUpdated: ctx.lastUpdated,
    dataSource: PROVIDER,
    liveData: true,
  };
}

/** Live hotel search: destination lookup → provider search → normalized offers. */
export async function searchLiveHotels(
  input: LiveHotelSearchInput,
): Promise<LiveHotelSearchResult> {
  const creds = credentials();
  const locale = input.locale || "en-US";
  const currency = (input.currency || "INR").toUpperCase();
  const nights = nightsBetween(input.checkInDate, input.checkOutDate);

  const places = await searchHotelDestination(input.destination, locale);
  const primary = pickDestination(places, input.latitude, input.longitude);
  if (!primary) throw new Error("We could not match this destination with our hotel provider");

  // Some entities (broad regions) carry no inventory; walk the next-best
  // candidates until the provider returns actual stays.
  const candidates = [primary, ...places.filter((p) => p.entityId !== primary.entityId)].slice(
    0,
    3,
  );

  const lastUpdated = new Date().toISOString();
  let place = primary;
  let offers: LiveHotelOffer[] = [];

  for (const candidate of candidates) {
    const payload = await callProvider<SearchHotelsResponse>(creds, "/hotels/searchHotels", {
      entityId: candidate.entityId,
      checkIn: input.checkInDate,
      checkOut: input.checkOutDate,
      adults: String(Math.max(1, input.adults ?? 1)),
      children: String(Math.max(0, input.children ?? 0)),
      rooms: String(Math.max(1, input.rooms ?? 1)),
      currency,
      market: input.market || "IN",
      locale,
      ...(input.latitude != null ? { latitude: String(input.latitude) } : {}),
      ...(input.longitude != null ? { longitude: String(input.longitude) } : {}),
    });

    const name = str(payload.destinationName) || candidate.name;
    const rows = Array.isArray(payload.hotels) ? payload.hotels : [];
    const found = rows
      .map((row) => readOffer(row, { destination: name, nights, currency, lastUpdated }))
      .filter((offer): offer is LiveHotelOffer => !!offer)
      .slice(0, MAX_OFFERS);

    if (found.length) {
      place = candidate;
      offers = found;
      break;
    }
  }

  return {
    travelPlanId: input.travelPlanId,
    offers,
    lastUpdated,
    dataSource: PROVIDER,
    destination: { entityId: place.entityId, label: place.label },
    nights,
  };
}

/** Optional detail lookup for a single property (description, policies, photos). */
export async function getHotelDetails(input: {
  hotelId: string;
  checkInDate: string;
  checkOutDate: string;
  adults?: number | null | undefined;
  children?: number | null | undefined;
  rooms?: number | null | undefined;
  currency?: string | null | undefined;
  market?: string | null | undefined;
  locale?: string | null | undefined;
}): Promise<unknown> {
  const creds = credentials();
  return callProvider<unknown>(creds, "/hotels/getHotelDetails", {
    hotelId: input.hotelId,
    checkIn: input.checkInDate,
    checkOut: input.checkOutDate,
    adults: String(Math.max(1, input.adults ?? 1)),
    children: String(Math.max(0, input.children ?? 0)),
    rooms: String(Math.max(1, input.rooms ?? 1)),
    currency: (input.currency || "INR").toUpperCase(),
    market: input.market || "IN",
    locale: input.locale || "en-US",
  });
}

/* ---------------------------------- cache ---------------------------------- */

const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; result: LiveHotelSearchResult }>();

/** Cache is keyed per travel plan + search parameters; the stored plan is untouched. */
export function cacheKeyFor(input: LiveHotelSearchInput): string {
  return [
    input.travelPlanId,
    input.destination,
    input.checkInDate,
    input.checkOutDate,
    input.adults ?? 1,
    input.children ?? 0,
    input.rooms ?? 1,
    input.currency ?? "INR",
    input.market ?? "IN",
  ]
    .join("|")
    .toLowerCase();
}

export function readCache(key: string): LiveHotelSearchResult | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.result;
}

export function writeCache(key: string, result: LiveHotelSearchResult): void {
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), result });
}
