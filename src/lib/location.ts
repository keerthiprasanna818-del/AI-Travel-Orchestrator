/** Structured location selection shared by the origin/destination fields. */
export type LocationSuggestion = {
  geonameId: number;
  name: string;
  displayName: string;
  countryName: string;
  countryCode: string;
  adminName1: string;
  adminName2: string;
  latitude: number;
  longitude: number;
  featureClass: string;
  featureCode: string;
};

export type LocationSearchResponse =
  | { ok: true; results: LocationSuggestion[] }
  | { ok: false; error: string; results: [] };

export type LocationFieldType = "origin" | "destination";
export type LocationTravelType = "Domestic" | "International";

/** Secondary line: parent administrative region + country. */
export function locationSecondaryLine(s: LocationSuggestion): string {
  const isCountry = s.featureClass === "A" && s.featureCode === "PCLI";
  if (isCountry) return "Country";
  const parts = [s.adminName2, s.adminName1, s.countryName]
    .map((p) => (p ?? "").trim())
    .filter((p) => p && p !== s.name);
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.join(", ") || s.countryName || "Location";
}
