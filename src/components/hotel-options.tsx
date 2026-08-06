import { useEffect, useState } from "react";
import { Loader2, MapPin, Radio, Star } from "lucide-react";
import { SectionTitle } from "@/components/site";
import { HotelImage } from "@/components/hotel-image";
import { searchLiveHotelOffers } from "@/lib/hotels.functions";
import type { LiveHotelOffer } from "@/lib/hotels";
import type { PlanHotel } from "@/lib/plan-schema";
import { resolveBookingLink, type TripParams } from "@/lib/booking-links";
import { formatMoney } from "@/lib/trip";

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

const IMAGE_CLASS = "h-36 w-full rounded-t-[inherit] object-cover sm:h-40";

/**
 * Live hotel photo: only URLs the provider returned for THIS property are used,
 * stepping through that property's own gallery if one fails to load. When the
 * provider supplied no usable photo we fall back to the existing local resolver.
 */
function LiveHotelPhoto({
  name,
  destination,
  imageUrls,
}: {
  name: string;
  destination: string;
  imageUrls: string[];
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [imageUrls]);

  const src = imageUrls[index];
  if (!src) return <HotelImage name={name} destination={destination} className={IMAGE_CLASS} />;

  return (
    <img
      src={src}
      alt={`${name} in ${destination}`}
      loading="lazy"
      decoding="async"
      className={IMAGE_CLASS}
      onError={() => setIndex((i) => i + 1)}
    />
  );
}

/** Row model shared by live and estimated hotel cards (design is identical). */
type HotelRow = {
  key: string;
  name: string;
  destination: string;
  rating: string;
  badge: string;
  amenities: string[];
  distance: string;
  note: string;
  priceLabel: string;
  priceCaption: string;
  href: string;
  ctaLabel: string;
  photo: React.ReactNode;
};

function money(amount: number | null, currency: string): string {
  if (amount == null) return "—";
  if (currency.toUpperCase() === "INR") return formatMoney(amount);
  return `${currency.toUpperCase()} ${Math.round(amount).toLocaleString("en-IN")}`;
}

function liveRow(offer: LiveHotelOffer, index: number, trip: TripParams): HotelRow {
  const verified = offer.bookingUrlVerified && !!offer.bookingUrl;
  const fallback = resolveBookingLink("hotel", trip);
  const rating = offer.guestRating ?? offer.starRating;
  const destination = offer.destination || (trip.destination ?? "");
  return {
    key: `${offer.hotelId}-${index}`,
    name: offer.hotelName,
    destination,
    rating: rating != null ? String(rating) : "—",
    badge:
      offer.starRating != null
        ? `${offer.starRating}-star`
        : offer.availabilityStatus || "Available",
    amenities: offer.amenities.slice(0, 6),
    distance: offer.distanceFromCityCentre || offer.address || destination,
    note:
      offer.cancellationPolicy ??
      (offer.reviewCount != null
        ? `${offer.reviewCount.toLocaleString("en-IN")} guest reviews · ${offer.availabilityStatus}`
        : offer.availabilityStatus),
    priceLabel: money(offer.pricePerNight, offer.currency),
    priceCaption: " / night (live)",
    href: verified ? offer.bookingUrl! : fallback.url,
    ctaLabel: verified ? "Book Now" : "View live hotel options",
    photo: (
      <LiveHotelPhoto
        name={offer.hotelName}
        destination={destination}
        imageUrls={offer.imageUrls}
      />
    ),
  };
}

function estimatedRow(hotel: PlanHotel, index: number, trip: TripParams): HotelRow {
  const link = resolveBookingLink("hotel", trip, { ...hotel, name: hotel.name });
  const destination = trip.destination ?? "";
  return {
    key: `${hotel.name}-${index}`,
    name: hotel.name,
    destination,
    rating: String(hotel.rating),
    badge: `AI Match ${hotel.matchScore}%`,
    amenities: hotel.amenities ?? [],
    distance: hotel.distance,
    note: hotel.cancellation,
    priceLabel: formatMoney(hotel.pricePerNight),
    priceCaption: " / night (est.)",
    href: link.url,
    ctaLabel: link.label,
    photo: (
      <HotelImage
        name={hotel.name}
        destination={destination}
        imageUrl={hotel.imageUrl}
        className={IMAGE_CLASS}
      />
    ),
  };
}

type Props = {
  travelPlanId: string;
  estimated: PlanHotel[];
  trip: TripParams;
  rooms?: number | null;
};

/**
 * Hotel section: live provider results when available, otherwise the existing
 * AI-estimated recommendations, clearly labelled. Card design is unchanged.
 */
export function HotelOptionsSection({ travelPlanId, estimated, trip, rooms }: Props) {
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<LiveHotelOffer[] | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void searchLiveHotelOffers({
      data: {
        travelPlanId,
        destination: trip.destination ?? "",
        checkInDate: trip.departureDate ?? "",
        checkOutDate: trip.returnDate ?? "",
        adults: trip.adults ?? 1,
        children: trip.children ?? 0,
        rooms: rooms ?? 1,
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
            setError("No live stays were returned for these dates.");
        } else {
          setError(response.error);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Live hotel search is temporarily unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    travelPlanId,
    trip.destination,
    trip.departureDate,
    trip.returnDate,
    trip.adults,
    trip.children,
    rooms,
  ]);

  const live = (offers ?? []).length > 0;
  const rows = live
    ? offers!.map((offer, i) => liveRow(offer, i, trip))
    : estimated.map((hotel, i) => estimatedRow(hotel, i, trip));

  return (
    <section>
      <SectionTitle
        eyebrow="Hotel Comparison Agent"
        title={
          live ? "Live stays from our booking provider" : "Estimated stays matched to your brief"
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {loading ? (
          <Pill tone="primary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching live hotels…
          </Pill>
        ) : live ? (
          <>
            <Pill tone="success">
              <Radio className="h-3.5 w-3.5" /> Live hotel data
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
                : "AI-estimated stays, not live inventory."}
            </span>
          </>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {rows.map((row) => (
          <Card key={row.key} className="lift glow-border overflow-hidden p-0">
            {row.photo}
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{row.name}</h3>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-warning">
                    <Star className="h-3.5 w-3.5 fill-current" /> {row.rating}
                  </p>
                </div>
                <Pill tone="primary">{row.badge}</Pill>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {row.amenities.map((am) => (
                  <span
                    key={am}
                    className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {am}
                  </span>
                ))}
              </div>
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> {row.distance}
              </p>
              <p className="mt-1 text-xs text-success">{row.note}</p>
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <span className="text-lg font-semibold">{row.priceLabel}</span>
                  <span className="text-xs text-muted-foreground">{row.priceCaption}</span>
                </div>
                <a
                  href={row.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whitespace-nowrap rounded-xl bg-[image:var(--gradient-primary)] px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105"
                >
                  {row.ctaLabel}
                </a>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
