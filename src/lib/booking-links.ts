/**
 * Centralized booking-link resolver for flights, trains and hotels.
 *
 * Rules:
 *  - A provider deep link is only used when the result carries a VERIFIED
 *    booking URL from a live provider API (`bookingUrlVerified === true` and a
 *    `bookingUrl` on an allowed https host).
 *  - Otherwise we build a PRE-FILLED SEARCH url from the submitted trip
 *    parameters (origin, destination, dates, adults, children) and expose a
 *    search-style label — never a "Book Now" claim on an AI estimate.
 *  - Never a bare provider homepage, never an AI-invented URL.
 */

export type BookingKind = "flight" | "train" | "hotel";

/** Fields every bookable result model carries. */
export type BookingMeta = {
  provider?: string | null;
  providerId?: string | null;
  bookingUrl?: string | null;
  bookingUrlVerified?: boolean | null;
  liveData?: boolean | null;
};

export type TripParams = {
  origin?: string | null;
  destination?: string | null;
  departureDate?: string | null;
  returnDate?: string | null;
  adults?: number | null;
  children?: number | null;
  nights?: number | null;
};

export type ResolvedBookingLink = {
  url: string;
  label: string;
  /** true only for verified provider deep links. */
  verified: boolean;
  provider: string;
};

const clean = (value?: string | null) => (value ?? "").split(/[(|]/)[0]!.replace(/\s+/g, " ").trim();

/** yyyy-mm-dd if parseable, else "". */
function isoDate(value?: string | null): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ALLOWED_HOSTS = [
  "google.com",
  "booking.com",
  "agoda.com",
  "expedia.com",
  "hotels.com",
  "makemytrip.com",
  "goibibo.com",
  "cleartrip.com",
  "yatra.com",
  "skyscanner.net",
  "skyscanner.co.in",
  "kayak.com",
  "irctc.co.in",
  "indianrail.gov.in",
  "trainman.in",
  "airindia.com",
  "goindigo.in",
  "spicejet.com",
  "akasaair.com",
  "airindiaexpress.com",
  "emirates.com",
  "qatarairways.com",
  "singaporeair.com",
  "lufthansa.com",
  "britishairways.com",
];

/** A verified provider URL must be https and on a known travel host. */
export function isVerifiedProviderUrl(meta: BookingMeta | undefined): boolean {
  if (!meta?.bookingUrlVerified || !meta.bookingUrl) return false;
  try {
    const parsed = new URL(meta.bookingUrl);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const onAllowedHost = ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    // Homepages are never treated as exact deep links.
    const hasPath = parsed.pathname.replace(/\/+$/, "").length > 0 || parsed.search.length > 0;
    return onAllowedHost && hasPath;
  } catch {
    return false;
  }
}

/* ---------------------------------- flights --------------------------------- */

function flightSearchUrl(trip: TripParams): string {
  const from = clean(trip.origin);
  const to = clean(trip.destination);
  const depart = isoDate(trip.departureDate);
  const back = isoDate(trip.returnDate);
  const adults = Math.max(1, trip.adults ?? 1);
  const children = Math.max(0, trip.children ?? 0);

  const parts = ["Flights"];
  if (from) parts.push(`from ${from}`);
  if (to) parts.push(`to ${to}`);
  if (depart) parts.push(`on ${depart}`);
  if (back) parts.push(`returning ${back}`);
  parts.push(`${adults} adult${adults > 1 ? "s" : ""}`);
  if (children > 0) parts.push(`${children} child${children > 1 ? "ren" : ""}`);

  return `https://www.google.com/travel/flights?q=${encodeURIComponent(parts.join(" "))}`;
}

/* ---------------------------------- trains ---------------------------------- */

function trainSearchUrl(trip: TripParams): string {
  const from = clean(trip.origin);
  const to = clean(trip.destination);
  const depart = isoDate(trip.departureDate);
  const params = new URLSearchParams();
  if (from) params.set("fromStation", from);
  if (to) params.set("toStation", to);
  if (depart) params.set("journeyDate", depart);
  const query = params.toString();
  // Official Indian Railways booking search page, pre-filled where supported.
  return `https://www.irctc.co.in/nget/train-search${query ? `?${query}` : ""}`;
}

/* ---------------------------------- hotels ---------------------------------- */

function hotelSearchUrl(trip: TripParams, hotelName?: string | null): string {
  const destination = clean(trip.destination);
  const checkin = isoDate(trip.departureDate);
  const nights = Math.max(1, trip.nights ?? 1);
  const checkout = isoDate(trip.returnDate) || addDays(checkin, nights);
  const adults = Math.max(1, trip.adults ?? 1);
  const children = Math.max(0, trip.children ?? 0);

  const params = new URLSearchParams();
  const query = [clean(hotelName), destination].filter(Boolean).join(" ");
  params.set("ss", query || destination || "hotels");
  if (checkin) params.set("checkin", checkin);
  if (checkout) params.set("checkout", checkout);
  params.set("group_adults", String(adults));
  params.set("group_children", String(children));
  params.set("no_rooms", "1");
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}

/* --------------------------------- resolver -------------------------------- */

const SEARCH_LABEL: Record<BookingKind, string> = {
  hotel: "Search this stay",
  flight: "View live flights",
  train: "Check live trains",
};

const VERIFIED_LABEL: Record<BookingKind, string> = {
  hotel: "Book Now",
  flight: "Book Now",
  train: "Book Now",
};

const DEFAULT_PROVIDER: Record<BookingKind, string> = {
  hotel: "Booking.com",
  flight: "Google Flights",
  train: "IRCTC",
};

/**
 * Single entry point used by every booking button in the app.
 */
export function resolveBookingLink(
  kind: BookingKind,
  trip: TripParams,
  meta?: BookingMeta & { name?: string | null },
): ResolvedBookingLink {
  if (isVerifiedProviderUrl(meta)) {
    return {
      url: meta!.bookingUrl!,
      label: VERIFIED_LABEL[kind],
      verified: true,
      provider: clean(meta?.provider) || DEFAULT_PROVIDER[kind],
    };
  }

  const url =
    kind === "flight"
      ? flightSearchUrl(trip)
      : kind === "train"
        ? trainSearchUrl(trip)
        : hotelSearchUrl(trip, meta?.name);

  return {
    url,
    label: SEARCH_LABEL[kind],
    verified: false,
    provider: DEFAULT_PROVIDER[kind],
  };
}
