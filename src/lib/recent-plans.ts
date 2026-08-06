const STORAGE_KEY = "ai-travel-orchestrator-recent-plans";
const MAX_RECENT = 20;

export type RecentPlan = {
  id: string;
  destination: string;
  origin: string;
  createdAt: number;
  status?: "processing" | "completed" | "failed";
};

export function getRecentPlans(): RecentPlan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentPlan[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentPlan(plan: Omit<RecentPlan, "createdAt">) {
  if (typeof window === "undefined") return;
  const existing = getRecentPlans();
  const next = [
    { ...plan, createdAt: Date.now() },
    ...existing.filter((p) => p.id !== plan.id),
  ].slice(0, MAX_RECENT);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function updateRecentPlan(id: string, patch: Partial<Omit<RecentPlan, "id" | "createdAt">>) {
  if (typeof window === "undefined") return;
  const plans = getRecentPlans().map((p) => (p.id === id ? { ...p, ...patch } : p));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
}

export function clearRecentPlans() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
