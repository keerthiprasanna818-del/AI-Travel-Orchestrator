import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PROJECT_URL } from "@/integrations/supabase/project-client";
import { searchLiveFlights } from "./flights.server";
import type { LiveFlightOffer } from "./flights";
import {
  conditionMet,
  isExpired,
  nextCheckAt,
  shouldNotify,
  type FlightPriceAlert,
} from "./price-alerts";

/**
 * Server-only price-alert checker (`check-flight-price-alerts`).
 *
 * Runs with the app project's service role key, re-runs the existing live
 * flight search for each due alert, records every real provider price and
 * triggers the user's configured condition. Provider credentials and the
 * service role key are read here only and never leave the server.
 */

const PROVIDER = "Skyscanner (RapidAPI)";
/** Controlled batching keeps the RapidAPI request budget predictable. */
const DEFAULT_BATCH = 8;
const MAX_BATCH = 25;
const SPACING_MS = 1200;
/** Provider failure: retry sooner than the normal cadence, never disable. */
const RETRY_MINUTES = 45;

export function serviceClient(): SupabaseClient {
  const key = process.env["APP_SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) throw new Error("Price alert checker is not configured");
  const url = process.env["APP_SUPABASE_URL"] || SUPABASE_PROJECT_URL;
  return createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cheapestOffer(offers: LiveFlightOffer[]): LiveFlightOffer | null {
  const priced = offers.filter(
    (o) => (o.pricePerTraveller ?? o.totalPrice ?? 0) > 0,
  );
  if (!priced.length) return null;
  return priced.reduce((best, o) =>
    (o.pricePerTraveller ?? o.totalPrice!) < (best.pricePerTraveller ?? best.totalPrice!) ? o : best,
  );
}

export type CheckSummary = {
  due: number;
  checked: number;
  triggered: number;
  expired: number;
  failed: number;
  skipped: number;
};

export async function runAlertChecks(limit = DEFAULT_BATCH): Promise<CheckSummary> {
  const supabase = serviceClient();
  const batch = Math.min(Math.max(1, limit), MAX_BATCH);
  const now = new Date();

  const { data, error } = await supabase
    .from("flight_price_alerts")
    .select("*")
    .eq("status", "active")
    .lte("next_check_at", now.toISOString())
    .order("next_check_at", { ascending: true })
    .limit(batch);
  if (error) throw new Error(error.message);

  const alerts = (data ?? []) as FlightPriceAlert[];
  const summary: CheckSummary = {
    due: alerts.length,
    checked: 0,
    triggered: 0,
    expired: 0,
    failed: 0,
    skipped: 0,
  };

  for (const [index, alert] of alerts.entries()) {
    // Departure has passed — stop tracking permanently.
    if (isExpired(alert.departure_date, now)) {
      await supabase
        .from("flight_price_alerts")
        .update({ status: "expired", last_checked_at: now.toISOString() })
        .eq("id", alert.id);
      summary.expired += 1;
      continue;
    }

    if (index > 0) await sleep(SPACING_MS);

    try {
      const result = await searchLiveFlights({
        travelPlanId: alert.travel_plan_id ?? alert.id,
        origin: alert.origin,
        destination: alert.destination,
        departureDate: alert.departure_date,
        returnDate: alert.return_date,
        adults: alert.adults,
        children: alert.children,
        cabinClass: alert.cabin_class,
        currency: alert.currency,
        market: "IN",
        locale: "en-US",
      });

      const best = cheapestOffer(result.offers);
      if (!best) {
        summary.skipped += 1;
        await supabase
          .from("flight_price_alerts")
          .update({
            last_checked_at: now.toISOString(),
            next_check_at: nextCheckAt(alert.departure_date, now),
            last_error: "No live fares returned for this search",
          })
          .eq("id", alert.id);
        continue;
      }

      const price = best.pricePerTraveller ?? best.totalPrice!;
      const currency = best.currency || alert.currency;

      // Every real provider check is recorded, never a synthesised price.
      await supabase.from("flight_price_history").insert({
        alert_id: alert.id,
        checked_price: price,
        currency,
        checked_at: now.toISOString(),
        provider: PROVIDER,
        result_metadata: {
          offerId: best.offerId,
          airline: best.airlineName,
          stops: best.numberOfStops,
          departureDateTime: best.departureDateTime,
          bookingUrl: best.bookingUrlVerified ? best.bookingUrl : null,
          offersReturned: result.offers.length,
        },
      });

      const lowest = Math.min(alert.lowest_price_seen ?? price, price);
      const triggered = conditionMet(alert, price);
      const patch: Record<string, unknown> = {
        latest_price: price,
        lowest_price_seen: lowest,
        last_checked_at: now.toISOString(),
        next_check_at: nextCheckAt(alert.departure_date, now),
        last_error: null,
      };

      if (triggered && shouldNotify(alert.last_notified_price, price)) {
        const savings = Math.max(0, alert.initial_price - price);
        const percent = alert.initial_price > 0 ? (savings / alert.initial_price) * 100 : 0;
        const link = best.bookingUrlVerified ? best.bookingUrl : null;

        const delivery = await recordNotification(supabase, alert, {
          oldPrice: alert.initial_price,
          newPrice: price,
          savings,
          percent,
          currency,
          link,
        });

        patch["status"] = "triggered";
        patch["last_notified_price"] = price;
        patch["last_notified_at"] = now.toISOString();
        patch["notification_status"] = delivery;
        patch["in_app_unread"] = true;
        summary.triggered += 1;
      }

      await supabase.from("flight_price_alerts").update(patch).eq("id", alert.id);
      summary.checked += 1;
    } catch (err) {
      // Provider outage or rate limit: back off and retry, keep the alert active.
      const message = err instanceof Error ? err.message : "Live flight check failed";
      console.error("CHECK FLIGHT PRICE ALERT ERROR", { alertId: alert.id, message });
      summary.failed += 1;
      await supabase
        .from("flight_price_alerts")
        .update({
          last_checked_at: now.toISOString(),
          next_check_at: new Date(now.getTime() + RETRY_MINUTES * 60000).toISOString(),
          last_error: message,
        })
        .eq("id", alert.id);
      if (/rate limit/i.test(message)) break;
    }
  }

  return summary;
}

/**
 * Records the triggered-price notification. Email sending is not configured for
 * this project yet, so the event is stored as `pending` and surfaced in-app;
 * once an email sender exists it can pick these rows up without duplication.
 */
async function recordNotification(
  supabase: SupabaseClient,
  alert: FlightPriceAlert,
  payload: {
    oldPrice: number;
    newPrice: number;
    savings: number;
    percent: number;
    currency: string;
    link: string | null;
  },
): Promise<string> {
  const channel = alert.email_enabled ? "email" : "in_app";
  const status = alert.email_enabled ? "pending" : "in_app";
  // One row per (alert, price event) — the unique index makes repeat notices for
  // the same price impossible even if a check runs twice.
  const { error } = await supabase.from("flight_alert_notifications").upsert(
    {
    alert_id: alert.id,
    user_id: alert.user_id,
    price_event_key: `${Math.round(payload.newPrice)}-${payload.currency}`,
    old_price: payload.oldPrice,
    new_price: payload.newPrice,
    savings: payload.savings,
    percent_drop: payload.percent,
    currency: payload.currency,
    provider_link: payload.link,
    channel,
    status,
    error: null,
    },
    { onConflict: "alert_id,price_event_key", ignoreDuplicates: true },
  );
  if (error) console.error("PRICE ALERT NOTIFICATION ERROR", error.message);
  return status;
}
