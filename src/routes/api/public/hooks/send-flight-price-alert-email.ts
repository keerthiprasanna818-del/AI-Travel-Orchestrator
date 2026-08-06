import { createFileRoute } from "@tanstack/react-router";
import { SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/project-client";

/**
 * `send-flight-price-alert-email` — secure server endpoint that flushes queued
 * price-drop notifications. Recipient addresses come from Supabase Auth inside
 * the server module; no credentials or email addresses are accepted from the
 * caller.
 */
/** Overlap guard: only one flush run at a time, so no notification is sent twice. */
let inFlight = false;

export const Route = createFileRoute("/api/public/hooks/send-flight-price-alert-email")({
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

        let limit = 20;
        try {
          const body = (await request.json()) as { limit?: number } | null;
          if (body && typeof body.limit === "number") limit = body.limit;
        } catch {
          // Empty body is the normal scheduled shape.
        }

        if (inFlight) {
          return new Response(
            JSON.stringify({ ok: true, skippedRun: true, reason: "An email flush is already in progress" }),
            { headers: { "content-type": "application/json" } },
          );
        }
        inFlight = true;

        try {
          const { sendPendingAlertEmails } = await import("@/lib/price-alerts-email.server");
          const summary = await sendPendingAlertEmails(limit);
          return new Response(JSON.stringify({ ok: true, ...summary }), {
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Alert email run failed";
          console.error("SEND FLIGHT PRICE ALERT EMAILS ERROR", message);
          const setupIssue = /not configured|does not exist|schema cache|relation/i.test(message);
          return new Response(JSON.stringify({ ok: false, error: message, sent: 0 }), {
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
