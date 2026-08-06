import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Sparkles, ArrowRight, Minus, Plus, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { supabase, SUPABASE_PROJECT_URL } from "@/integrations/supabase/project-client";
import { Aurora, NavBar, SiteFooter } from "@/components/site";
import { MarketingSections } from "@/components/marketing-sections";
import { RequireAuth } from "@/components/require-auth";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import { DateField } from "@/components/date-field";
import { TransportSelect } from "@/components/transport-select";
import { todayIso, validateDateRange } from "@/lib/date-input";
import type { LocationSuggestion } from "@/lib/location";
import { addRecentPlan } from "@/lib/recent-plans";
import { emptyTrip, loadTrip, saveTrip, type TripPlan } from "@/lib/trip";
import { consumeRestoreFormOnce, resetTravelForm } from "@/lib/session-state";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Travel Orchestrator — Your AI Travel Team" },
      {
        name: "description",
        content:
          "Nine specialised AI agents compare flights, trains and hotels, optimise your budget and build a day-wise itinerary in minutes.",
      },
      { property: "og:title", content: "AI Travel Orchestrator — Your AI Travel Team" },
      {
        property: "og:description",
        content:
          "Nine specialised AI agents compare flights, trains and hotels, optimise your budget and build a day-wise itinerary in minutes.",
      },
    ],
  }),
  component: Landing,
});

const COMPANIONS = ["Solo", "Couple", "Family", "Friends", "Business Team"];
const PURPOSES = ["Vacation", "Business", "Pilgrimage", "Adventure", "Honeymoon"];
const PREFERENCES = [
  "Adventure",
  "Nature",
  "Food",
  "Shopping",
  "Luxury",
  "Beaches",
  "Mountains",
  "Wildlife",
  "Culture",
  "Historical Places",
  "Photography",
  "Wellness",
  "Nightlife",
  "Road Trip",
  "Trekking",
  "Camping",
  "Local Experiences",
  "Romantic",
  "Budget Friendly",
  "Eco Friendly",
  "Pet Friendly",
  "Kid Friendly",
  "Senior Citizen Friendly",
  "Spiritual",
];
const TRANSPORT = ["Flights", "Trains", "Bus", "Any"];
const STAYS = [
  "Budget Hotel",
  "Mid-range Hotel",
  "Luxury Hotel",
  "Resort",
  "Villa",
  "Hostel",
  "Homestay",
];

/**
 * Field wrapper. Deliberately a <div>, not a <label>: several fields contain
 * button groups, and a wrapping label intercepts clicks on those controls,
 * which is what made the transport options need a second click.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-input bg-background/60 px-3.5 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/70 focus:border-primary/70 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_22%,transparent)]";

function Counter({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center justify-between rounded-xl border border-input bg-background/60 px-2 py-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="grid h-7 w-7 place-items-center rounded-lg border border-border transition-colors hover:border-primary/70 hover:text-primary"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="text-sm font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="grid h-7 w-7 place-items-center rounded-lg border border-border transition-colors hover:border-primary/70 hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </Field>
  );
}

/** Root travel-planning experience — authenticated users only. */
function Landing() {
  return (
    <RequireAuth>
      <Planner />
    </RequireAuth>
  );
}

function Planner() {
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripPlan>(emptyTrip);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { user, loading: authLoading } = useAuth();

  if (typeof window !== "undefined" && !hydrated) {
    setHydrated(true);
    // The form is blank on every visit. The only exception is the single
    // restore right after an OAuth round-trip started from a completed form.
    if (consumeRestoreFormOnce()) setTrip(loadTrip());
    else resetTravelForm();
  }

  const set = <K extends keyof TripPlan>(key: K, value: TripPlan[K]) =>
    setTrip((prev) => ({ ...prev, [key]: value }));

  /** Departure changes clear a now-invalid return date automatically. */
  const setDeparture = (iso: string) =>
    setTrip((prev) => {
      const next = { ...prev, departDate: iso };
      if (iso && next.returnDate && next.returnDate < iso) next.returnDate = "";
      return next;
    });

  /**
   * Trip type is derived from the two selected countries once both are known.
   * It only affects itinerary generation/pricing — never the location search.
   */
  const selectLocation = (
    key: "fromLocation" | "destinationLocation",
    loc: LocationSuggestion | null,
  ) =>
    setTrip((prev) => {
      const next = { ...prev, [key]: loc };
      const a = next.fromLocation?.countryCode;
      const b = next.destinationLocation?.countryCode;
      if (a && b) next.travelType = a === b ? "Domestic" : "International";
      return next;
    });

  const togglePreference = (pref: string) =>
    setTrip((prev) => ({
      ...prev,
      preferences: prev.preferences.includes(pref)
        ? prev.preferences.filter((p) => p !== pref)
        : [...prev.preferences, pref],
    }));

  const validate = (): string | null => {
    if (!trip.from.trim()) return "Please enter where you're travelling from.";
    if (!trip.destination.trim()) return "Please enter your destination.";
    if (!trip.departDate) return "Please pick a departure date.";
    if (!trip.returnDate) return "Please pick a return date.";
    const dateProblem = validateDateRange(trip.departDate, trip.returnDate);
    if (dateProblem) return dateProblem;
    const budget = Number(trip.budget.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(budget) || budget <= 0) return "Please enter a valid budget.";
    if (trip.adults < 1) return "At least one adult is required.";
    if (!trip.companion) return "Please select a travel companion.";
    if (!trip.purpose) return "Please select a trip purpose.";
    if (trip.preferences.length === 0) return "Please select at least one preference.";
    if (!trip.transport) return "Please select a transportation preference.";
    if (!trip.accommodation) return "Please select an accommodation preference.";
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }

    // The form only renders for signed-in users (RequireAuth), so a missing
    // session here can only mean the session expired mid-session.
    if (authLoading) {
      toast.info("Checking your session…");
      return;
    }
    if (!user) {
      toast.info("Your session expired. Please sign in again.");
      void navigate({ to: "/auth" });
      return;
    }

    setSubmitting(true);
    const payload = {
      travel_type: trip.travelType,
      origin: trip.from.trim(),
      destination: trip.destination.trim(),
      departure_date: trip.departDate,
      return_date: trip.returnDate,
      estimated_budget: Number(trip.budget.replace(/[^0-9.]/g, "")),
      adults: Number(trip.adults),
      children: Number(trip.children),
      travel_companion: trip.companion,
      trip_purpose: trip.purpose,
      preferences: [...trip.preferences],
      transport_preference: trip.transport,
      accommodation_preference: trip.accommodation,
      status: "processing",
      user_id: user.id,
    };
    console.log("SUPABASE PROJECT URL", SUPABASE_PROJECT_URL);
    console.log("SUPABASE CLIENT EXISTS", Boolean(supabase));
    console.log("TRAVEL PLAN PAYLOAD", payload);
    try {
      const { data, error } = await supabase
        .from("travel_plans")
        .insert(payload)
        .select("id")
        .single();

      console.log("TRAVEL PLAN INSERT DATA", data);
      console.log("TRAVEL PLAN INSERT ERROR OBJECT", error);
      if (error) {
        console.error("TRAVEL PLAN INSERT ERROR", error);
        console.log("TRAVEL PLAN ERROR CODE", error.code);
        console.log("TRAVEL PLAN ERROR DETAILS", error.details);
        console.log("TRAVEL PLAN ERROR HINT", error.hint);
        toast.error(error.message);
        setSubmitting(false);
        return;
      }
      if (!data?.id) {
        const msg = "No row returned from travel_plans insert";
        console.error("TRAVEL PLAN INSERT ERROR", msg);
        toast.error(msg);
        setSubmitting(false);
        return;
      }

      // The trip is kept only so /processing can show the summary; the form
      // itself is reset so returning home never shows the old values.
      saveTrip(trip);
      window.sessionStorage.setItem("travelPlanId", data.id);
      addRecentPlan({
        id: data.id,
        destination: trip.destination,
        origin: trip.from,
        status: "processing",
      });
      setTrip(emptyTrip);
      navigate({ to: "/processing", search: { id: data.id } });
    } catch (err) {
      console.error("TRAVEL PLAN INSERT ERROR", err);
      const message =
        (err as { message?: string } | null)?.message ??
        "Unable to create travel plan. Please try again.";
      toast.error(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Aurora />
      <NavBar />

      <section className="mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-14 lg:grid-cols-[1fr_1.05fr] lg:px-8 lg:pt-20">
        <div className="animate-rise self-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-secondary">
            <Sparkles className="h-3.5 w-3.5" /> 9 specialised agents · one orchestrated plan
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.08] sm:text-5xl xl:text-6xl">
            Plan Smarter. Travel Better.{" "}
            <span className="text-gradient">Powered by Your AI Travel Team.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Specialised AI agents collaborate to compare flights, trains and hotels, optimise your
            budget, craft a personalised day-wise itinerary, recommend experiences worth your time,
            and prepare you for every hour of the journey.
          </p>
          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4">
            {[
              ["9", "AI agents"],
              ["40+", "Signals compared"],
              ["<60s", "To a full plan"],
            ].map(([v, l]) => (
              <div key={l} className="glass rounded-2xl px-4 py-3">
                <dt className="text-2xl font-semibold text-gradient">{v}</dt>
                <dd className="text-xs text-muted-foreground">{l}</dd>
              </div>
            ))}
          </dl>
        </div>

        <form
          onSubmit={submit}
          className="glass glow-border animate-rise rounded-[24px] p-5 sm:p-7"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Plan Your Journey</h2>
              <p className="mt-1 text-sm text-muted-foreground">Give the agents your brief.</p>
            </div>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary animate-pulse-glow">
              <Sparkles className="h-5 w-5" />
            </span>
          </div>

          <div className="mt-6 space-y-5">
            <Field label="Travel Type">
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-input bg-background/60 p-1">
                {(["Domestic", "International"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("travelType", t)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                      trip.travelType === t
                        ? "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-glow)]"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From">
                <LocationAutocomplete
                  value={trip.from}
                  onChange={(v) => set("from", v)}
                  onSelectLocation={(loc) => selectLocation("fromLocation", loc)}
                  placeholder="Search city, district, state, airport or country"
                />
              </Field>
              <Field label="Destination">
                <LocationAutocomplete
                  value={trip.destination}
                  onChange={(v) => set("destination", v)}
                  onSelectLocation={(loc) => selectLocation("destinationLocation", loc)}
                  placeholder="Search city, district, state, airport or country"
                />
              </Field>
              <Field label="Departure Date">
                <DateField
                  ariaLabel="Departure date"
                  value={trip.departDate}
                  min={todayIso()}
                  onChange={setDeparture}
                />
              </Field>
              <Field label="Return Date">
                <DateField
                  ariaLabel="Return date"
                  value={trip.returnDate}
                  min={trip.departDate || todayIso()}
                  onChange={(iso) => set("returnDate", iso)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Estimated Budget">
                <input
                  className={inputClass}
                  value={trip.budget}
                  onChange={(e) => set("budget", e.target.value)}
                  placeholder="e.g. 85000"
                  inputMode="numeric"
                />
              </Field>
              <Counter label="Adults" value={trip.adults} onChange={(n) => set("adults", n)} />
              <Counter
                label="Children"
                value={trip.children}
                onChange={(n) => set("children", n)}
              />
            </div>

            <Field label="Travel Companion">
              <div className="flex flex-wrap gap-2">
                {COMPANIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set("companion", c)}
                    className={`rounded-full border px-3.5 py-1.5 text-sm transition-all ${
                      trip.companion === c
                        ? "border-secondary/70 bg-secondary/15 text-secondary"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Trip Purpose">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {PURPOSES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => set("purpose", p)}
                    className={`rounded-xl border px-2 py-3 text-xs font-medium transition-all ${
                      trip.purpose === p
                        ? "border-primary/70 bg-primary/15 text-foreground shadow-[var(--shadow-glow)]"
                        : "border-border bg-background/40 text-muted-foreground hover:-translate-y-0.5 hover:text-foreground"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={`Preferences (${trip.preferences.length} selected)`}>
              <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto pr-1">
                {PREFERENCES.map((p) => {
                  const active = trip.preferences.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePreference(p)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all ${
                        active
                          ? "border-primary/70 bg-primary/20 text-foreground"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {active ? <Check className="h-3 w-3" /> : null}
                      {p}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Transportation Preference">
              <TransportSelect
                options={TRANSPORT}
                value={trip.transport}
                onChange={(next) => set("transport", next)}
              />
            </Field>

            <Field label="Accommodation Preference">
              <select
                className={inputClass}
                value={trip.accommodation}
                onChange={(e) => set("accommodation", e.target.value)}
              >
                <option value="" disabled className="bg-surface">
                  Select a stay type
                </option>
                {STAYS.map((t) => (
                  <option key={t} value={t} className="bg-surface">
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <button
              type="submit"
              disabled={submitting}
              className="group relative w-full overflow-hidden rounded-2xl bg-[image:var(--gradient-primary)] px-6 py-4 text-base font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-transform hover:scale-[1.015] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
            >
              <span className="relative z-10 inline-flex items-center justify-center gap-2">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating your travel plan…
                  </>
                ) : (
                  <>
                    ✨ Generate My AI Travel Plan
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </span>
            </button>
          </div>
        </form>
      </section>

      <MarketingSections />

      <SiteFooter />
    </div>
  );
}
