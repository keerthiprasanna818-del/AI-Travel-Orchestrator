import { db } from "@/integrations/supabase/project-client";
import type {
  AlertConditionType,
  FlightPriceAlert,
  FlightPriceHistoryRow,
} from "./price-alerts";
import { nextCheckAt } from "./price-alerts";

/**
 * Browser-side CRUD for price alerts. Every call runs through the signed-in
 * user's session, so row-level security scopes reads and writes to their own
 * alerts — no service credentials are ever used here.
 */

export type NewAlertInput = {
  userId: string;
  travelPlanId: string | null;
  origin: string;
  destination: string;
  originEntityId?: string | null;
  destinationEntityId?: string | null;
  departureDate: string;
  returnDate: string | null;
  adults: number;
  children: number;
  cabinClass: string;
  currency: string;
  conditionType: AlertConditionType;
  targetPrice: number | null;
  dropPercent: number | null;
  currentPrice: number;
  emailEnabled: boolean;
};

export async function listAlerts(userId: string): Promise<FlightPriceAlert[]> {
  const { data, error } = await db
    .from("flight_price_alerts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FlightPriceAlert[];
}

/** Existing active/triggered alert for the exact same search, if any. */
export async function findDuplicateAlert(
  input: Pick<
    NewAlertInput,
    | "userId"
    | "origin"
    | "destination"
    | "departureDate"
    | "returnDate"
    | "adults"
    | "children"
    | "cabinClass"
  >,
): Promise<FlightPriceAlert | null> {
  let query = db
    .from("flight_price_alerts")
    .select("*")
    .eq("user_id", input.userId)
    .eq("origin", input.origin)
    .eq("destination", input.destination)
    .eq("departure_date", input.departureDate)
    .eq("adults", input.adults)
    .eq("children", input.children)
    .eq("cabin_class", input.cabinClass)
    .in("status", ["active", "triggered"]);
  query = input.returnDate
    ? query.eq("return_date", input.returnDate)
    : query.is("return_date", null);
  const { data, error } = await query.limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? [])[0] as FlightPriceAlert | undefined) ?? null;
}

export async function createAlert(input: NewAlertInput): Promise<FlightPriceAlert> {
  const duplicate = await findDuplicateAlert(input);
  if (duplicate) throw new Error("You are already tracking this exact flight search.");

  const { data, error } = await db
    .from("flight_price_alerts")
    .insert({
      user_id: input.userId,
      travel_plan_id: input.travelPlanId,
      origin: input.origin,
      destination: input.destination,
      origin_entity_id: input.originEntityId ?? null,
      destination_entity_id: input.destinationEntityId ?? null,
      departure_date: input.departureDate,
      return_date: input.returnDate,
      adults: input.adults,
      children: input.children,
      cabin_class: input.cabinClass,
      currency: input.currency,
      condition_type: input.conditionType,
      target_price: input.targetPrice,
      drop_percent: input.dropPercent,
      initial_price: input.currentPrice,
      latest_price: input.currentPrice,
      lowest_price_seen: input.currentPrice,
      last_checked_at: new Date().toISOString(),
      next_check_at: nextCheckAt(input.departureDate),
      status: "active",
      email_enabled: input.emailEnabled,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as FlightPriceAlert;
}

export async function setAlertStatus(
  id: string,
  status: "active" | "paused",
): Promise<void> {
  const { error } = await db
    .from("flight_price_alerts")
    .update({ status, ...(status === "active" ? { last_error: null } : {}) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateAlertCondition(
  id: string,
  patch: {
    conditionType: AlertConditionType;
    targetPrice: number | null;
    dropPercent: number | null;
    emailEnabled: boolean;
  },
): Promise<void> {
  const { error } = await db
    .from("flight_price_alerts")
    .update({
      condition_type: patch.conditionType,
      target_price: patch.targetPrice,
      drop_percent: patch.dropPercent,
      email_enabled: patch.emailEnabled,
      status: "active",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteAlert(id: string): Promise<void> {
  const { error } = await db.from("flight_price_alerts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listHistory(alertId: string): Promise<FlightPriceHistoryRow[]> {
  const { data, error } = await db
    .from("flight_price_history")
    .select("id, alert_id, checked_price, currency, checked_at, provider")
    .eq("alert_id", alertId)
    .order("checked_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return (data ?? []) as FlightPriceHistoryRow[];
}

export async function markAlertRead(id: string): Promise<void> {
  await db.from("flight_price_alerts").update({ in_app_unread: false }).eq("id", id);
}
