// Supabase Edge Function: generate-travel-plan
// Deploy into YOUR project:
//   supabase functions deploy generate-travel-plan --project-ref slctyweshylsfecqqcsy --no-verify-jwt
// Requires a secret: OPENAI_API_KEY (or GEMINI_API_KEY)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function nightsBetween(a: string, b: string) {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

// deno-lint-ignore no-explicit-any
function buildPrompt(row: any) {
  const intl = String(row.travel_type ?? "").toLowerCase().includes("inter");
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

RULES
- Every plan element must reflect the brief above.
- All prices, timings, durations, availability, ratings and weather are ESTIMATES. Word them as estimated; never claim live data.
- Amounts are numbers in INR, no currency symbols or separators.
- itinerary must contain exactly ${days} days.
- ${intl
    ? "This is an INTERNATIONAL trip: return an EMPTY trains array, and set assistant.visaInformation to detailed visa guidance for Indian passport holders, plus destination currency guidance in assistant.currencyGuidance."
    : "This is a DOMESTIC Indian trip: include 2-4 realistic estimated train options when rail service plausibly exists (otherwise an empty array), and set assistant.visaInformation to null."}
- budget.total, budget.remaining (budget minus total) and budget.breakdown must be consistent with the ${row.estimated_budget} budget.
- confidence is an integer 80-97.

Respond with ONLY a JSON object of exactly this shape:
{
  "summary": {"origin":"","destination":"","travelType":"","departureDate":"","returnDate":"","durationDays":0,"nights":0,"travellers":0,"adults":0,"children":0,"companion":"","purpose":"","budget":0,"accommodation":"","transportPreference":"","preferences":[],"confidence":0,"decisionSummary":"3-5 sentences explaining the AI reasoning"},
  "flights": [{"airline":"","code":"","depart":"06:15","arrive":"08:25","duration":"2h 10m","stops":"Non-stop","price":0,"badge":"Cheapest|Best Value|Fastest or null","bookingUrl":""}],
  "trains": [{"name":"","number":"","depart":"","arrive":"","duration":"","classes":"","price":0,"badge":""}],
  "hotels": [{"name":"","rating":4.5,"matchScore":90,"pricePerNight":0,"amenities":[],"distance":"","cancellation":"","bookingUrl":""}],
  "budget": {"breakdown":[{"label":"Flights","value":0}],"total":0,"savings":0,"remaining":0,"suggestions":[]},
  "itinerary": [{"day":1,"title":"","morning":"","afternoon":"","evening":"","transport":"","estimatedSpend":0}],
  "experiences": [{"name":"","category":"","rating":4.5,"description":"","duration":""}],
  "assistant": {"packingChecklist":[],"weather":[{"day":"Day 1","temp":"28°C","condition":"Sunny (estimated)"}],"emergencyContacts":[{"label":"","value":""}],"currencyGuidance":"","visaInformation":null,"localTransportTips":"","safetyTips":"","travelReminders":""},
  "insights": []
}
Include 3-4 flights, 3-4 hotels, 6-9 experiences, 4-6 insights, 3-5 budget suggestions.`;
}

const SYSTEM =
  "You are a multi-agent travel planning engine. You reply with a single valid JSON object and nothing else.";

async function callOpenAI(key: string, prompt: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status}): ${(await res.text()).slice(0, 400)}`);
  const payload = await res.json();
  return payload?.choices?.[0]?.message?.content as string | undefined;
}

async function callGemini(key: string, prompt: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini request failed (${res.status}): ${(await res.text()).slice(0, 400)}`);
  const payload = await res.json();
  return payload?.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let travelPlanId = "";
  try {
    const body = await req.json();
    travelPlanId = body?.travelPlanId ?? "";
    if (!travelPlanId) throw new Error("travelPlanId is required");

    const { data: row, error } = await supabase
      .from("travel_plans")
      .select("*")
      .eq("id", travelPlanId)
      .single();
    if (error || !row) throw new Error(error?.message ?? "Travel plan not found");

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!openaiKey && !geminiKey) {
      throw new Error(
        "No AI key configured. Add OPENAI_API_KEY or GEMINI_API_KEY under Edge Functions → Secrets.",
      );
    }

    const prompt = buildPrompt(row);
    const content = openaiKey ? await callOpenAI(openaiKey, prompt) : await callGemini(geminiKey!, prompt);
    if (!content) throw new Error("AI returned an empty response");

    let plan;
    try {
      plan = JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
    } catch {
      throw new Error("AI returned invalid JSON");
    }
    if (!plan?.summary || !Array.isArray(plan.itinerary) || !Array.isArray(plan.flights) || !plan.budget) {
      throw new Error("AI response is missing required travel plan sections");
    }
    if (!Array.isArray(plan.trains)) plan.trains = [];
    const intl = String(row.travel_type ?? "").toLowerCase().includes("inter");
    if (intl) plan.trains = [];
    else if (plan.assistant) plan.assistant.visaInformation = null;

    const { error: updateError } = await supabase
      .from("travel_plans")
      .update({ plan_result: plan, status: "completed", error_message: null })
      .eq("id", travelPlanId);
    if (updateError) throw new Error(updateError.message);

    return new Response(JSON.stringify({ status: "completed" }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (travelPlanId) {
      await supabase
        .from("travel_plans")
        .update({ status: "failed", error_message: message })
        .eq("id", travelPlanId);
    }
    return new Response(JSON.stringify({ status: "failed", error: message }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});