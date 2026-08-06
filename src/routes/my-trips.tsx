import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Calendar, MapPin, Plane, Trash2 } from "lucide-react";
import { Aurora, NavBar, SectionTitle, SiteFooter } from "@/components/site";
import { db } from "@/integrations/supabase/project-client";
import { getRecentPlans, clearRecentPlans, type RecentPlan } from "@/lib/recent-plans";
import { formatDate } from "@/lib/trip";

export const Route = createFileRoute("/my-trips")({
  head: () => ({
    meta: [
      { title: "My Trips — AI Travel Orchestrator" },
      {
        name: "description",
        content: "View and revisit your recently generated AI travel plans.",
      },
      { property: "og:title", content: "My Trips — AI Travel Orchestrator" },
      {
        property: "og:description",
        content: "Your recently generated AI travel plans, all in one place.",
      },
    ],
  }),
  component: MyTripsRoute,
});

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass rounded-[22px] p-5 ${className}`}>{children}</div>;
}

function EmptyState() {
  return (
    <Card className="glow-border mx-auto max-w-lg text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
        <Plane className="h-7 w-7" />
      </span>
      <h2 className="mt-4 text-xl font-semibold">No trips yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Plans you create will appear here so you can easily find them again.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[image:var(--gradient-primary)] px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105"
      >
        Plan Your First Journey <ArrowRight className="h-4 w-4" />
      </Link>
    </Card>
  );
}

type EnrichedPlan = RecentPlan & { departureDate?: string; returnDate?: string };

function MyTripsRoute() {
  return (
    <RequireAuth>
      <MyTrips />
    </RequireAuth>
  );
}

function MyTrips() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<EnrichedPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    const recent = getRecentPlans();
    if (recent.length === 0) {
      setPlans([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      const { data, error } = await db
        .from("travel_plans")
        .select("id, origin, destination, departure_date, return_date, status")
        .eq("user_id", user.id)
        .in(
          "id",
          recent.map((p) => p.id),
        );
      if (cancelled) return;

      if (error || !data) {
        setPlans(recent);
        setLoading(false);
        return;
      }

      const byId = new Map(data.map((row) => [row.id, row]));
        const enriched: EnrichedPlan[] = recent.map((p) => {
        const row = byId.get(p.id);
        return {
          id: p.id,
          createdAt: p.createdAt,
          destination: row?.destination ?? p.destination,
          origin: row?.origin ?? p.origin,
          status: (row?.status as RecentPlan["status"]) ?? p.status ?? "processing",
          departureDate: row?.departure_date ?? undefined,
          returnDate: row?.return_date ?? undefined,
        };
      });
      setPlans(enriched);
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleClear = () => {
    clearRecentPlans();
    setPlans([]);
  };

  return (
    <div className="min-h-screen">
      <Aurora />
      <NavBar />

      <main className="mx-auto max-w-5xl px-5 py-14 lg:px-8">
        <SectionTitle
          eyebrow="Trip History"
          title="My Trips"
          subtitle="All the AI travel plans you've generated, ready to revisit or share."
        />

        <div className="mt-12">
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="h-24 animate-pulse bg-muted/30">
                  <div className="h-full w-full" />
                </Card>
              ))}
            </div>
          ) : plans.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {plans.length} recent plan{plans.length === 1 ? "" : "s"}
                </p>
                <button
                  onClick={handleClear}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface/70 px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:border-destructive/60 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear history
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {plans.map((plan) => (
                  <Link
                    key={plan.id}
                    to="/dashboard/$id"
                    params={{ id: plan.id }}
                    className="group block"
                  >
                    <Card className="glow-border lift h-full">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                          <MapPin className="h-5 w-5" />
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                            plan.status === "completed"
                              ? "border-success/50 bg-success/12 text-success"
                              : plan.status === "failed"
                                ? "border-warning/50 bg-warning/12 text-warning"
                                : "border-primary/50 bg-primary/15 text-foreground"
                          }`}
                        >
                          {plan.status === "completed" ? "Ready" : plan.status === "failed" ? "Failed" : "Processing"}
                        </span>
                      </div>

                      <h3 className="mt-4 truncate text-base font-semibold">
                        {plan.origin || "Trip"} → {plan.destination || "Unknown"}
                      </h3>

                      {(plan.departureDate || plan.returnDate) && (
                        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {plan.departureDate ? formatDate(plan.departureDate) : ""}
                          {plan.departureDate && plan.returnDate ? " – " : ""}
                          {plan.returnDate ? formatDate(plan.returnDate) : ""}
                        </p>
                      )}

                      <p className="mt-3 text-xs text-muted-foreground">
                        Created {new Date(plan.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </p>

                      <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary transition-transform group-hover:translate-x-1">
                        Open plan <ArrowRight className="h-4 w-4" />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
