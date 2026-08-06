export type AirlineInfo = {
  name: string;
  iata: string;
  logo: string;
};

/**
 * Centralized airline resolver.
 *
 * Logos are verified local assets in /public/airlines/, named by lowercase IATA
 * code (e.g. "6e.svg"). The logo path is derived from the code, so supporting a
 * new airline only means adding a registry row (or dropping in an SVG whose name
 * matches the IATA code) — no component changes.
 */

const logoFor = (iata: string) => `/airlines/${iata.toLowerCase()}.svg`;

/** name, iata, plus optional extra aliases used by AI-generated data. */
const REGISTRY: { name: string; iata: string; aliases?: string[] }[] = [
  // India
  { name: "IndiGo", iata: "6E", aliases: ["indigo airlines", "interglobe"] },
  { name: "Air India Express", iata: "IX", aliases: ["aix connect", "air india exp"] },
  { name: "Air India", iata: "AI" },
  { name: "Akasa Air", iata: "QP", aliases: ["akasa"] },
  { name: "SpiceJet", iata: "SG" },
  { name: "Vistara", iata: "UK", aliases: ["tata sia"] },
  { name: "Go First", iata: "G8", aliases: ["goair"] },
  // Middle East
  { name: "Emirates", iata: "EK" },
  { name: "Qatar Airways", iata: "QR" },
  { name: "Etihad Airways", iata: "EY", aliases: ["etihad"] },
  { name: "flydubai", iata: "FZ", aliases: ["fly dubai"] },
  { name: "Oman Air", iata: "WY" },
  { name: "Saudia", iata: "SV", aliases: ["saudi arabian airlines"] },
  { name: "Gulf Air", iata: "GF" },
  // Europe
  { name: "British Airways", iata: "BA" },
  { name: "Lufthansa", iata: "LH" },
  { name: "Air France", iata: "AF" },
  { name: "KLM", iata: "KL", aliases: ["klm royal dutch airlines"] },
  { name: "SWISS", iata: "LX", aliases: ["swiss international air lines", "swiss air"] },
  { name: "Virgin Atlantic", iata: "VS" },
  { name: "Austrian Airlines", iata: "OS" },
  { name: "Iberia", iata: "IB" },
  { name: "ITA Airways", iata: "AZ", aliases: ["alitalia"] },
  { name: "Turkish Airlines", iata: "TK", aliases: ["turkish"] },
  // Asia Pacific
  { name: "Singapore Airlines", iata: "SQ" },
  { name: "Scoot", iata: "TR" },
  { name: "Malaysia Airlines", iata: "MH" },
  { name: "Cathay Pacific", iata: "CX", aliases: ["cathay"] },
  { name: "Thai Airways", iata: "TG", aliases: ["thai airways international", "thai"] },
  { name: "ANA", iata: "NH", aliases: ["all nippon airways"] },
  { name: "Japan Airlines", iata: "JL", aliases: ["jal"] },
  { name: "Korean Air", iata: "KE" },
  { name: "Asiana Airlines", iata: "OZ" },
  { name: "Air China", iata: "CA" },
  { name: "China Eastern", iata: "MU", aliases: ["china eastern airlines"] },
  { name: "China Southern", iata: "CZ", aliases: ["china southern airlines"] },
  { name: "EVA Air", iata: "BR" },
  { name: "China Airlines", iata: "CI" },
  { name: "Philippine Airlines", iata: "PH", aliases: ["pal"] },
  { name: "Vietnam Airlines", iata: "VN" },
  { name: "AirAsia", iata: "AK", aliases: ["air asia"] },
  { name: "SriLankan Airlines", iata: "UL", aliases: ["srilankan"] },
  { name: "Biman Bangladesh", iata: "BG", aliases: ["biman bangladesh airlines"] },
  { name: "Qantas", iata: "QF" },
  { name: "Air New Zealand", iata: "NZ" },
  // Americas / Africa
  { name: "United Airlines", iata: "UA", aliases: ["united"] },
  { name: "American Airlines", iata: "AA" },
  { name: "Delta Air Lines", iata: "DL", aliases: ["delta"] },
  { name: "Ethiopian Airlines", iata: "ET" },
];

const AIRLINES: AirlineInfo[] = REGISTRY.map((a) => ({
  name: a.name,
  iata: a.iata,
  logo: logoFor(a.iata),
}));

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

/** normalized alias/name → airline, longest key first for greedy matching. */
const NAME_INDEX: { key: string; airline: AirlineInfo }[] = REGISTRY.flatMap((entry, i) =>
  [entry.name, ...(entry.aliases ?? [])].map((label) => ({
    key: norm(label),
    airline: AIRLINES[i]!,
  })),
).sort((a, b) => b.key.length - a.key.length);

const BY_CODE = new Map(AIRLINES.map((a) => [a.iata, a]));

export function listAirlines(): AirlineInfo[] {
  return AIRLINES;
}

/** Resolve an airline from its display name (longest match wins) or IATA code. */
export function resolveAirline(name?: string | null, code?: string | null): AirlineInfo | null {
  const n = norm(name ?? "");
  if (n) {
    const byName = NAME_INDEX.find((entry) => entry.key && n.includes(entry.key));
    if (byName) return byName.airline;
  }
  const prefix = extractSegments(code ?? "")[0]?.iata ?? (code ?? "").trim().toUpperCase();
  const byCode = BY_CODE.get(prefix);
  if (byCode) return byCode;
  // Unknown airline but valid-looking code: still try a local logo by code.
  if (/^[A-Z0-9]{2}$/.test(prefix)) {
    return { name: (name ?? prefix).trim() || prefix, iata: prefix, logo: logoFor(prefix) };
  }
  return null;
}

export type FlightSegment = { iata: string; number: string; display: string };

/**
 * Normalizes raw AI flight code strings into clean segments.
 * Handles "6E-543", "6E543", "6E 543", "AI 608 / AI 812", newlines and duplicates.
 */
export function extractSegments(raw?: string | null): FlightSegment[] {
  if (!raw) return [];
  const text = String(raw).replace(/\s+/g, " ").toUpperCase();
  const out: FlightSegment[] = [];
  const seen = new Set<string>();
  const re = /\b([A-Z0-9]{2})[\s\-–—]?(\d{1,4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const iata = m[1]!;
    const number = String(Number(m[2]!));
    if (!/[A-Z]/.test(iata)) continue; // skip pure digits like "12 34"
    const display = `${iata} ${number}`;
    if (seen.has(display)) continue;
    seen.add(display);
    out.push({ iata, number, display });
  }
  return out;
}

/** True when a stops label means a direct/non-stop flight. */
export function isNonStop(stops?: string | null): boolean {
  const s = (stops ?? "").toLowerCase();
  if (!s) return false;
  if (/non[\s-]?stop|direct/.test(s)) return true;
  return /\b0\b/.test(s) && !/[1-9]\s*stop/.test(s);
}

export type FlightIdentity = {
  /** true when airline name and every flight-code prefix agree */
  valid: boolean;
  airline: AirlineInfo | null;
  airlineName: string;
  segments: FlightSegment[];
  /** "6E 543" or "AI 608 → AI 812"; empty when invalid */
  flightLabel: string;
  /** "Non-stop" or "1 Stop via BOM" */
  stopsLabel: string;
  nonStop: boolean;
};

const VIA_RE = /via\s+([A-Za-z .'-]{3,}|[A-Z]{3})/i;

/** Normalizes any raw stops string into the global display format. */
export function formatStopsLabel(stops: string | null | undefined, segmentCount: number): string {
  const raw = (stops ?? "").replace(/\s+/g, " ").trim();
  const direct = isNonStop(raw) && segmentCount <= 1;
  if (direct) return "Non-stop";

  const countMatch = raw.match(/(\d+)\s*stop/i);
  const count = countMatch
    ? Number(countMatch[1])
    : Math.max(1, segmentCount > 1 ? segmentCount - 1 : 1);
  const via = raw.match(VIA_RE)?.[1]?.trim();
  const base = `${count} Stop${count > 1 ? "s" : ""}`;
  return via ? `${base} via ${via}` : base;
}

/**
 * Validation layer: airline name must agree with every flight-code prefix.
 * When `stops` indicates a non-stop flight, only the first segment is kept so a
 * connection number never renders for a direct flight — and vice versa, a
 * multi-segment result never renders "Non-stop".
 */
export function resolveFlightIdentity(
  airlineName?: string | null,
  code?: string | null,
  stops?: string | null,
): FlightIdentity {
  const airline = resolveAirline(airlineName, code);
  const name = (airlineName ?? airline?.name ?? "").trim();
  let segments = extractSegments(code);
  const direct = isNonStop(stops);

  const mismatch = !!airline && segments.some((sgmt) => sgmt.iata !== airline.iata);
  if (!segments.length || mismatch) {
    return {
      valid: false,
      airline,
      airlineName: name,
      segments: [],
      flightLabel: "",
      stopsLabel: formatStopsLabel(stops, 1),
      nonStop: direct,
    };
  }

  if (direct) segments = segments.slice(0, 1);
  const nonStop = segments.length <= 1 && direct;

  return {
    valid: true,
    airline,
    airlineName: name,
    segments,
    flightLabel: segments.map((sgmt) => sgmt.display).join(" \u2192 "),
    stopsLabel: formatStopsLabel(stops, segments.length),
    nonStop,
  };
}
