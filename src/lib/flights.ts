import { resolveAirline } from "./airlines";

/**
 * Shared (client-safe) types for the live flight search feature.
 * No provider credentials or provider-specific logic lives here.
 */

export type LiveFlightSegment = {
  airlineName: string;
  airlineIataCode: string;
  /** lowercase IATA key used by the local airline logo resolver. */
  airlineLogoKey: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureDateTime: string;
  arrivalDateTime: string;
  durationMinutes: number | null;
  aircraftCode: string | null;
};

export type LiveFlightOffer = {
  offerId: string;
  provider: string;
  providerEntityId: string | null;
  validatingAirline: string | null;
  airlineName: string;
  airlineIataCode: string;
  airlineLogoKey: string;
  outboundSegments: LiveFlightSegment[];
  returnSegments: LiveFlightSegment[] | null;
  departureAirport: string;
  arrivalAirport: string;
  departureDateTime: string;
  arrivalDateTime: string;
  /** Human readable, e.g. "2h 10m". */
  totalDuration: string;
  numberOfStops: number;
  stopAirports: string[];
  aircraftCode: string | null;
  cabinClass: string;
  baggageAllowance: string | null;
  totalPrice: number | null;
  currency: string;
  pricePerTraveller: number | null;
  availableSeats: number | null;
  bookingUrl: string | null;
  bookingUrlVerified: boolean;
  lastUpdated: string;
  dataSource: string;
  liveData: true;
};

export type LiveFlightSearchInput = {
  travelPlanId: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string | null | undefined;
  adults?: number | null | undefined;
  children?: number | null | undefined;
  cabinClass?: string | null | undefined;
  currency?: string | null | undefined;
  market?: string | null | undefined;
  locale?: string | null | undefined;
};

export type LiveFlightSearchResult = {
  travelPlanId: string;
  offers: LiveFlightOffer[];
  lastUpdated: string;
  dataSource: string;
  origin: { skyId: string; label: string } | null;
  destination: { skyId: string; label: string } | null;
};

export type LiveFlightSearchResponse =
  { ok: true; result: LiveFlightSearchResult } | { ok: false; error: string };

/** "2h 10m" from a minute count. */
export function formatDurationMinutes(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

/** "06:15" local clock from an ISO-ish datetime string. */
export function clockFromDateTime(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const m = /T(\d{2}:\d{2})/.exec(raw);
  if (m) return m[1]!;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(11, 16);
}

/** Stops label consistent with the estimated-flight cards. */
export function stopsLabelFor(offer: LiveFlightOffer): string {
  if (offer.numberOfStops <= 0) return "Non-stop";
  const base = `${offer.numberOfStops} Stop${offer.numberOfStops > 1 ? "s" : ""}`;
  const via = offer.stopAirports.filter(Boolean).join(", ");
  return via ? `${base} via ${via}` : base;
}

/**
 * Flight-code string for the shared airline card. For a non-stop offer only the
 * first segment number is used, so a connection number can never render for a
 * direct flight.
 */
export function flightCodeFor(offer: LiveFlightOffer): string {
  const segs =
    offer.numberOfStops <= 0 ? offer.outboundSegments.slice(0, 1) : offer.outboundSegments;
  return segs
    .map((sgmt) => {
      const iata =
        sgmt.airlineIataCode || resolveAirline(sgmt.airlineName || offer.airlineName)?.iata || "";
      return iata && sgmt.flightNumber ? `${iata} ${sgmt.flightNumber}` : "";
    })
    .filter(Boolean)
    .join(" / ");
}
