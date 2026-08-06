import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Bus,
  Coins,
  FileText,
  Globe2,
  Heart,
  Lightbulb,
  Loader2,
  Luggage,
  MapPin,
  Phone,
  Plane,
  RefreshCw,
  Share2,
  ShieldCheck,
  Star,
  TrainFront,
  Wallet,
} from "lucide-react";
import { Aurora, NavBar, SectionTitle, SiteFooter } from "@/components/site";
import { db } from "@/integrations/supabase/project-client";
import { addRecentPlan, updateRecentPlan, type RecentPlan } from "@/lib/recent-plans";
import { generateTravelPlan } from "@/lib/travel-plan.functions";
import type { PlanResult } from "@/lib/plan-schema";
import { formatMoney } from "@/lib/trip";
import { resolveBookingLink, type TripParams } from "@/lib/booking-links";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { AirlineIdentity } from "@/components/airline-identity";
import { ExperienceImage } from "@/components/experience-image";
import { HotelOptionsSection } from "@/components/hotel-options";
import { ExportPdfButton } from "@/components/export-pdf-button";
import { TripWeatherCard } from "@/components/trip-weather-card";
import { FlightOptionsSection } from "@/components/flight-options";

export const Route = createFileRoute("/dashboard/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your AI Travel Plan — AI Travel Orchestrator" },
      {
        name: "description",
        content:
          "A premium AI travel command center: estimated flight, train and hotel comparison, budget optimisation, day-wise itinerary and local experiences.",
      },
      { property: "og:title", content: "Your AI Travel Plan" },
      {
        property: "og:description",
        content:
          "Estimated flight, train and hotel comparison with budget optimisation and a day-wise AI itinerary.",
      },
    ],
  }),
  component: DashboardRoute,
});

function DashboardRoute() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}

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

const CHART = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function formatDay(value: string) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function Dashboard() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [status, setStatus] = useState<
    "loading" | "processing" | "completed" | "failed" | "missing"
  >("loading");
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      const { data, error } = await db
        .from("travel_plans")
        .select(
          "status, plan_result, error_message, origin, destination, departure_date, return_date, user_id",
        )
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (data && data.user_id !== userId) {
        toast.error("You do not have access to this trip");
        void navigate({ to: "/my-trips" });
        return;
      }
      if (error || !data) {
        setStatus("missing");
        setErrorMessage(error?.message ?? "Travel plan not found.");
        return;
      }
      addRecentPlan({
        id,
        destination: data.destination ?? "",
        origin: data.origin ?? "",
        status: (data.status as RecentPlan["status"]) ?? "processing",
      });
      setErrorMessage(data.error_message ?? null);
      if (data.status === "completed" && data.plan_result) {
        setPlan(data.plan_result as PlanResult);
        setStatus("completed");
        updateRecentPlan(id, { status: "completed" });
      } else if (data.status === "failed") {
        setStatus("failed");
        updateRecentPlan(id, { status: "failed" });
      } else {
        setStatus("processing");
        updateRecentPlan(id, { status: "processing" });
      }
    };
    void load();
    const poll = window.setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [id, userId, navigate]);

  const retry = async () => {
    setRetrying(true);
    setErrorMessage(null);
    await db
      .from("travel_plans")
      .update({ status: "processing", error_message: null })
      .eq("id", id)
      .eq("user_id", userId);
    setStatus("processing");
    try {
      await generateTravelPlan({ data: { travelPlanId: id } });
    } catch (err) {
      console.error("GENERATE TRAVEL PLAN ERROR", err);
    }
    setRetrying(false);
  };

  if (status !== "completed" || !plan) {
    return (
      <div className="min-h-screen">
        <Aurora />
        <NavBar />
        <main className="mx-auto flex max-w-3xl flex-col items-center px-5 py-24 text-center lg:px-8">
          {status === "failed" || status === "missing" ? (
            <Card className="glow-border w-full">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-warning/15 text-warning">
                <AlertTriangle className="h-7 w-7" />
              </span>
              <h1 className="mt-4 text-2xl font-semibold">Plan generation failed</h1>
              <p className="mt-2 break-words text-sm text-muted-foreground">
                {errorMessage ?? "Something went wrong while generating your travel plan."}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {status === "failed" ? (
                  <button
                    onClick={() => void retry()}
                    disabled={retrying}
                    className="inline-flex items-center gap-2 rounded-xl bg-[image:var(--gradient-primary)] px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 disabled:opacity-60"
                  >
                    {retrying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}{" "}
                    Retry
                  </button>
                ) : null}
                <button
                  onClick={() => void navigate({ to: "/" })}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/70 px-5 py-3 text-sm font-semibold transition-all hover:border-primary/60"
                >
                  Plan Another Journey
                </button>
              </div>
            </Card>
          ) : (
            <Card className="glow-border w-full">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">
                Your AI travel plan is still being generated…
              </p>
            </Card>
          )}
        </main>
        <SiteFooter />
      </div>
    );
  }

  const s = plan.summary;
  const breakdown = plan.budget.breakdown ?? [];
  const maxBudget = Math.max(1, ...breakdown.map((b) => b.value));
  const a = plan.assistant;
  const tripParams: TripParams = {
    origin: s.origin,
    destination: s.destination,
    departureDate: s.departureDate,
    returnDate: s.returnDate,
    adults: s.adults,
    children: s.children,
    nights: s.nights,
  };

  const summary = [
    { label: "Destination", value: `${s.origin} → ${s.destination}` },
    { label: "Travel Dates", value: `${formatDay(s.departureDate)} – ${formatDay(s.returnDate)}` },
    { label: "Duration", value: `${s.durationDays} days · ${s.nights} nights` },
    { label: "Travel Type", value: s.travelType },
    {
      label: "Companion",
      value: `${s.companion} · ${s.adults} adult${s.adults === 1 ? "" : "s"}${s.children ? `, ${s.children} child` : ""}`,
    },
    { label: "Budget", value: formatMoney(s.budget) },
    { label: "Trip Purpose", value: s.purpose },
    { label: "Accommodation", value: s.accommodation },
  ];

  return (
    <div className="min-h-screen">
      <Aurora />
      <NavBar />

      <main className="mx-auto max-w-7xl space-y-16 px-5 py-12 lg:px-8">
        <header className="animate-rise">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold sm:text-4xl">🎉 Your AI Travel Plan</h1>
              <p className="mt-2 text-muted-foreground">
                Orchestrated by nine agents for your {(s.purpose || "").toLowerCase()} trip to{" "}
                {s.destination}.
              </p>
            </div>
            <div className="glass shrink-0 rounded-2xl px-4 py-3 text-center">
              <div className="text-2xl font-semibold text-gradient">{s.confidence}%</div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                AI Confidence
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summary.map((item) => (
              <Card key={item.label} className="lift">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {item.label}
                </div>
                <div className="mt-1.5 text-sm font-semibold">{item.value}</div>
              </Card>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(s.preferences ?? []).map((p) => (
              <Pill key={p} tone="secondary">
                {p}
              </Pill>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            All flight, train, hotel, weather, availability and price details below are AI
            estimates, not live inventory.
          </p>
        </header>

        <section>
          <Card className="glow-border">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">AI Decision Summary</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {s.decisionSummary}
            </p>
          </Card>
        </section>

        <FlightOptionsSection
          travelPlanId={id}
          estimated={plan.flights}
          trip={tripParams}
          travelClass="economy"
        />

        <section>
          <SectionTitle eyebrow="Train Comparison Agent" title="Estimated rail alternatives" />
          <div className="mt-8">
            {plan.trains.length === 0 ? (
              <Card className="text-center">
                <TrainFront className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  No train routes available for this journey.
                </p>
              </Card>
            ) : (
              <div className="grid gap-3 lg:grid-cols-3">
                {plan.trains.map((t, i) => (
                  <Card key={`${t.number}-${i}`} className="lift glow-border">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">{t.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          #{t.number} · {t.classes}
                        </p>
                      </div>
                      {t.badge ? <Pill tone="secondary">{t.badge}</Pill> : null}
                    </div>
                    <div className="mt-4 flex items-center justify-between text-sm">
                      <span className="font-semibold">{t.depart}</span>
                      <span className="text-[11px] text-muted-foreground">{t.duration}</span>
                      <span className="font-semibold">{t.arrive}</span>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-lg font-semibold">{formatMoney(t.price)}</span>
                      <a
                        href={resolveBookingLink("train", tripParams, t).url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="whitespace-nowrap rounded-xl border border-border px-3.5 py-2 text-sm transition-colors hover:border-primary/60 hover:text-primary"
                      >
                        {resolveBookingLink("train", tripParams, t).label}
                      </a>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>

        <HotelOptionsSection
          travelPlanId={id}
          estimated={plan.hotels}
          trip={tripParams}
          rooms={1}
        />

        <section>
          <SectionTitle eyebrow="Budget Optimizer Agent" title="Where every rupee goes" />
          <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <div className="space-y-3.5">
                {breakdown.map((b, i) => (
                  <div key={b.label}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{b.label}</span>
                      <span className="font-semibold tabular-nums">{formatMoney(b.value)}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${(b.value / maxBudget) * 100}%`,
                          background: CHART[i % CHART.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <Card className="lift">
                  <Wallet className="h-4 w-4 text-primary" />
                  <div className="mt-2 text-xs text-muted-foreground">Estimated Total Cost</div>
                  <div className="text-xl font-semibold">{formatMoney(plan.budget.total)}</div>
                </Card>
                <Card className="lift">
                  <Coins className="h-4 w-4 text-success" />
                  <div className="mt-2 text-xs text-muted-foreground">Estimated Savings</div>
                  <div className="text-xl font-semibold text-success">
                    {formatMoney(plan.budget.savings)}
                  </div>
                </Card>
                <Card className="lift">
                  <ShieldCheck
                    className={`h-4 w-4 ${plan.budget.remaining >= 0 ? "text-secondary" : "text-warning"}`}
                  />
                  <div className="mt-2 text-xs text-muted-foreground">Budget Remaining</div>
                  <div
                    className={`text-xl font-semibold ${plan.budget.remaining >= 0 ? "text-secondary" : "text-warning"}`}
                  >
                    {formatMoney(plan.budget.remaining)}
                  </div>
                </Card>
              </div>
              <Card className="glow-border">
                <h3 className="text-sm font-semibold">AI suggestions</h3>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {(plan.budget.suggestions ?? []).map((sug) => (
                    <li key={sug} className="flex gap-2">
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <span>{sug}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </section>

        <section>
          <SectionTitle eyebrow="Itinerary Agent" title="Your day-wise plan" />
          <div className="mt-8 space-y-4 border-l border-border pl-5 sm:pl-8">
            {plan.itinerary.map((d) => (
              <div key={d.day} className="relative">
                <span className="absolute -left-[27px] top-6 h-3 w-3 rounded-full bg-[image:var(--gradient-primary)] shadow-[var(--shadow-glow)] sm:-left-[39px]" />
                <Card className="lift">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-xs uppercase tracking-wider text-secondary">
                        Day {d.day}
                      </span>
                      <h3 className="text-base font-semibold">{d.title}</h3>
                    </div>
                    <Pill tone="warning">≈ {formatMoney(d.estimatedSpend)} / day</Pill>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {(
                      [
                        ["Morning", d.morning],
                        ["Afternoon", d.afternoon],
                        ["Evening", d.evening],
                      ] as const
                    ).map(([slot, text]) => (
                      <div
                        key={slot}
                        className="rounded-xl border border-border bg-background/40 p-3"
                      >
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          {slot}
                        </div>
                        <p className="mt-1 text-sm">{text}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Bus className="h-3.5 w-3.5" /> {d.transport}
                  </p>
                </Card>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle eyebrow="Experience Agent" title="Worth your time in the city" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plan.experiences.map((e, i) => (
              <Card key={`${e.name}-${i}`} className="lift glow-border overflow-hidden p-0">
                <ExperienceImage
                  name={e.name}
                  category={e.category}
                  destination={plan.summary.destination}
                  imageUrl={e.imageUrl}
                  className="h-28 w-full object-cover"
                />
                <div className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <Pill tone="secondary">{e.category}</Pill>
                    <span className="inline-flex items-center gap-1 text-xs text-warning">
                      <Star className="h-3.5 w-3.5 fill-current" /> {e.rating}
                    </span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold">{e.name}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{e.description}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Suggested visit · {e.duration}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle eyebrow="Travel Assistant Agent" title="Everything for the road" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="lift">
              <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
                <Luggage className="h-4 w-4 text-primary" /> Packing Checklist
              </h3>
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                {(a.packingChecklist ?? []).map((c) => (
                  <li key={c}>• {c}</li>
                ))}
              </ul>
            </Card>
            <TripWeatherCard
              destination={plan.summary.destination}
              latitude={plan.weather?.latitude ?? null}
              longitude={plan.weather?.longitude ?? null}
              departureDate={plan.summary.departureDate}
              returnDate={plan.summary.returnDate}
              initial={plan.weather ?? null}
            />
            <Card className="lift">
              <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
                <Phone className="h-4 w-4 text-destructive" /> Emergency Contacts
              </h3>
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                {(a.emergencyContacts ?? []).map((c) => (
                  <li key={c.label}>
                    {c.label} · {c.value}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="lift">
              <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
                <Coins className="h-4 w-4 text-secondary" /> Local Currency
              </h3>
              <p className="mt-3 text-sm text-muted-foreground">{a.currencyGuidance}</p>
            </Card>
            {a.visaInformation ? (
              <Card className="lift">
                <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
                  <Globe2 className="h-4 w-4 text-primary" /> Visa Information
                </h3>
                <p className="mt-3 text-sm text-muted-foreground">{a.visaInformation}</p>
              </Card>
            ) : null}
            <Card className="lift">
              <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
                <Bus className="h-4 w-4 text-secondary" /> Local Transport Tips
              </h3>
              <p className="mt-3 text-sm text-muted-foreground">{a.localTransportTips}</p>
            </Card>
            <Card className="lift">
              <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-warning" /> Safety Tips
              </h3>
              <p className="mt-3 text-sm text-muted-foreground">{a.safetyTips}</p>
            </Card>
            <Card className="lift">
              <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
                <Bell className="h-4 w-4 text-primary" /> Travel Reminders
              </h3>
              <p className="mt-3 text-sm text-muted-foreground">{a.travelReminders}</p>
            </Card>
          </div>
        </section>

        <section>
          <SectionTitle eyebrow="AI Insights" title="What the agents noticed" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {(plan.insights ?? []).map((insight) => (
              <Card key={insight} className="lift glow-border">
                <p className="flex gap-3 text-sm">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                  <span>{insight}</span>
                </p>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <Card className="glow-border">
            <h2 className="text-lg font-semibold">Take action</h2>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={resolveBookingLink("flight", tripParams).url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-[image:var(--gradient-primary)] px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105"
              >
                <Plane className="h-4 w-4" /> View live flights
              </a>
              <a
                href={resolveBookingLink("hotel", tripParams).url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/70 px-5 py-3 text-sm font-semibold transition-all hover:border-primary/60 hover:shadow-[var(--shadow-glow)]"
              >
                <MapPin className="h-4 w-4" /> Search stays
              </a>
              {plan.trains.length > 0 ? (
                <a
                  href={resolveBookingLink("train", tripParams).url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/70 px-5 py-3 text-sm font-semibold transition-all hover:border-primary/60 hover:shadow-[var(--shadow-glow)]"
                >
                  <TrainFront className="h-4 w-4" /> Check live trains
                </a>
              ) : null}
              <ExportPdfButton planId={id} plan={plan} status={status} />
              <button
                onClick={() => setSaved(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/70 px-5 py-3 text-sm font-semibold transition-all hover:border-success/60"
              >
                <Heart className={`h-4 w-4 ${saved ? "fill-current text-success" : ""}`} />{" "}
                {saved ? "Trip Saved" : "Save Trip"}
              </button>
              <button
                onClick={() => {
                  const url = typeof window !== "undefined" ? window.location.href : "";
                  if (typeof navigator !== "undefined" && navigator.share)
                    void navigator.share({ title: "My AI Travel Plan", url });
                  else void navigator.clipboard?.writeText(url);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/70 px-5 py-3 text-sm font-semibold transition-all hover:border-secondary/60"
              >
                <Share2 className="h-4 w-4" /> Share Trip
              </button>
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/70 px-5 py-3 text-sm font-semibold transition-all hover:border-primary/60"
              >
                <RefreshCw className="h-4 w-4" /> Plan Another Journey
              </Link>
            </div>
            <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> This plan is saved to your travel plan link and
              reloads any time.
            </p>
          </Card>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
