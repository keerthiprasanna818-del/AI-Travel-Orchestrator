import { db } from "@/integrations/supabase/project-client";
import type { PlanResult, TravelPlanRow } from "./plan-schema";
import type { TripWeather } from "./weather";
import { getTripWeatherData, weatherBriefForPrompt } from "./weather.server";

function nightsBetween(a: string, b: string) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

export function buildPrompt(row: TravelPlanRow, weather: TripWeather | null = null) {
  const intl = (row.travel_type || "").toLowerCase().includes("inter");
  const nights = nightsBetween(row.departure_date, row.return_date);
  const days = nights + 1;
  const travellers = Math.max(1, (row.adults || 1) + (row.children || 0));

  return `Create a complete, realistic and highly personalised travel plan.

TRIP BRIEF
- Travel type: ${row.travel_type}
- Origin: ${row.origin}
- Destination: ${row.destination}
- Departure date: ${row.departure_date}
- Return date: ${row.return_date} (${nights} nights, ${days} days)
- Estimated budget: INR ${row.estimated_budget} total
- Travellers: ${row.adults} adults, ${row.children} children (${travellers} total)
- Companion type: ${row.travel_companion ?? "n/a"}
- Trip purpose: ${row.trip_purpose ?? "n/a"}
- Preferences: ${(row.preferences ?? []).join(", ") || "none"}
- Transport preference: ${row.transport_preference ?? "any"}
- Accommodation preference: ${row.accommodation_preference ?? "any"}

WEATHER (verified, provided by the backend weather service — DO NOT invent or contradict it)
${weatherBriefForPrompt(weather)}

RULES
- Every plan element must reflect the brief above (origin, destination, dates, budget, travellers, companion, purpose, preferences, transport and accommodation preference).
- All prices, timings, durations, availability and ratings are ESTIMATES. Word them as estimated; never claim live data.
- Amounts are numbers in INR, no currency symbols or separators.
- itinerary must contain exactly ${days} days.
- ${intl
    ? "This is an INTERNATIONAL trip: return an EMPTY trains array (no Indian intercity rail), and set assistant.visaInformation to detailed visa guidance for Indian passport holders, plus destination currency and money guidance in assistant.currencyGuidance."
    : "This is a DOMESTIC Indian trip: include 2-4 realistic estimated train options between the two cities when rail service plausibly exists (otherwise an empty array), and set assistant.visaInformation to null. Do NOT include visa information."}
- budget.total, budget.remaining (budget minus total) and budget.breakdown must be internally consistent with the ${row.estimated_budget} budget.
- confidence is an integer 80-97.
- Use the verified weather block above to shape packing checklist and itinerary timing: rain likely -> umbrella/raincoat and indoor alternatives; hot days -> hydration and morning-first activities; cold -> layers; strong wind -> caution for outdoor or water activities. Never contradict, restate incorrectly or overwrite the verified weather numbers.
- Leave assistant.weather as an empty array: verified weather is attached by the backend, not by you.

Respond with ONLY a JSON object of exactly this shape:
{
  "summary": {"origin":"","destination":"","travelType":"","departureDate":"","returnDate":"","durationDays":0,"nights":0,"travellers":0,"adults":0,"children":0,"companion":"","purpose":"","budget":0,"accommodation":"","transportPreference":"","preferences":[],"confidence":0,"decisionSummary":"3-5 sentences explaining the AI reasoning"},
  "flights": [{"airline":"","code":"","depart":"06:15","arrive":"08:25","duration":"2h 10m","stops":"Non-stop","price":0,"badge":"Cheapest|Best Value|Fastest or null","bookingUrl":""}],
  "trains": [{"name":"","number":"","depart":"","arrive":"","duration":"","classes":"","price":0,"badge":""}],
  "hotels": [{"name":"","rating":4.5,"matchScore":90,"pricePerNight":0,"amenities":[],"distance":"","cancellation":"","bookingUrl":""}],
  "budget": {"breakdown":[{"label":"Flights","value":0}],"total":0,"savings":0,"remaining":0,"suggestions":[]},
  "itinerary": [{"day":1,"title":"","morning":"","afternoon":"","evening":"","transport":"","estimatedSpend":0}],
  "experiences": [{"name":"","category":"","rating":4.5,"description":"","duration":""}],
  "assistant": {"packingChecklist":[],"weather":[],"emergencyContacts":[{"label":"","value":""}],"currencyGuidance":"","visaInformation":null,"localTransportTips":"","safetyTips":"","travelReminders":""},
  "insights": []
}
Include 3-4 flights, 3-4 hotels, 6-9 experiences, 4-6 insights, 3-5 budget suggestions.`;
}

export async function generatePlanForRow(travelPlanId: string) {
  const { data, error } = await db
    .from("travel_plans")
    .select("*")
    .eq("id", travelPlanId)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Travel plan not found");
  const row = data as unknown as TravelPlanRow;

  let weather: TripWeather | null = null;
  try {
    weather = await getTripWeatherData({
      destination: row.destination,
      departureDate: row.departure_date,
      returnDate: row.return_date,
    });
  } catch (err) {
    console.error("TRIP WEATHER FETCH FAILED", err instanceof Error ? err.message : err);
  }

  try {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI service is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "openai/gpt-5.6-sol",
        reasoning_effort: "none",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a multi-agent travel planning engine. You reply with a single valid JSON object and nothing else.",
          },
          { role: "user", content: buildPrompt(row, weather) },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 429) throw new Error("AI rate limit reached. Please retry in a moment.");
      if (response.status === 402) throw new Error("AI credits exhausted. Please top up and retry.");
      throw new Error(`AI request failed (${response.status}): ${body.slice(0, 400)}`);
    }

    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI returned an empty response");

    let plan: PlanResult;
    try {
      plan = JSON.parse(content.replace(/^```json\s*|\s*```$/g, "")) as PlanResult;
    } catch {
      throw new Error("AI returned invalid JSON");
    }

    if (!plan?.summary || !Array.isArray(plan.itinerary) || !Array.isArray(plan.flights) || !plan.budget) {
      throw new Error("AI response is missing required travel plan sections");
    }
    if (!Array.isArray(plan.trains)) plan.trains = [];
    const intl = (row.travel_type || "").toLowerCase().includes("inter");
    if (intl) plan.trains = [];
    else if (plan.assistant) plan.assistant.visaInformation = null;

    // Verified weather always wins over anything the model produced.
    plan.weather = weather;
    if (plan.assistant) {
      plan.assistant.weather = (weather?.days ?? []).map((d) => ({
        day: d.date,
        temp: `${Math.round(d.minTemp)}-${Math.round(d.maxTemp)}°C`,
        condition: d.condition,
      }));
    }

    const { error: updateError } = await db
      .from("travel_plans")
      .update({ plan_result: plan, status: "completed", error_message: null })
      .eq("id", travelPlanId);
    if (updateError) throw new Error(updateError.message);

    return { status: "completed" as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from("travel_plans")
      .update({ status: "failed", error_message: message })
      .eq("id", travelPlanId);
    return { status: "failed" as const, error: message };
  }
}
