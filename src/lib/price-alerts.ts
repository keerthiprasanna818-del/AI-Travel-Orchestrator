/**
 * Shared (client-safe) model + pure helpers for flight price-drop alerts.
 * No provider credentials and no database access live here.
 */

export type AlertConditionType = "any_drop" | "target_price" | "percent_drop";
export type AlertStatus = "active" | "triggered" | "paused" | "expired";

export type FlightPriceAlert = {
  id: string;
  user_id: string;
  travel_plan_id: string | null;
  origin: string;
  destination: string;
  origin_entity_id: string | null;
  destination_entity_id: string | null;
  departure_date: string;
  return_date: string | null;
  adults: number;
  children: number;
  cabin_class: string;
  currency: string;
  condition_type: AlertConditionType;
  drop_percent: number | null;
  target_price: number | null;
  initial_price: number;
  latest_price: number | null;
  lowest_price_seen: number | null;
  last_checked_at: string | null;
  next_check_at: string;
  status: AlertStatus;
  email_enabled: boolean;
  last_notified_price: number | null;
  last_notified_at: string | null;
  notification_status: string | null;
  in_app_unread: boolean;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type FlightPriceHistoryRow = {
  id: string;
  alert_id: string;
  checked_price: number;
  currency: string;
  checked_at: string;
  provider: string | null;
};

/** Notice shown wherever provider prices are displayed. */
export const PRICE_DISCLAIMER =
  "Flight prices and availability are provided live by our booking provider and can change before booking. No fare is guaranteed.";

/**
 * Configured checking cadence, driven only by how close departure is:
 * more than 30 days out → 24h, 8-30 days → 12h, within 7 days → 6h.
 */
export function checkIntervalHours(departureDate: string, now: Date = new Date()): number {
  const days = daysUntil(departureDate, now);
  if (days > 30) return 24;
  if (days >= 8) return 12;
  return 6;
}

export function daysUntil(date: string, now: Date = new Date()): number {
  const target = new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return 0;
  return Math.floor((target - now.getTime()) / 86400000);
}

/** Next allowed check timestamp for an alert (never earlier than its cadence). */
export function nextCheckAt(departureDate: string, from: Date = new Date()): string {
  const hours = checkIntervalHours(departureDate, from);
  return new Date(from.getTime() + hours * 3600000).toISOString();
}

export function isExpired(departureDate: string, now: Date = new Date()): boolean {
  return daysUntil(departureDate, now) < 0;
}

/** True when the user's configured drop condition is satisfied by `price`. */
export function conditionMet(
  alert: Pick<
    FlightPriceAlert,
    "condition_type" | "target_price" | "drop_percent" | "initial_price" | "latest_price"
  >,
  price: number,
): boolean {
  const baseline = alert.initial_price;
  switch (alert.condition_type) {
    case "target_price":
      return alert.target_price != null && price <= alert.target_price;
    case "percent_drop": {
      const pct = alert.drop_percent ?? 0;
      if (!pct || !baseline) return false;
      return price <= baseline * (1 - pct / 100);
    }
    case "any_drop":
    default:
      return baseline > 0 && price < baseline;
  }
}

export function priceChange(
  initial: number | null | undefined,
  current: number | null | undefined,
): { amount: number; percent: number } {
  if (initial == null || current == null || initial <= 0) return { amount: 0, percent: 0 };
  const amount = current - initial;
  return { amount, percent: (amount / initial) * 100 };
}

export function conditionLabel(
  alert: Pick<FlightPriceAlert, "condition_type" | "target_price" | "drop_percent">,
): string {
  if (alert.condition_type === "target_price")
    return alert.target_price != null ? `Below ${money(alert.target_price)}` : "Below target price";
  if (alert.condition_type === "percent_drop")
    return `Drops ${alert.drop_percent ?? 0}% or more`;
  return "Any price drop";
}

export function money(value: number | null | undefined, currency = "INR"): string {
  if (value == null) return "—";
  const rounded = Math.round(value);
  if (currency.toUpperCase() === "INR") return `₹${rounded.toLocaleString("en-IN")}`;
  return `${currency.toUpperCase()} ${rounded.toLocaleString("en-IN")}`;
}

export function statusLabel(status: AlertStatus): string {
  switch (status) {
    case "triggered":
      return "Price dropped";
    case "paused":
      return "Paused";
    case "expired":
      return "Expired";
    default:
      return "Tracking";
  }
}

/** A repeat notification is only meaningful after a further ~2% drop. */
export function shouldNotify(
  lastNotifiedPrice: number | null | undefined,
  price: number,
): boolean {
  if (lastNotifiedPrice == null) return true;
  return price <= lastNotifiedPrice * 0.98;
}
