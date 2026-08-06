/**
 * Centralized, reusable hotel image resolver.
 *
 * Works for every destination and every hotel the AI returns — no per-search or
 * per-city code. Resolution priority:
 *   1. Exact (normalized) hotel name  → verified local photo
 *   2. Hotel chain / brand family     → chain photo
 *   3. Destination-specific image     → region photo
 *   4. Hotel category fallback        → Luxury / Business / Boutique / Budget / Resort
 * A universal city photo is the last resort. All files live in /public/hotels/.
 */

const DIR = "/hotels";
const url = (file: string) => `${DIR}/${file}`;

/** Normalize any label: lowercase, punctuation stripped, single-spaced. */
export function normalizeHotelName(name?: string | null): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Strip generic branding words so "Hotel The Taj Palace Resort" → "taj palace". */
const BRANDING_WORDS =
  /\b(hotel|hotels|resort|resorts|the|inn|suites|suite|palace|house|haveli|residency|residence|lodge|stay|stays|group|collection|by|and|spa|retreat|villas|villa|homestay|guest|guesthouse|hostel)\b/g;

export function canonicalHotelName(name?: string | null): string {
  return normalizeHotelName(name).replace(BRANDING_WORDS, " ").replace(/\s+/g, " ").trim();
}

/* ---------------------------------------------------------------- exact ---- */

const EXACT_HOTELS: Record<string, string> = {
  "shahpura house": "shahpura-house.jpg",
  "alsisar haveli": "alsisar-haveli.jpg",
};

/* ---------------------------------------------------------------- chains --- */
/** Brand family → local chain photo. Sub-brands map onto their parent family. */
const CHAINS: { file: string; match: RegExp }[] = [
  {
    file: "chain-marriott.jpg",
    match: /\b(marriott|courtyard|jw|westin|sheraton|fairfield|le meridien|ritz carlton|st regis|aloft|four points)\b/,
  },
  { file: "chain-taj.jpg", match: /\b(taj|vivanta|ginger|seleqtions|oberoi|trident|leela|rambagh)\b/ },
  { file: "chain-lemon-tree.jpg", match: /\b(lemon tree|treebo|fabhotel|oyo|red fox|keys)\b/ },
  { file: "chain-itc.jpg", match: /\b(itc|welcomhotel|welcome ?hotel|fortune|maurya|grand chola)\b/ },
  { file: "chain-hyatt.jpg", match: /\b(hyatt|andaz|grand hyatt|park hyatt|hyatt regency)\b/ },
  { file: "chain-hilton.jpg", match: /\b(hilton|doubletree|hampton|conrad|waldorf|embassy suites)\b/ },
  { file: "chain-radisson.jpg", match: /\b(radisson|park inn|park plaza|country inn|sarovar)\b/ },
  { file: "chain-novotel.jpg", match: /\b(novotel|accor|ibis|mercure|sofitel|pullman|grand mercure)\b/ },
  { file: "chain-holiday-inn.jpg", match: /\b(holiday inn|crowne plaza|intercontinental|staybridge|holidayinn)\b/ },
];

/* ----------------------------------------------------------- destination --- */

const DESTINATIONS: { file: string; match: RegExp }[] = [
  {
    file: "fallback-rajasthan.jpg",
    match: /jaipur|udaipur|jodhpur|jaisalmer|rajasthan|pushkar|bikaner|mandawa|ajmer|agra|varanasi/,
  },
  {
    file: "fallback-beach.jpg",
    match: /goa|kerala|beach|andaman|pondicherry|maldives|bali|phuket|kovalam|mauritius|seychelles|krabi|langkawi|hawaii|cancun/,
  },
  {
    file: "fallback-hills.jpg",
    match: /manali|shimla|leh|ladakh|darjeeling|munnar|ooty|nainital|hill|switzerland|alps|kashmir|gangtok|mussoorie|coorg|nepal|bhutan|queenstown/,
  },
];

/* -------------------------------------------------------------- category --- */

export type HotelCategory = "luxury" | "business" | "boutique" | "budget" | "resort";

const CATEGORY_FILES: Record<HotelCategory, string> = {
  luxury: "category-luxury.jpg",
  business: "category-business.jpg",
  boutique: "category-boutique.jpg",
  budget: "category-budget.jpg",
  resort: "category-resort.jpg",
};

const CATEGORY_RULES: { category: HotelCategory; match: RegExp }[] = [
  { category: "resort", match: /resort|beach|island|spa|retreat|lagoon|backwater|cottage|camp|safari/ },
  { category: "luxury", match: /palace|grand|luxury|royal|imperial|regency|five star|mahal|premier|signature/ },
  { category: "boutique", match: /boutique|haveli|heritage|villa|homestay|courtyard|bnb|bed and breakfast|art|studio/ },
  { category: "budget", match: /budget|hostel|dorm|lodge|guest|economy|inn express|express|value|smart/ },
  { category: "business", match: /business|suites|residency|tower|corporate|park|plaza|central|airport|city/ },
];

/** Infer a hotel category from its name; defaults to business (safest urban look). */
export function inferHotelCategory(hotelName?: string | null): HotelCategory {
  const key = normalizeHotelName(hotelName);
  const hit = CATEGORY_RULES.find((rule) => rule.match.test(key));
  return hit?.category ?? "business";
}

/* -------------------------------------------------------------- variants --- */
/**
 * Distinct-looking pool used so two unrelated hotels that land on the same
 * fallback tier still get different photos. Selection is deterministic per name.
 */
const VARIANT_POOL = [
  "heritage-house.jpg",
  "aurora-suites.jpg",
  "courtyard-boutique.jpg",
  "skyline-residency.jpg",
  "alsisar-haveli.jpg",
  "shahpura-house.jpg",
];

const DEFAULT_FALLBACK = "fallback-city.jpg";

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) % 1_000_003;
  return h;
}

/* -------------------------------------------------------------- resolver --- */

/**
 * Resolve the local image for any hotel. Never returns an empty value, so the
 * card always shows a photo instead of a coloured block.
 */
export function resolveHotelImage(hotelName?: string | null, destination?: string | null): string {
  const name = normalizeHotelName(hotelName);
  const canonical = canonicalHotelName(hotelName);

  // 1. exact hotel name (raw or canonical form)
  const exact = EXACT_HOTELS[name] ?? EXACT_HOTELS[canonical];
  if (exact) return url(exact);

  // 2. hotel chain / brand family
  if (name) {
    const chain = CHAINS.find((entry) => entry.match.test(name));
    if (chain) return url(chain.file);
  }

  // 3. destination-specific image, alternated per hotel so no two unrelated
  //    hotels in the same city share one photo
  const dest = normalizeHotelName(destination);
  const byDest = dest ? DESTINATIONS.find((entry) => entry.match.test(dest)) : undefined;
  if (byDest) {
    if (!name) return url(byDest.file);
    const pool = [byDest.file, ...VARIANT_POOL];
    return url(pool[hash(name) % pool.length]!);
  }

  // 4. category fallback, also varied deterministically
  const category = inferHotelCategory(hotelName);
  if (!name) return url(CATEGORY_FILES[category]);
  const pool = [CATEGORY_FILES[category], ...VARIANT_POOL];
  return url(pool[hash(name) % pool.length]!);
}

/** Fallback used when an <img> fails to load at runtime. */
export function hotelFallbackImage(destination?: string | null, hotelName?: string | null): string {
  const dest = normalizeHotelName(destination);
  const byDest = DESTINATIONS.find((entry) => entry.match.test(dest));
  if (byDest) return url(byDest.file);
  if (hotelName) return url(CATEGORY_FILES[inferHotelCategory(hotelName)]);
  return url(DEFAULT_FALLBACK);
}
