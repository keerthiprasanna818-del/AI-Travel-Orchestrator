/**
 * Shared (client-safe) types and helpers for the live hotel search feature.
 * No provider credentials or provider-specific logic lives here.
 */

export type LiveHotelOffer = {
  hotelId: string;
  provider: string;
  hotelName: string;
  destination: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  starRating: number | null;
  guestRating: number | null;
  reviewCount: number | null;
  roomType: string | null;
  amenities: string[];
  imageUrls: string[];
  primaryImageUrl: string | null;
  pricePerNight: number | null;
  totalPrice: number | null;
  currency: string;
  taxesAndFees: number | null;
  cancellationPolicy: string | null;
  distanceFromCityCentre: string | null;
  availabilityStatus: string;
  bookingUrl: string | null;
  bookingUrlVerified: boolean;
  lastUpdated: string;
  dataSource: string;
  liveData: true;
};

export type LiveHotelSearchInput = {
  travelPlanId: string;
  destination: string;
  checkInDate: string;
  checkOutDate: string;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  adults?: number | null | undefined;
  children?: number | null | undefined;
  rooms?: number | null | undefined;
  currency?: string | null | undefined;
  market?: string | null | undefined;
  locale?: string | null | undefined;
};

export type LiveHotelSearchResult = {
  travelPlanId: string;
  offers: LiveHotelOffer[];
  lastUpdated: string;
  dataSource: string;
  destination: { entityId: string; label: string } | null;
  nights: number;
};

export type LiveHotelSearchResponse =
  { ok: true; result: LiveHotelSearchResult } | { ok: false; error: string };

export type LiveHotelPlace = {
  entityId: string;
  name: string;
  label: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Provider photo URLs are templates ("..._WxH.jpg"). Resolve a concrete size so
 * the card never requests a broken asset. Non-template URLs pass through.
 */
export function sizedHotelImage(url: string | null | undefined, size = "800x600"): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  if (!/^https:\/\//i.test(raw)) return null;
  return raw.replace(/_WxH(\.[a-z]{3,4})$/i, `_${size}$1`);
}

/** Whole nights between two ISO dates (minimum 1). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T00:00:00Z`).getTime();
  const b = new Date(`${checkOut}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86400000));
}
