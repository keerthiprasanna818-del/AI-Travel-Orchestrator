export type AgentDef = {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  message: string;
};

export const AGENTS: AgentDef[] = [
  {
    id: "planner",
    name: "Planner Agent",
    icon: "Compass",
    tagline: "Turns your intent into a structured travel brief.",
    message: "Understanding travel goals...",
  },
  {
    id: "best-time",
    name: "Best Time Agent",
    icon: "CloudSun",
    tagline: "Reads weather windows and seasonal demand curves.",
    message: "Checking weather and seasonal trends...",
  },
  {
    id: "flight",
    name: "Flight Comparison Agent",
    icon: "Plane",
    tagline: "Scans fares across carriers for value and speed.",
    message: "Comparing flight prices...",
  },
  {
    id: "train",
    name: "Train Comparison Agent",
    icon: "TrainFront",
    tagline: "Finds rail alternatives with comfort scoring.",
    message: "Finding train alternatives...",
  },
  {
    id: "hotel",
    name: "Hotel Comparison Agent",
    icon: "BedDouble",
    tagline: "Matches stays to location, budget and vibe.",
    message: "Analyzing hotel options...",
  },
  {
    id: "budget",
    name: "Budget Optimizer Agent",
    icon: "PiggyBank",
    tagline: "Rebalances spend to protect your total budget.",
    message: "Optimizing your budget...",
  },
  {
    id: "itinerary",
    name: "Itinerary Agent",
    icon: "CalendarRange",
    tagline: "Sequences each day for minimum travel friction.",
    message: "Generating itinerary...",
  },
  {
    id: "experience",
    name: "Experience Agent",
    icon: "Sparkles",
    tagline: "Surfaces food, culture and hidden local gems.",
    message: "Finding attractions and restaurants...",
  },
  {
    id: "assistant",
    name: "Travel Assistant Agent",
    icon: "LifeBuoy",
    tagline: "Prepares packing, safety and on-trip support.",
    message: "Preparing travel checklist...",
  },
];