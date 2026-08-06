import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "./price-alerts.server";
import { PRICE_DISCLAIMER, type FlightPriceAlert } from "./price-alerts";
import { ResendError, resendConfigured, sendResendEmail } from "./resend.server";

/**
 * `send-flight-price-alert-email` — server-only notification sender.
 *
 * Reads the recipient address from Supabase Auth (never from client input),
 * sends the price-drop email through Resend and records the Resend response id,
 * delivery status, timestamp and error message on the notification row. The
 * unique (alert_id, price_event_key) index plus the status check below guarantee
 * one email per alert per detected price.
 */

const DEFAULT_BATCH = 20;
const MAX_BATCH = 50;

export type EmailRunSummary = {
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
};

type NotificationRow = {
  id: string;
  alert_id: string;
  user_id: string;
  price_event_key: string;
  old_price: number | null;
  new_price: number | null;
  savings: number | null;
  percent_drop: number | null;
  currency: string;
  provider_link: string | null;
  status: string;
};

export type AlertEmailFacts = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  oldPrice: number | null;
  newPrice: number | null;
  savings: number | null;
  percentDrop: number | null;
  currency: string;
  lastCheckedAt: string | null;
  providerLink: string | null;
};

function money(amount: number | null | undefined, currency: string): string {
  if (amount == null) return "—";
  const rounded = Math.round(amount);
  if (currency.toUpperCase() === "INR") return `₹${rounded.toLocaleString("en-IN")}`;
  return `${currency.toUpperCase()} ${rounded.toLocaleString("en-IN")}`;
}

function dateLabel(value: string | null): string {
  if (!value) return "—";
  const d = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function timeLabel(value: string | null): string {
  if (!value) return "just now";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  })} IST`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Builds the price-drop email from verified server-side facts. */
export function buildAlertEmail(facts: AlertEmailFacts) {
  const currency = facts.currency || "INR";
  const route = `${facts.origin} → ${facts.destination}`;
  const percent = facts.percentDrop != null ? `${facts.percentDrop.toFixed(1)}%` : "—";
  const link = facts.providerLink;

  const lines: Array<[string, string]> = [
    ["Route", route],
    ["Departure", dateLabel(facts.departureDate)],
    ["Return", facts.returnDate ? dateLabel(facts.returnDate) : "One way"],
    ["Previous price", money(facts.oldPrice, currency)],
    ["Latest price", money(facts.newPrice, currency)],
    ["You save", `${money(facts.savings, currency)} (${percent})`],
    ["Currency", currency.toUpperCase()],
    ["Last checked", timeLabel(facts.lastCheckedAt)],
  ];

  const rows = lines
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0;color:#5b6472;font-size:14px">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;text-align:right;font-weight:600;font-size:14px">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="background-color:#ffffff;margin:0;font-family:Arial,Helvetica,sans-serif;color:#101828">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6d5ef0">Price drop alert</p>
    <h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(route)} is now ${escapeHtml(money(facts.newPrice, currency))}</h1>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e6e8ee;border-bottom:1px solid #e6e8ee">${rows}</table>
    ${
      link
        ? `<p style="margin:20px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#6d5ef0;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">View this fare</a></p>`
        : `<p style="margin:20px 0;font-size:14px;color:#5b6472">Open your trip in the app to see current live options.</p>`
    }
    <p style="margin:16px 0 0;font-size:12px;color:#8a93a3">${PRICE_DISCLAIMER}</p>
  </div></body></html>`;

  const text = [
    `Price drop alert — ${route}`,
    ...lines.slice(1).map(([label, value]) => `${label}: ${value}`),
    link ? `Fare link: ${link}` : "",
    "",
    PRICE_DISCLAIMER,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: `Fare drop: ${route} now ${money(facts.newPrice, currency)}`,
    html,
    text,
  };
}

async function recipientEmail(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) return null;
  return data.user?.email ?? null;
}

/** Processes queued price-drop emails. Safe to call repeatedly. */
export async function sendPendingAlertEmails(limit = DEFAULT_BATCH): Promise<EmailRunSummary> {
  const supabase = serviceClient();
  const batch = Math.min(Math.max(1, limit), MAX_BATCH);

  const { data, error } = await supabase
    .from("flight_alert_notifications")
    .select("*")
    .eq("status", "pending")
    .eq("channel", "email")
    .order("created_at", { ascending: true })
    .limit(batch);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as NotificationRow[];
  const summary: EmailRunSummary = { pending: rows.length, sent: 0, failed: 0, skipped: 0 };
  if (!rows.length) return summary;

  const configured = resendConfigured();

  for (const row of rows) {
    const { data: alertRow } = await supabase
      .from("flight_price_alerts")
      .select("*")
      .eq("id", row.alert_id)
      .maybeSingle();
    const alert = alertRow as FlightPriceAlert | null;
    if (!alert) {
      await mark(supabase, row, "failed", { error: "Alert no longer exists" });
      summary.failed += 1;
      continue;
    }

    // Duplicate guard: an already-sent email for the same detected price.
    const { data: existing } = await supabase
      .from("flight_alert_notifications")
      .select("id")
      .eq("alert_id", row.alert_id)
      .eq("price_event_key", row.price_event_key)
      .eq("status", "sent")
      .limit(1);
    if (existing && existing.length) {
      await mark(supabase, row, "duplicate", { error: "Email already sent for this price" });
      summary.skipped += 1;
      continue;
    }

    const email = await recipientEmail(supabase, row.user_id);
    if (!email) {
      await mark(supabase, row, "failed", { error: "No email address on the user account" });
      summary.failed += 1;
      continue;
    }

    if (!configured) {
      // Email delivery isn't configured yet: keep the event pending (the in-app
      // notification already fired) instead of burning it as a failure.
      await mark(supabase, row, "pending", {
        recipient_email: email,
        error: "Email sending is not configured yet",
      });
      summary.skipped += 1;
      continue;
    }

    const { subject, html, text } = buildAlertEmail({
      origin: alert.origin,
      destination: alert.destination,
      departureDate: alert.departure_date,
      returnDate: alert.return_date,
      oldPrice: row.old_price,
      newPrice: row.new_price,
      savings: row.savings,
      percentDrop: row.percent_drop,
      currency: row.currency || alert.currency,
      lastCheckedAt: alert.last_checked_at,
      providerLink: row.provider_link,
    });

    try {
      const result = await sendResendEmail({
        to: email,
        subject,
        html,
        text,
        headers: {
          "X-Entity-Ref-ID": `flight-price-alert-${row.alert_id}-${row.price_event_key}`,
        },
      });
      await mark(supabase, row, "sent", {
        recipient_email: email,
        message_id: result.id,
        sent_at: new Date().toISOString(),
        error: null,
      });
      summary.sent += 1;
    } catch (err) {
      const retryable = err instanceof ResendError && err.retryable;
      const message = err instanceof Error ? err.message : "Email delivery failed";
      console.error("SEND FLIGHT PRICE ALERT EMAIL ERROR", { id: row.id, message });
      await mark(supabase, row, retryable ? "pending" : "failed", {
        recipient_email: email,
        error: message,
      });
      if (retryable) summary.skipped += 1;
      else summary.failed += 1;
      if (err instanceof ResendError && err.status === 429) break;
    }
  }

  return summary;
}

async function mark(
  supabase: SupabaseClient,
  row: Pick<NotificationRow, "id" | "alert_id">,
  status: string,
  patch: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("flight_alert_notifications")
    .update({ status, ...patch })
    .eq("id", row.id);
  if (error) console.error("PRICE ALERT NOTIFICATION UPDATE ERROR", error.message);

  // Delivery failed: fall back to the in-app notification for this alert.
  if (status === "failed") {
    await supabase
      .from("flight_price_alerts")
      .update({ notification_status: "failed", in_app_unread: true })
      .eq("id", row.alert_id);
  }
}
