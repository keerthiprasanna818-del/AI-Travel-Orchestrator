import type {
  LiveFlightOffer,
  LiveFlightSearchInput,
  LiveFlightSearchResult,
  LiveFlightSegment,
} from "./flights";
import { formatDurationMinutes } from "./flights";

/**
 * Server-only RapidAPI (Skyscanner Flights & Travel API) client.
 *
 * Credentials are read from RAPIDAPI_FLIGHTS_KEY / RAPIDAPI_FLIGHTS_HOST inside
 * the request path only — they are never returned to the client, never logged,
 * and never bundled for the browser. Provider errors are logged server-side
 * with the status and a truncated body; the caller receives a friendly message.
 */

const PROVIDER = "Skyscanner (RapidAPI)";
const MAX_OFFERS = 10;
/** Path prefixes used by the different published revisions of this API. */
const PREFIXES = ["/api/v1", "/api/v2", ""] as const;

type Creds = { key: string; host: string };

function credentials(): Creds {
  const key = process.env["RAPIDAPI_FLIGHTS_KEY"];
  const host = process.env["RAPIDAPI_FLIGHTS_HOST"];
  if (!key || !host) throw new Error("Live flight search is not configured");
  return { key, host: host.replace(/^https?:\/\//, "").replace(/\/+$/, "") };
}

async function callProvider<T>(
  creds: Creds,
  path: string,
  params: Record<string, string | undefined>,
): Promise<T> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") query.set(k, v);

  let lastStatus = 0;
  let lastBody = "";
  for (const prefix of PREFIXES) {
    const url = `https://${creds.host}${prefix}${path}?${query.toString()}`;
    const res = await fetch(url, {
      headers: {
        "x-rapidapi-key": creds.key,
        "x-rapidapi-host": creds.host,
        accept: "application/json",
      },
    });
    if (res.ok) return (await res.json()) as T;
    lastStatus = res.status;
    lastBody = (await res.text()).slice(0, 400);
    // Only a routing miss is worth retrying under another prefix.
    if (res.status !== 404) break;
  }
  console.error("RAPIDAPI FLIGHTS ERROR", { path, status: lastStatus, body: lastBody });
  if (lastStatus === 401 || lastStatus === 403)
    throw new Error("Live flight provider rejected the request");
  if (lastStatus === 429)
    throw new Error("Live flight provider rate limit reached. Please retry shortly.");
  throw new Error("Live flight provider is temporarily unavailable");
}

/* ------------------------------ airport lookup ----------------------------- */

export type ProviderPlace = {
  skyId: string;
  entityId: string;
  label: string;
  type: string;
};

type AirportSearchResponse = {
  places?: unknown;
  data?: unknown;
};

const str = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

function readPlace(raw: unknown): ProviderPlace | null {
  if (!raw || typeof raw !== "object") return null;
  const node = raw as Record<string, unknown>;
  const presentation = (node["presentation"] ?? {}) as Record<string, unknown>;
  const navigation = (node["navigation"] ?? {}) as Record<string, unknown>;
  const relevant = (navigation["relevantFlightParams"] ?? {}) as Record<string, unknown>;

  const skyId =
    str(node["skyId"]) ||
    str(relevant["skyId"]) ||
    str(node["iataCode"]) ||
    str(node["iata"]) ||
    str(node["id"]);
  const entityId =
    str(node["entityId"]) ||
    str(relevant["entityId"]) ||
    str(presentation["id"]) ||
    str(node["id"]);
  const label =
    str(presentation["suggestionTitle"]) ||
    [str(node["name"]), str(node["cityName"]), str(node["countryName"])]
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join(", ") ||
    [str(presentation["title"]), str(presentation["subtitle"])].filter(Boolean).join(", ") ||
    skyId;
  const type =
    str(node["placeType"]) || str(relevant["flightPlaceType"]) || str(node["entityType"]);

  if (!skyId && !entityId) return null;
  return { skyId, entityId, label, type };
}

function collectPlaces(payload: AirportSearchResponse): ProviderPlace[] {
  const source = payload.places ?? payload.data;
  const rows = Array.isArray(source)
    ? source
    : source &&
        typeof source === "object" &&
        Array.isArray((source as Record<string, unknown>)["items"])
      ? ((source as Record<string, unknown>)["items"] as unknown[])
      : [];
  return rows.map(readPlace).filter((p): p is ProviderPlace => !!p);
}

/** Resolve a free-text place into the provider entity ids the search needs. */
export async function searchAirport(query: string, locale = "en-US"): Promise<ProviderPlace[]> {
  const creds = credentials();
  const cleaned = query.split(",")[0]!.trim() || query.trim();
  const payload = await callProvider<AirportSearchResponse>(creds, "/flights/searchAirport", {
    query: cleaned,
    locale,
  });
  const places = collectPlaces(payload);
  // Prefer cities/airports over generic entities, keeping provider order otherwise.
  const rank = (p: ProviderPlace) => (/city/i.test(p.type) ? 0 : /airport/i.test(p.type) ? 1 : 2);
  return [...places].sort((a, b) => rank(a) - rank(b));
}

/* ------------------------------ flight search ------------------------------ */

type Itinerary = Record<string, unknown>;

const CABIN_MAP: Record<string, string> = {
  economy: "economy",
  "premium economy": "premium_economy",
  premium_economy: "premium_economy",
  business: "business",
  first: "first",
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

const upper = (v: unknown) => str(v).toUpperCase();

function place(node: Record<string, unknown>, key: string): string {
  const value = node[key];
  if (typeof value === "string" || typeof value === "number") return upper(value);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return upper(str(obj["displayCode"]) || str(obj["flightPlaceId"]) || str(obj["id"]));
  }
  return "";
}

/** Provider-returned marketing carrier for a leg (array or {marketing:[]} shape). */
function legCarrier(leg: Record<string, unknown>): { name: string; iata: string } {
  const raw = leg["carriers"];
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>)["marketing"])
      ? ((raw as Record<string, unknown>)["marketing"] as unknown[])
      : [];
  const first = (list[0] ?? {}) as Record<string, unknown>;
  return {
    name: str(first["name"]),
    iata: upper(str(first["alternateId"]) || str(first["iata"]) || str(first["displayCode"])),
  };
}

/**
 * Flight numbers as published by the provider inside its deeplink itinerary
 * parameter (`flight|<carrier>|<number>|…`). Nothing is invented: when the
 * provider publishes no number, the segment simply carries an empty one.
 */
function deeplinkFlightNumbers(bookingUrl: string | null): string[] {
  if (!bookingUrl) return [];
  const out: string[] = [];
  const re = /flight\|(-?\d+)\|(\d+)\|/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bookingUrl))) out.push(m[2]!);
  return out;
}

function readSegment(
  raw: unknown,
  carrier: { name: string; iata: string },
): LiveFlightSegment | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const own = (s["marketingCarrier"] ?? s["operatingCarrier"] ?? {}) as Record<string, unknown>;
  const iata =
    upper(str(own["alternateId"]) || str(own["iata"]) || str(own["displayCode"])) || carrier.iata;
  const name = str(own["name"]) || carrier.name || iata;

  return {
    airlineName: name,
    airlineIataCode: iata,
    airlineLogoKey: iata.toLowerCase(),
    flightNumber: str(s["flightNumber"]),
    departureAirport: place(s, "origin"),
    arrivalAirport: place(s, "destination"),
    departureDateTime: str(s["departure"]),
    arrivalDateTime: str(s["arrival"]),
    durationMinutes: num(s["durationInMinutes"]),
    aircraftCode: str(s["aircraft"]) || null,
  };
}

/**
 * Segments for a leg. Uses provider segment detail when present; otherwise
 * synthesises a single leg-level segment from the provider's own leg fields.
 */
function readLegSegments(leg: unknown, numbers: string[]): LiveFlightSegment[] {
  if (!leg || typeof leg !== "object") return [];
  const node = leg as Record<string, unknown>;
  const carrier = legCarrier(node);
  const raw = node["segments"];
  if (Array.isArray(raw) && raw.length) {
    const segments = raw
      .map((s) => readSegment(s, carrier))
      .filter((s): s is LiveFlightSegment => !!s);
    return segments.map((sgmt, i) => ({
      ...sgmt,
      flightNumber: sgmt.flightNumber || numbers[i] || "",
    }));
  }

  const stopCount = num(node["stopCount"]) ?? 0;
  if (stopCount > 0 && numbers.length < stopCount + 1) return [];
  return [
    {
      airlineName: carrier.name || carrier.iata,
      airlineIataCode: carrier.iata,
      airlineLogoKey: carrier.iata.toLowerCase(),
      flightNumber: numbers[0] ?? "",
      departureAirport: place(node, "origin"),
      arrivalAirport: place(node, "destination"),
      departureDateTime: str(node["departure"]),
      arrivalDateTime: str(node["arrival"]),
      durationMinutes: num(node["durationMinutes"]) ?? num(node["durationInMinutes"]),
      aircraftCode: null,
    },
  ];
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeItinerary(
  itinerary: Itinerary,
  ctx: { travellers: number; currency: string; cabinClass: string; index: number },
): LiveFlightOffer | null {
  const legsRaw = itinerary["legs"];
  const legs = Array.isArray(legsRaw) ? legsRaw : [];
  const outboundLeg = legs[0];
  const returnLeg = legs[1];
  if (!outboundLeg || typeof outboundLeg !== "object") return null;

  const out = outboundLeg as Record<string, unknown>;
  const price = (itinerary["price"] ?? {}) as Record<string, unknown>;
  const bookingRaw =
    str(itinerary["deeplink"]) || str(itinerary["bookingUrl"]) || str(price["deeplink"]);
  const bookingUrl = bookingRaw && isHttpsUrl(bookingRaw) ? bookingRaw : null;

  const stopCount = num(out["stopCount"]) ?? 0;
  const allNumbers = deeplinkFlightNumbers(bookingUrl);
  const outboundSegments = readLegSegments(outboundLeg, allNumbers.slice(0, stopCount + 1));
  const returnSegments = returnLeg
    ? readLegSegments(returnLeg, allNumbers.slice(outboundSegments.length))
    : [];

  const carrier = legCarrier(out);
  const iata = carrier.iata || outboundSegments[0]?.airlineIataCode || "";
  const airlineName = carrier.name || outboundSegments[0]?.airlineName || iata;

  const total = num(price["raw"]) ?? num(price["amount"]) ?? num(price["formatted"]);
  const currency = str(price["currency"]).toUpperCase() || ctx.currency;

  const durationMinutes =
    num(out["durationMinutes"]) ??
    num(out["durationInMinutes"]) ??
    outboundSegments.reduce((sum, sgmt) => sum + (sgmt.durationMinutes ?? 0), 0);

  const stopAirports =
    stopCount > 0 && outboundSegments.length > 1
      ? outboundSegments
          .slice(0, -1)
          .map((sgmt) => sgmt.arrivalAirport)
          .filter(Boolean)
      : [];

  const offerId = str(itinerary["id"]) || `${iata || "offer"}-${ctx.index}`;

  return {
    offerId,
    provider: PROVIDER,
    providerEntityId: str(itinerary["id"]) || null,
    validatingAirline: airlineName || null,
    airlineName: airlineName || "Airline",
    airlineIataCode: iata,
    airlineLogoKey: iata.toLowerCase(),
    outboundSegments,
    returnSegments: returnSegments.length ? returnSegments : null,
    departureAirport: place(out, "origin"),
    arrivalAirport: place(out, "destination"),
    departureDateTime: str(out["departure"]) || outboundSegments[0]?.departureDateTime || "",
    arrivalDateTime:
      str(out["arrival"]) || outboundSegments[outboundSegments.length - 1]?.arrivalDateTime || "",
    totalDuration: formatDurationMinutes(durationMinutes),
    numberOfStops: stopCount,
    stopAirports,
    aircraftCode: outboundSegments[0]?.aircraftCode ?? null,
    cabinClass: ctx.cabinClass,
    baggageAllowance: null,
    totalPrice: total,
    currency,
    pricePerTraveller: total != null ? Math.round(total / Math.max(1, ctx.travellers)) : null,
    availableSeats: null,
    bookingUrl,
    bookingUrlVerified: !!bookingUrl,
    lastUpdated: new Date().toISOString(),
    dataSource: PROVIDER,
    liveData: true,
  };
}

type SearchFlightsResponse = { itineraries?: unknown; data?: unknown };

function readItineraries(payload: SearchFlightsResponse): Itinerary[] {
  const containers: unknown[] = [payload.itineraries, payload.data];
  for (const container of containers) {
    if (Array.isArray(container)) {
      return container.filter((r): r is Itinerary => !!r && typeof r === "object");
    }
    if (container && typeof container === "object") {
      const node = container as Record<string, unknown>;
      const nested = node["itineraries"];
      const rows = Array.isArray(nested)
        ? nested
        : nested &&
            typeof nested === "object" &&
            Array.isArray((nested as Record<string, unknown>)["results"])
          ? ((nested as Record<string, unknown>)["results"] as unknown[])
          : [];
      if (rows.length) return rows.filter((r): r is Itinerary => !!r && typeof r === "object");
    }
  }
  return [];
}

const isoDate = (value: string) => {
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

/** Full live-flight pipeline: resolve places → search → normalize → cap at 10. */
export async function searchLiveFlights(
  input: LiveFlightSearchInput,
): Promise<LiveFlightSearchResult> {
  const creds = credentials();
  const locale = input.locale?.trim() || "en-US";
  const market = input.market?.trim() || "IN";
  const currency = input.currency?.trim() || "INR";
  const adults = Math.max(1, input.adults ?? 1);
  const children = Math.max(0, input.children ?? 0);
  const cabinClass = CABIN_MAP[(input.cabinClass ?? "economy").toLowerCase()] ?? "economy";

  const [originPlaces, destinationPlaces] = await Promise.all([
    searchAirport(input.origin, locale),
    searchAirport(input.destination, locale),
  ]);
  const from = originPlaces[0];
  const to = destinationPlaces[0];
  if (!from || !to)
    throw new Error("Could not match these cities to airports with the live provider");

  const departureDate = isoDate(input.departureDate);
  if (!departureDate) throw new Error("Invalid departure date for live flight search");
  const returnDate = input.returnDate ? isoDate(input.returnDate) : "";

  const payload = await callProvider<SearchFlightsResponse>(creds, "/flights/searchFlights", {
    originSkyId: from.skyId,
    destinationSkyId: to.skyId,
    originEntityId: from.entityId,
    destinationEntityId: to.entityId,
    date: departureDate,
    returnDate: returnDate || undefined,
    cabinClass,
    adults: String(adults),
    childrens: children ? String(children) : undefined,
    children: children ? String(children) : undefined,
    sortBy: "best",
    currency,
    market,
    countryCode: market,
    locale,
  });

  const travellers = adults + children;
  const offers = readItineraries(payload)
    .map((itinerary, index) =>
      normalizeItinerary(itinerary, { travellers, currency, cabinClass, index }),
    )
    .filter((o): o is LiveFlightOffer => !!o)
    .slice(0, MAX_OFFERS);

  return {
    travelPlanId: input.travelPlanId,
    offers,
    lastUpdated: new Date().toISOString(),
    dataSource: PROVIDER,
    origin: { skyId: from.skyId, label: from.label },
    destination: { skyId: to.skyId, label: to.label },
  };
}

/* ------------------------------ flight details ----------------------------- */

/** Optional detail lookup, used only when an offer needs enrichment. */
export async function getFlightDetails(params: {
  itineraryId: string;
  legs?: string | null | undefined;
  currency?: string | null | undefined;
  market?: string | null | undefined;
  locale?: string | null | undefined;
}): Promise<unknown> {
  const creds = credentials();
  return callProvider<unknown>(creds, "/flights/getFlightDetails", {
    itineraryId: params.itineraryId,
    legs: params.legs ?? undefined,
    currency: params.currency ?? "INR",
    market: params.market ?? "IN",
    countryCode: params.market ?? "IN",
    locale: params.locale ?? "en-US",
  });
}

/* --------------------------------- caching --------------------------------- */

type CacheEntry = { at: number; result: LiveFlightSearchResult };
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

/** Per-travel-plan cache. Never touches the stored trip or AI plan. */
export function readCache(key: string): LiveFlightSearchResult | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.result;
}

export function writeCache(key: string, result: LiveFlightSearchResult): void {
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), result });
}

export function cacheKeyFor(input: LiveFlightSearchInput): string {
  return [
    input.travelPlanId,
    input.origin,
    input.destination,
    input.departureDate,
    input.returnDate ?? "",
    input.adults ?? 1,
    input.children ?? 0,
    input.cabinClass ?? "economy",
    input.currency ?? "INR",
    input.market ?? "IN",
  ].join("|");
}
