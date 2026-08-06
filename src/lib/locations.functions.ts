import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { LocationSearchResponse, LocationSuggestion } from "./location";

const inputSchema = z.object({
  query: z.string().min(2).max(120),
  // Kept for backwards compatibility only — search is always worldwide and is
  // never filtered by travel type or field.
  travelType: z.enum(["Domestic", "International"]).optional(),
  fieldType: z.enum(["origin", "destination"]).optional(),
});

/**
 * Allowed GeoNames feature codes: populated places, districts, states,
 * provinces, union territories, administrative regions and countries.
 * Airports (S/AIRP), hotels, streets and businesses are excluded because
 * only feature classes P (populated place) and A (administrative) are kept.
 */
const ADMIN_CODES = new Set([
  "PCLI",
  "PCLD",
  "PCLIX",
  "PCLS",
  "PCLF",
  "TERR",
  "ADM1",
  "ADM1H",
  "ADM2",
  "ADM3",
  "ADM4",
  "ADMD",
]);

type GeoNamesRow = {
  geonameId?: number;
  name?: string;
  toponymName?: string;
  countryName?: string;
  countryCode?: string;
  adminName1?: string;
  adminName2?: string;
  lat?: string;
  lng?: string;
  fcl?: string;
  fcode?: string;
  population?: number;
};

function isAllowed(row: GeoNamesRow): boolean {
  const fcl = row.fcl ?? "";
  const fcode = row.fcode ?? "";
  if (fcl === "P") return !fcode.endsWith("H");
  if (fcl === "A") return ADMIN_CODES.has(fcode);
  // Airports only (no hotels, streets or businesses).
  if (fcl === "S") return fcode === "AIRP";
  return false;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lower tier = shown first: cities → districts → states → airports → countries. */
function tier(row: GeoNamesRow): number {
  const fcl = row.fcl ?? "";
  const fcode = row.fcode ?? "";
  const pop = row.population ?? 0;
  if (fcl === "P") {
    if (fcode === "PPLC") return 0; // capital
    if (fcode === "PPLA") return 1; // state capital
    if (pop >= 500_000) return 1;
    if (pop >= 100_000) return 2;
    if (pop >= 20_000) return 3;
    if (fcode === "PPLX" || pop > 0) return 4;
    return 5; // villages / unpopulated entries
  }
  if (fcl === "A") {
    if (fcode.startsWith("ADM2")) return 4; // district
    if (fcode.startsWith("ADM1") || fcode === "TERR") return 5; // state / UT
    if (fcode.startsWith("ADM")) return 6;
    return 8; // country
  }
  return 7; // airport
}

/** Higher score = more relevant. Query match quality dominates, then size. */
function score(row: GeoNamesRow, query: string): number {
  const name = normalize(row.name ?? row.toponymName ?? "");
  const q = normalize(query);
  let s = 0;
  if (name === q) s += 1000;
  else if (name.startsWith(`${q} `)) s += 600;
  else if (name.startsWith(q)) s += 400;
  else if (name.includes(q)) s += 150;
  // Shorter names are usually the well-known place ("Paris" over "Paris Hill").
  s -= Math.min(60, Math.max(0, name.length - q.length) * 2);
  s -= tier(row) * 45;
  // Size dominates among same-name places, so major cities/regions rank first.
  const pop = row.population ?? 0;
  s += Math.min(360, Math.log10(pop + 1) * 55);
  if (pop === 0) s -= 120;
  return s;
}

function toSuggestion(row: GeoNamesRow): LocationSuggestion {
  const name = (row.name ?? row.toponymName ?? "").trim();
  const isCountry = row.fcl === "A" && row.fcode === "PCLI";
  // Display format: "City, State, Country".
  const parts = isCountry
    ? [name]
    : [name, (row.adminName1 ?? "").trim(), (row.countryName ?? "").trim()];
  const cleaned = parts.filter((p) => p);
  const unique = cleaned.filter((p, i) => cleaned.indexOf(p) === i);
  return {
    geonameId: row.geonameId ?? 0,
    name,
    displayName: unique.join(", "),
    countryName: (row.countryName ?? "").trim(),
    countryCode: (row.countryCode ?? "").trim(),
    adminName1: (row.adminName1 ?? "").trim(),
    adminName2: (row.adminName2 ?? "").trim(),
    latitude: Number(row.lat ?? 0),
    longitude: Number(row.lng ?? 0),
    featureClass: row.fcl ?? "",
    featureCode: row.fcode ?? "",
  };
}


/**
 * Global location search backed by GeoNames. The GEONAMES_USERNAME secret is
 * read server-side only and never reaches the browser.
 */
export const searchLocations = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<LocationSearchResponse> => {
    const username = process.env["GEONAMES_USERNAME"];
    if (!username) {
      return { ok: false, error: "Location service is not configured yet.", results: [] };
    }

    // Always worldwide: travel type never filters the searchable locations.
    const query = data.query.trim();
    const url = new URL("https://secure.geonames.org/searchJSON");
    url.searchParams.set("name_startsWith", query);
    url.searchParams.set("maxRows", "80");
    url.searchParams.set("orderby", "relevance");
    url.searchParams.set("style", "FULL");
    url.searchParams.set("lang", "en");
    url.searchParams.set("username", username);
    for (const cls of ["P", "A", "S"]) url.searchParams.append("featureClass", cls);

    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        console.error("[search-locations] upstream status", res.status);
        return { ok: false, error: "Location search is unavailable right now.", results: [] };
      }
      const json = (await res.json()) as { geonames?: GeoNamesRow[]; status?: { message?: string } };
      if (json.status?.message) {
        console.error("[search-locations] upstream error", json.status.message);
        return { ok: false, error: "Location search is unavailable right now.", results: [] };
      }

      // Relevance ranking: match quality first, then place importance —
      // never the upstream alphabetical ordering.
      const ranked = (json.geonames ?? [])
        .filter(isAllowed)
        .map((row) => ({ row, s: score(row, query) }))
        .sort((a, b) => b.s - a.s || (b.row.population ?? 0) - (a.row.population ?? 0));

      const seen = new Set<string>();
      const out: LocationSuggestion[] = [];
      for (const { row } of ranked) {
        const s = toSuggestion(row);
        if (!s.name || !s.displayName) continue;
        const key = normalize(s.displayName);
        const nameKey = `${normalize(s.name)}|${normalize(s.adminName1)}|${s.countryCode}`;
        if (seen.has(key) || seen.has(nameKey)) continue;
        seen.add(key);
        seen.add(nameKey);

        out.push(s);
        if (out.length >= 10) break;
      }
      return { ok: true, results: out };

    } catch (err) {
      console.error("[search-locations] request failed", err);
      return { ok: false, error: "Location search failed. Please try again.", results: [] };
    }
  });
