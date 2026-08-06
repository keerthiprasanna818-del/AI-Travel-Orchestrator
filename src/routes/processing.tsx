import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, PartyPopper, RefreshCw } from "lucide-react";
import { AGENTS } from "@/lib/agents";
import { agentIcons, Aurora, NavBar } from "@/components/site";
import { cityName, defaultTrip, loadTrip, type TripPlan } from "@/lib/trip";
import { db, supabase } from "@/integrations/supabase/project-client";
import { generateTravelPlan } from "@/lib/travel-plan.functions";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/processing")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search['id'] === "string" ? (search['id'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "AI Travel Team Activated — AI Travel Orchestrator" },
      {
        name: "description",
        content: "Watch nine AI travel agents collaborate in real time to research, compare and optimise your trip.",
      },
      { property: "og:title", content: "AI Travel Team Activated" },
      { property: "og:description", content: "Nine AI travel agents collaborating on your personalised plan." },
    ],
  }),
  component: ProcessingRoute,
});

function ProcessingRoute() {
  return (
    <RequireAuth>
      <Processing />
    </RequireAuth>
  );
}

/** Guards against a second generation call when the page refreshes. */
const started = new Set<string>();

const STEP_MS = 90;

function Processing() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [trip, setTrip] = useState<TripPlan>(defaultTrip);
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => setTrip(loadTrip()), []);

  useEffect(() => {
    const id = search.id ?? window.sessionStorage.getItem("travelPlanId");
    if (!id) {
      setFailure("No travel plan found. Please create a plan first.");
      return;
    }
    setPlanId(id);
  }, [search.id]);

  // Kick off AI generation, then poll the row until it completes or fails.
  // Nothing runs without an authenticated owner of this plan.
  useEffect(() => {
    if (!planId || !userId) return;
    let cancelled = false;
    setFailure(null);
    let poll = 0;

    void (async () => {
      // Ownership check first: never generate or read another user's plan.
      const { data: row, error: rowError } = await db
        .from("travel_plans")
        .select("user_id")
        .eq("id", planId)
        .maybeSingle();
      if (cancelled) return;
      if (rowError || !row || row.user_id !== userId) {
        toast.error("You do not have access to this trip");
        void navigate({ to: "/my-trips" });
        return;
      }

      const key = `${planId}:${retryKey}`;
      if (!started.has(key)) {
        started.add(key);
        // Primary path: the generate-travel-plan Edge Function.
        const { data, error } = await supabase.functions.invoke("generate-travel-plan", {
          body: { travelPlanId: planId },
        });
        if (cancelled) return;
        if (error) {
          console.error("EDGE FUNCTION generate-travel-plan ERROR", error);
          // Edge function not deployed yet → fall back to the server generator.
          await generateTravelPlan({ data: { travelPlanId: planId } }).catch((err: unknown) => {
            console.error("GENERATE TRAVEL PLAN ERROR", err);
          });
        } else {
          console.log("GENERATE TRAVEL PLAN (edge function)", data);
        }
      }
      if (cancelled) return;

      poll = window.setInterval(async () => {
        const { data, error } = await db
          .from("travel_plans")
          .select("status, error_message, user_id")
          .eq("id", planId)
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelled || error || !data) return;
        if (data.status === "completed") {
          window.clearInterval(poll);
          setDone(true);
        } else if (data.status === "failed") {
          window.clearInterval(poll);
          setFailure(data.error_message || "Plan generation failed. Please try again.");
        }
      }, 2000);
    })();

    return () => {
      cancelled = true;
      if (poll) window.clearInterval(poll);
    };
  }, [planId, retryKey, userId, navigate]);

  const retry = async () => {
    if (!planId || !userId) {
      void navigate({ to: "/" });
      return;
    }
    await db
      .from("travel_plans")
      .update({ status: "processing", error_message: null })
      .eq("id", planId)
      .eq("user_id", userId);
    setFailure(null);
    setActive(0);
    setProgress(0);
    setRetryKey((k) => k + 1);
  };

  useEffect(() => {
    if (done || failure) return;
    const timer = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          setActive((a) => {
            if (a >= AGENTS.length - 1) {
              return a;
            }
            return a + 1;
          });
          return 0;
        }
        return Math.min(100, p + 4 + Math.random() * 6);
      });
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [done, failure]);

  useEffect(() => {
    if (!done || !planId) return;
    const t = window.setTimeout(() => navigate({ to: "/dashboard/$id", params: { id: planId } }), 1600);
    return () => window.clearTimeout(t);
  }, [done, navigate, planId]);

  const overall = Math.round(((active + (done ? 1 : progress / 100)) / AGENTS.length) * 100);

  return (
    <div className="min-h-screen">
      <Aurora />
      <NavBar />

      <main className="mx-auto max-w-6xl px-5 py-14 lg:px-8">
        <div className="text-center">
          <h1 className="text-3xl font-semibold sm:text-4xl">🤖 AI Travel Team Activated</h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Our AI specialists are collaborating to create your personalized travel experience.
          </p>
          <p className="mt-4 inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-1.5 text-xs text-secondary">
            <span>{cityName(trip.from)} → {cityName(trip.destination)}</span>
            <span className="text-muted-foreground">·</span>
            <span>{trip.travelType}</span>
            <span className="text-muted-foreground">·</span>
            <span>{trip.companion}</span>
            <span className="text-muted-foreground">·</span>
            <span>₹{trip.budget}</span>
          </p>

          <div className="mx-auto mt-8 max-w-xl">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Orchestration progress</span>
              <span className="tabular-nums text-foreground">{done ? 100 : overall}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[image:var(--gradient-primary)] transition-[width] duration-200"
                style={{ width: `${done ? 100 : overall}%` }}
              />
            </div>
          </div>
        </div>

        <div className="relative mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-40">
            <defs>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--primary)" />
                <stop offset="100%" stopColor="var(--secondary)" />
              </linearGradient>
            </defs>
            <line x1="16%" y1="18%" x2="50%" y2="18%" stroke="url(#lineGrad)" strokeWidth="1.5" strokeDasharray="6 8" className="animate-dash" />
            <line x1="50%" y1="18%" x2="84%" y2="18%" stroke="url(#lineGrad)" strokeWidth="1.5" strokeDasharray="6 8" className="animate-dash" />
            <line x1="16%" y1="50%" x2="84%" y2="50%" stroke="url(#lineGrad)" strokeWidth="1.5" strokeDasharray="6 8" className="animate-dash" />
            <line x1="16%" y1="82%" x2="84%" y2="82%" stroke="url(#lineGrad)" strokeWidth="1.5" strokeDasharray="6 8" className="animate-dash" />
            <line x1="50%" y1="18%" x2="50%" y2="82%" stroke="url(#lineGrad)" strokeWidth="1.5" strokeDasharray="6 8" className="animate-dash" />
          </svg>

          {AGENTS.map((agent, i) => {
            const Icon = agentIcons[agent.icon]!;
            const state = done || i < active ? "completed" : i === active ? "processing" : "waiting";
            const pct = state === "completed" ? 100 : state === "processing" ? Math.round(progress) : 0;
            return (
              <article
                key={agent.id}
                className={`glass relative rounded-[22px] p-5 transition-all duration-500 ${
                  state === "processing"
                    ? "border-primary/60 shadow-[var(--shadow-glow)] scale-[1.02]"
                    : state === "completed"
                      ? "border-success/40"
                      : "opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                      state === "completed"
                        ? "bg-success/15 text-success"
                        : state === "processing"
                          ? "bg-primary/20 text-primary animate-pulse-glow"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold">{agent.name}</h3>
                      {state === "completed" ? (
                        <Check className="h-4 w-4 shrink-0 text-success" />
                      ) : state === "processing" ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                      ) : (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {state === "completed" ? "Completed" : state === "processing" ? agent.message : "Waiting"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-[width] duration-200 ${
                      state === "completed" ? "bg-success" : "bg-[image:var(--gradient-primary)]"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </article>
            );
          })}
        </div>

        {failure ? (
          <div className="glass glow-border animate-rise mx-auto mt-12 max-w-lg rounded-[24px] p-8 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-warning/15 text-warning">
              <AlertTriangle className="h-7 w-7" />
            </span>
            <h2 className="mt-4 text-2xl font-semibold">Plan generation failed</h2>
            <p className="mt-2 break-words text-sm text-muted-foreground">{failure}</p>
            <button
              onClick={() => void retry()}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[image:var(--gradient-primary)] px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105"
            >
              <RefreshCw className="h-4 w-4" /> Retry
            </button>
          </div>
        ) : done ? (
          <div className="glass glow-border animate-rise mx-auto mt-12 max-w-lg rounded-[24px] p-8 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-success/15 text-success animate-pulse-glow">
              <PartyPopper className="h-7 w-7" />
            </span>
            <h2 className="mt-4 text-2xl font-semibold">🎉 Your AI Travel Plan is Ready!</h2>
            <p className="mt-2 text-sm text-muted-foreground">Opening your travel command center…</p>
          </div>
        ) : null}
      </main>
    </div>
  );
}