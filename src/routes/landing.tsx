import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { Aurora, NavBar, SiteFooter } from "@/components/site";
import { MarketingSections } from "@/components/marketing-sections";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "How AI Travel Orchestrator Works — Public Overview" },
      {
        name: "description",
        content:
          "Discover how nine specialised AI agents compare flights, trains and hotels, optimise budgets and build day-wise itineraries.",
      },
      { property: "og:title", content: "How AI Travel Orchestrator Works — Public Overview" },
      {
        property: "og:description",
        content:
          "Meet the AI travel agent team, see the planning workflow and the live data partners behind every itinerary.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "How AI Travel Orchestrator Works — Public Overview" },
      {
        name: "twitter:description",
        content: "Meet the AI travel agent team and see how each trip plan is orchestrated.",
      },
    ],
  }),
  component: LandingRoute,
});

function LandingRoute() {
  return (
    <div className="min-h-screen">
      <Aurora />
      <NavBar />

      <section className="mx-auto max-w-4xl px-5 pb-8 pt-14 text-center lg:px-8 lg:pt-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-secondary">
          <Sparkles className="h-3.5 w-3.5" /> 9 specialised agents · one orchestrated plan
        </span>
        <h1 className="mt-6 text-4xl font-semibold leading-[1.08] sm:text-5xl">
          Plan Smarter. Travel Better.{" "}
          <span className="text-gradient">Powered by Your AI Travel Team.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Specialised AI agents collaborate to compare flights, trains and hotels, optimise your
          budget and craft a personalised day-wise itinerary. Sign in to start planning your
          journey.
        </p>
        <Link
          to="/auth"
          className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-[image:var(--gradient-primary)] px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-transform hover:scale-105"
        >
          Sign in to start planning <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <MarketingSections />
      <SiteFooter />
    </div>
  );
}
