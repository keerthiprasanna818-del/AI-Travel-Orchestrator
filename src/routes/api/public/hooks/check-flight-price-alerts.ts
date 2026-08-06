import { createFileRoute } from "@tanstack/react-router";
import { SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/project-client";

/**
 * `check-flight-price-alerts` — secure scheduled endpoint.
 *
 * Called by the backend scheduler (Supabase pg_cron + pg_net). It only checks
 * alerts whose `next_check_at` has passed, uses controlled batching and never
 * runs in the browser. No provider or database credentials are exposed here.
 */
/** Overlap guard: a second call while a run is in flight is skipped, not queued. */
let inFlight = false;

export const Route = createFileRoute("/api/public/hooks/check-flight-price-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (apiKey !== SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let limit = 8;
        try {
          const body = (await request.json()) as { limit?: number } | null;
          if (body && typeof body.limit === "number") limit = body.limit;
        } catch {
          // Empty body is the normal cron shape.
        }

        if (inFlight) {
          return new Response(
            JSON.stringify({ ok: true, skippedRun: true, reason: "A check run is already in progress" }),
            { headers: { "content-type": "application/json" } },
          );
        }
        inFlight = true;

        try {
          const { runAlertChecks } = await import("@/lib/price-alerts.server");
          const summary = await runAlertChecks(limit);

          // Flush any notifications this run queued. Failures here never fail
          // the check run itself.
          let emails: unknown = { skipped: true };
          if (summary.triggered > 0) {
            try {
              const { sendPendingAlertEmails } = await import("@/lib/price-alerts-email.server");
              emails = await sendPendingAlertEmails();
            } catch (mailErr) {
              const m = mailErr instanceof Error ? mailErr.message : "email run failed";
              console.error("PRICE ALERT EMAIL FLUSH ERROR", m);
              emails = { error: m };
            }
          }

          return new Response(JSON.stringify({ ok: true, ...summary, emails }), {
            headers: { "content-type": "application/json" },
          });

        } catch (err) {
          const message = err instanceof Error ? err.message : "Price alert check failed";
          console.error("CHECK FLIGHT PRICE ALERTS ERROR", message);
          // Setup gaps (missing service key / tables) are reported as a handled
          // "not run" result so the scheduler and preview don't see a hard 500.
          const setupIssue = /not configured|does not exist|schema cache|relation/i.test(message);
          return new Response(JSON.stringify({ ok: false, error: message, checked: 0 }), {
            status: setupIssue ? 200 : 500,
            headers: { "content-type": "application/json" },
          });
        } finally {
          inFlight = false;
        }

      },
    },
  },
});
