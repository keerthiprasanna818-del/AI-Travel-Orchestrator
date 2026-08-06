import { AGENTS } from "@/lib/agents";
import { agentIcons, SectionTitle } from "@/components/site";

const PARTNERS = [
  "Google Flights",
  "Skyscanner",
  "Booking.com",
  "Agoda",
  "Airbnb",
  "MakeMyTrip",
  "IRCTC",
  "RedBus",
  "TripAdvisor",
];

const HOW = [
  {
    step: "01",
    title: "Describe your journey",
    body: "Route, dates, budget, companions and the experiences you care about.",
  },
  {
    step: "02",
    title: "Agents collaborate",
    body: "Nine specialists research in sequence, handing findings to each other in real time.",
  },
  {
    step: "03",
    title: "Get a command center",
    body: "Comparisons, budget optimisation, itinerary and on-trip support in one dashboard.",
  },
];

const FEATURES = [
  {
    title: "Multi-agent reasoning",
    body: "Each decision is owned by a specialist agent, not one generic prompt.",
  },
  {
    title: "Transparent trade-offs",
    body: "Every recommendation ships with the why: price, time, weather, comfort.",
  },
  {
    title: "Budget-first planning",
    body: "The optimiser rebalances spend so the total never drifts past your number.",
  },
  {
    title: "Live comparison layer",
    body: "Flights, trains and stays compared side by side with AI match scores.",
  },
];

/**
 * Public informational sections. Shared by the authenticated home page and the
 * public /landing route so the marketing content stays available to everyone.
 */
export function MarketingSections() {
  return (
    <>
      <section className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <SectionTitle
          eyebrow="Trusted data"
          title="Trusted Travel Partners"
          subtitle="Agents cross-check live inventory and pricing signals across the sources you already trust."
        />
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PARTNERS.map((p) => (
            <div
              key={p}
              className="glass lift rounded-2xl px-4 py-5 text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {p}
            </div>
          ))}
        </div>
      </section>

      <section id="agents" className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <SectionTitle
          eyebrow="The team"
          title="Meet Your AI Travel Team"
          subtitle="Nine specialists, each owning one part of the decision — orchestrated end to end."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((agent, i) => {
            const Icon = agentIcons[agent.icon]!;
            return (
              <article
                key={agent.id}
                className="glass glow-border lift rounded-[22px] p-6"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold">{agent.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {agent.tagline}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <SectionTitle
          eyebrow="Why it's different"
          title="Not a booking site. A planning intelligence."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass lift rounded-[22px] p-6">
              <h3 className="text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <SectionTitle eyebrow="How it works" title="Three steps from idea to itinerary" />
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {HOW.map((h) => (
            <div key={h.step} className="glass glow-border rounded-[22px] p-6">
              <span className="font-display text-3xl font-semibold text-gradient">{h.step}</span>
              <h3 className="mt-3 text-base font-semibold">{h.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="about" className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="glass glow-border rounded-[24px] p-8 text-center sm:p-12">
          <h2 className="text-2xl font-semibold sm:text-3xl">
            Built as an AI orchestration product, not a search box
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            AI Travel Orchestrator coordinates a team of reasoning agents that pass context to each
            other — weather informs the itinerary, the itinerary informs the budget, the budget
            informs which flight you should actually take. You see every trade-off, and stay in
            control of the final call.
          </p>
        </div>
      </section>
    </>
  );
}
