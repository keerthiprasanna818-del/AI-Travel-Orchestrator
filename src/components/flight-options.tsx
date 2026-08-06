import { useEffect, useState } from "react";
import { ArrowUpRight, BadgeCheck, BellRing, Loader2, Radio } from "lucide-react";
import { SectionTitle } from "@/components/site";
import { AirlineIdentity } from "@/components/airline-identity";
import { TrackPriceDialog } from "@/components/track-price-dialog";
import { searchLiveFlightOffers } from "@/lib/flights.functions";
import {
  clockFromDateTime,
  flightCodeFor,
  stopsLabelFor,
  type LiveFlightOffer,
} from "@/lib/flights";
import type { PlanFlight } from "@/lib/plan-schema";
import { resolveBookingLink, type TripParams } from "@/lib/booking-links";
import { formatMoney } from "@/lib/trip";
import { PRICE_DISCLAIMER } from "@/lib/price-alerts";


function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`glass rounded-[22px] p-5 ${className}`}>{children}</div>;
}

function Pill({
  tone = "primary",
  children,
}: {
  tone?: "primary" | "secondary" | "success" | "warning";
  children: React.ReactNode;
}) {
  const tones = {
    primary: "border-primary/50 bg-primary/15 text-foreground",
    secondary: "border-secondary/50 bg-secondary/12 text-secondary",
    success: "border-success/50 bg-success/12 text-success",
    warning: "border-warning/50 bg-warning/12 text-warning",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Row model shared by live and estimated flight cards (design is identical). */
type FlightRow = {
  key: string;
  airline: string;
  code: string;
  stops: string;
  depart: string;
  arrive: string;
  duration: string;
  fromLabel: string;
  toLabel: string;
  priceLabel: string;
  priceCaption: string;
  badge: string | null;
  href: string;
  ctaLabel: string;
  /** Live per-traveller fare in provider currency; null for AI estimates. */
  trackablePrice: number | null;
  currency: string;
};

function money(amount: number | null, currency: string): string {
  if (amount == null) return "—";
  if (currency.toUpperCase() === "INR") return formatMoney(amount);
  return `${currency.toUpperCase()} ${Math.round(amount).toLocaleString("en-IN")}`;
}

function liveRow(offer: LiveFlightOffer, index: number, trip: TripParams): FlightRow {
  const verified = offer.bookingUrlVerified && !!offer.bookingUrl;
  const fallback = resolveBookingLink("flight", trip);
  return {
    key: `${offer.offerId}-${index}`,
    airline: offer.airlineName,
    code: flightCodeFor(offer),
    stops: stopsLabelFor(offer),
    depart: clockFromDateTime(offer.departureDateTime),
    arrive: clockFromDateTime(offer.arrivalDateTime),
    duration: offer.totalDuration,
    fromLabel: offer.departureAirport || (trip.origin ?? ""),
    toLabel: offer.arrivalAirport || (trip.destination ?? ""),
    priceLabel: money(offer.pricePerTraveller ?? offer.totalPrice, offer.currency),
    priceCaption: offer.pricePerTraveller != null ? "per traveller" : "total",
    badge: null,
    href: verified ? offer.bookingUrl! : fallback.url,
    ctaLabel: verified ? "Book Now" : "View live flight options",
    trackablePrice: offer.pricePerTraveller ?? offer.totalPrice ?? null,
    currency: offer.currency || "INR",
  };
}

function estimatedRow(flight: PlanFlight, index: number, trip: TripParams): FlightRow {
  const link = resolveBookingLink("flight", trip, flight);
  return {
    key: `${flight.airline}-${index}`,
    airline: flight.airline,
    code: flight.code,
    stops: flight.stops,
    depart: flight.depart,
    arrive: flight.arrive,
    duration: flight.duration,
    fromLabel: trip.origin ?? "",
    toLabel: trip.destination ?? "",
    priceLabel: formatMoney(flight.price),
    priceCaption: "est. per traveller",
    badge: flight.badge ?? null,
    href: link.url,
    ctaLabel: link.label,
    trackablePrice: null,
    currency: "INR",
  };
}

type Props = {
  travelPlanId: string;
  estimated: PlanFlight[];
  trip: TripParams;
  travelClass?: string | null;
};

/**
 * Flight section: live provider results when available, otherwise the existing
 * AI-estimated recommendations, clearly labelled. Card design is unchanged.
 */
export function FlightOptionsSection({ travelPlanId, estimated, trip, travelClass }: Props) {
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<LiveFlightOffer[] | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackPrice, setTrackPrice] = useState<number | null>(null);
  const [trackCurrency, setTrackCurrency] = useState("INR");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void searchLiveFlightOffers({
      data: {
        travelPlanId,
        origin: trip.origin ?? "",
        destination: trip.destination ?? "",
        departureDate: trip.departureDate ?? "",
        returnDate: trip.returnDate ?? null,
        adults: trip.adults ?? 1,
        children: trip.children ?? 0,
        cabinClass: travelClass ?? "economy",
        currency: "INR",
        market: "IN",
        locale: "en-US",
      },
    })
      .then((response) => {
        if (cancelled) return;
        if (response.ok) {
          setOffers(response.result.offers);
          setLastUpdated(response.result.lastUpdated);
          if (!response.result.offers.length)
            setError("No live flights were returned for these dates.");
        } else {
          setError(response.error);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Live flight search is temporarily unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    travelPlanId,
    trip.origin,
    trip.destination,
    trip.departureDate,
    trip.returnDate,
    trip.adults,
    trip.children,
    travelClass,
  ]);

  const live = (offers ?? []).length > 0;
  const rows = live
    ? offers!.map((offer, i) => liveRow(offer, i, trip))
    : estimated.map((flight, i) => estimatedRow(flight, i, trip));

  return (
    <section>
      <SectionTitle
        eyebrow="Flight Comparison Agent"
        title={
          live
            ? "Live flight options from our booking provider"
            : "Estimated flight options ranked by AI"
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {loading ? (
          <Pill tone="primary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching live flights…
          </Pill>
        ) : live ? (
          <>
            <Pill tone="success">
              <Radio className="h-3.5 w-3.5" /> Live flight data
            </Pill>
            {lastUpdated ? (
              <span className="text-[11px] text-muted-foreground">
                Last updated {new Date(lastUpdated).toLocaleString("en-IN")}
              </span>
            ) : null}
          </>
        ) : (
          <>
            <Pill tone="warning">Estimated</Pill>
            <span className="text-[11px] text-muted-foreground">
              {error
                ? `${error} Showing AI estimates instead.`
                : "AI-estimated options, not live inventory."}
            </span>
          </>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {rows.map((row) => (
          <Card key={row.key} className="lift glow-border">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_1.4fr_auto] lg:items-center">
              <AirlineIdentity airline={row.airline} code={row.code} stops={row.stops} />

              <div className="flex items-center gap-4 text-sm">
                <div>
                  <div className="font-semibold">{row.depart}</div>
                  <div className="text-xs text-muted-foreground">{row.fromLabel}</div>
                </div>
                <div className="flex-1 border-t border-dashed border-border text-center text-[11px] text-muted-foreground">
                  {row.duration}
                </div>
                <div>
                  <div className="font-semibold">{row.arrive}</div>
                  <div className="text-xs text-muted-foreground">{row.toLabel}</div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 lg:justify-end">
                {row.badge ? (
                  <Pill
                    tone={
                      row.badge === "Cheapest"
                        ? "success"
                        : row.badge === "Fastest"
                          ? "warning"
                          : "primary"
                    }
                  >
                    <BadgeCheck className="h-3.5 w-3.5" /> {row.badge}
                  </Pill>
                ) : null}
                <div className="text-right">
                  <div className="text-lg font-semibold">{row.priceLabel}</div>
                  <div className="text-[11px] text-muted-foreground">{row.priceCaption}</div>
                </div>
                {row.trackablePrice != null ? (
                  <button
                    onClick={() => {
                      setTrackPrice(row.trackablePrice);
                      setTrackCurrency(row.currency);
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border bg-surface/70 px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/60"
                  >
                    <BellRing className="h-4 w-4" /> Track Price
                  </button>
                ) : null}
                <a
                  href={row.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-[image:var(--gradient-primary)] px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105"
                >
                  {row.ctaLabel} <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">{PRICE_DISCLAIMER}</p>

      {trackPrice != null ? (
        <TrackPriceDialog
          open
          onClose={() => setTrackPrice(null)}
          travelPlanId={travelPlanId}
          trip={trip}
          cabinClass={travelClass ?? "economy"}
          currency={trackCurrency}
          currentPrice={trackPrice}
          lastUpdated={lastUpdated}
        />
      ) : null}
    </section>
  );
}
