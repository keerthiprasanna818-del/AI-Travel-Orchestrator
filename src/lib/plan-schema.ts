import type { TripWeather } from "./weather";

export type PlanFlight = {
  airline: string;
  code: string;
  depart: string;
  arrive: string;
  duration: string;
  stops: string;
  price: number;
  badge?: string | null;
  /** Booking provenance — set only when a live provider API returns data. */
  provider?: string | null;
  providerId?: string | null;
  bookingUrl?: string | null;
  bookingUrlVerified?: boolean | null;
  liveData?: boolean | null;
};

export type PlanTrain = {
  name: string;
  number: string;
  depart: string;
  arrive: string;
  duration: string;
  classes: string;
  price: number;
  badge?: string | null;
  /** Booking provenance — set only when a live provider API returns data. */
  provider?: string | null;
  providerId?: string | null;
  bookingUrl?: string | null;
  bookingUrlVerified?: boolean | null;
  liveData?: boolean | null;
};

export type PlanHotel = {
  name: string;
  rating: number;
  matchScore: number;
  pricePerNight: number;
  amenities: string[];
  distance: string;
  cancellation: string;
  /** Booking provenance — set only when a live provider API returns data. */
  provider?: string | null;
  providerId?: string | null;
  bookingUrl?: string | null;
  bookingUrlVerified?: boolean | null;
  liveData?: boolean | null;
  /** Local verified image path (resolved client-side, never AI-generated). */
  imageUrl?: string | null;
};

export type PlanDay = {
  day: number;
  title: string;
  morning: string;
  afternoon: string;
  evening: string;
  transport: string;
  estimatedSpend: number;
};

export type PlanExperience = {
  name: string;
  category: string;
  rating: number;
  description: string;
  duration: string;
  /** Local image path resolved on the client (never an AI-invented URL). */
  imageUrl?: string;
};

export type PlanResult = {
  summary: {
    origin: string;
    destination: string;
    travelType: string;
    departureDate: string;
    returnDate: string;
    durationDays: number;
    nights: number;
    travellers: number;
    adults: number;
    children: number;
    companion: string;
    purpose: string;
    budget: number;
    accommodation: string;
    transportPreference: string;
    preferences: string[];
    confidence: number;
    decisionSummary: string;
  };
  flights: PlanFlight[];
  trains: PlanTrain[];
  hotels: PlanHotel[];
  budget: {
    breakdown: { label: string; value: number }[];
    total: number;
    savings: number;
    remaining: number;
    suggestions: string[];
  };
  itinerary: PlanDay[];
  experiences: PlanExperience[];
  assistant: {
    packingChecklist: string[];
    weather: { day: string; temp: string; condition: string }[];
    emergencyContacts: { label: string; value: string }[];
    currencyGuidance: string;
    visaInformation: string | null;
    localTransportTips: string;
    safetyTips: string;
    travelReminders: string;
  };
  insights: string[];
  /** Verified weather snapshot from the backend weather function (never AI-authored). */
  weather?: TripWeather | null;
};

export type TravelPlanRow = {
  id: string;
  travel_type: string;
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string;
  estimated_budget: number;
  adults: number;
  children: number;
  travel_companion: string | null;
  trip_purpose: string | null;
  preferences: string[];
  transport_preference: string | null;
  accommodation_preference: string | null;
  status: string;
  plan_result: PlanResult | null;
  error_message: string | null;
};
