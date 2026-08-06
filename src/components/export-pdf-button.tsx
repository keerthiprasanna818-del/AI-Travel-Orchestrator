import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PlanResult } from "@/lib/plan-schema";
import { exportPlanPdf } from "@/lib/export-plan-pdf";
import { db } from "@/integrations/supabase/project-client";
import { useAuth } from "@/lib/auth";

type Props = {
  planId: string;
  plan: PlanResult | null;
  status: string;
  className?: string;
};

/**
 * Reusable Export PDF action. It only ever exports the currently opened plan,
 * re-verifies ownership and completion against the database, and downloads the
 * file directly (never the browser print dialog).
 */
export function ExportPdfButton({ planId, plan, status, className }: Props) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const ready = status === "completed" && Boolean(plan) && Boolean(user);

  const handleClick = async () => {
    if (busy || !ready || !plan || !user) return;
    setBusy(true);
    try {
      // Ownership + status re-check: never export another user's or an
      // incomplete plan, even if local state is stale.
      const { data, error } = await db
        .from("travel_plans")
        .select("user_id, status")
        .eq("id", planId)
        .maybeSingle();
      if (error || !data) throw new Error("Could not verify this travel plan.");
      if (data.user_id !== user.id) throw new Error("You do not have access to this trip.");
      if (data.status !== "completed") throw new Error("This plan is not ready for export yet.");

      await exportPlanPdf(plan);
      toast.success("Itinerary PDF downloaded");
    } catch (err) {
      console.error("EXPORT PDF ERROR", err);
      toast.error((err as { message?: string } | null)?.message ?? "Could not generate the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={busy || !ready}
      aria-busy={busy}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-xl border border-border bg-surface/70 px-5 py-3 text-sm font-semibold transition-all hover:border-secondary/60 disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {busy ? "Preparing PDF…" : "Export PDF"}
    </button>
  );
}
