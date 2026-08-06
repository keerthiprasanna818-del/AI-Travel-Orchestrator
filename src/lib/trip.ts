import type { LocationSuggestion } from "./location";

export type TripPlan = {
  travelType: "Domestic" | "International";
  from: string;
  destination: string;
  /** Structured GeoNames selection; readable text still lives in `from`. */
  fromLocation?: LocationSuggestion | null;
  /** Structured GeoNames selection; readable text still lives in `destination`. */
  destinationLocation?: LocationSuggestion | null;
  departDate: string;
  returnDate: string;
  budget: string;
  adults: number;
  children: number;
  companion: string;
  purpose: string;
  preferences: string[];
  transport: string;
  accommodation: string;
};

export const TRIP_STORAGE_KEY = "ai-travel-orchestrator-trip";

/**
 * Neutral blank form. No demo cities, dates, budget or preferences: a fresh
 * session always starts empty. Domestic is kept as the single default travel
 * type because the generator requires one.
 */
export const emptyTrip: TripPlan = {
  travelType: "Domestic",
  from: "",
  destination: "",
  fromLocation: null,
  destinationLocation: null,
  departDate: "",
  returnDate: "",
  budget: "",
  adults: 1,
  children: 0,
  companion: "",
  purpose: "",
  preferences: [],
  // Explicit, consistent default so the selector is never in an unselected
  // state that swallows the first click.
  transport: "Flights",
  accommodation: "",
};


/** Kept for existing imports — the default form is now blank. */
export const defaultTrip: TripPlan = emptyTrip;

export function saveTrip(trip: TripPlan) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(trip));
  } catch {
    /* storage unavailable */
  }
}

export function clearTrip() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TRIP_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function loadTrip(): TripPlan {
  if (typeof window === "undefined") return emptyTrip;
  try {
    const raw = window.localStorage.getItem(TRIP_STORAGE_KEY);
    if (!raw) return emptyTrip;
    return { ...emptyTrip, ...(JSON.parse(raw) as Partial<TripPlan>) };
  } catch {
    return emptyTrip;
  }
}

export function tripNights(trip: TripPlan) {
  const a = new Date(trip.departDate).getTime();
  const b = new Date(trip.returnDate).getTime();
  const nights = Math.round((b - a) / 86_400_000);
  return Number.isFinite(nights) && nights > 0 ? nights : 4;
}

export function cityName(value: string) {
  return value.replace(/\s*\(.*\)$/, "").trim() || value;
}

export function formatMoney(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export function budgetNumber(trip: TripPlan) {
  const digits = trip.budget.replace(/[^0-9.]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : 85000;
}

export function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}