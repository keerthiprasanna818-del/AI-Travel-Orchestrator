/**
 * Generic, destination-independent experience image resolver.
 *
 * Resolution order (candidate chain, tried in order at render time):
 *   1. verified exact-match image  → /experiences/destinations/<dest>/<experience-slug>.jpg
 *   2. destination + category      → /experiences/destinations/<dest>/<category-slug>.jpg
 *   3. category fallback           → /experiences/categories/<category-slug>.jpg
 *   4. universal default           → /experiences/categories/default.jpg
 *
 * No city, landmark, or trip is hardcoded: adding images for a new destination
 * only means dropping files into public/experiences/destinations/<slug>/.
 * The AI planner never invents image URLs.
 */

import { LANDMARK_ENTRIES, LANDMARK_TYPE_RULES } from "./experience-image-map";

const CATEGORY_DIR = "/experiences/categories";
const DESTINATION_DIR = "/experiences/destinations";

/** Universal default — always exists locally. */
export const UNIVERSAL_DEFAULT_IMAGE = `${CATEGORY_DIR}/default.jpg`;

/** Lowercase, strip punctuation/diacritics, collapse spacing → url-safe slug. */
export function slugify(value?: string | null): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Category slugs that have a locally stored fallback image. */
export const CATEGORY_IMAGES = [
  "historical-places",
  "food",
  "nature",
  "adventure",
  "shopping",
  "pilgrimage",
  "nightlife",
  "culture",
  "beaches",
  "wildlife",
  "wellness",
  "family-activities",
] as const;

const CATEGORY_SET = new Set<string>(CATEGORY_IMAGES);

/** Free-text category aliases → canonical category slug. Destination agnostic. */
const CATEGORY_ALIASES: { match: RegExp; category: (typeof CATEGORY_IMAGES)[number] }[] = [
  { match: /histor|heritage|monument|fort|palace|museum|architect|ruin/, category: "historical-places" },
  { match: /food|cuisine|culinar|restaurant|dining|street-eat|cafe|market-food|gastro/, category: "food" },
  { match: /nature|scenic|lake|garden|park|landscape|waterfall|mountain|desert|valley|sunset/, category: "nature" },
  { match: /adventure|trek|hike|raft|zip|safari-ride|sport|dive|ski|climb|paraglid/, category: "adventure" },
  { match: /shop|bazaar|market|souvenir|mall|craft/, category: "shopping" },
  { match: /pilgrim|temple|church|mosque|shrine|spiritual|monaster|gurudwara/, category: "pilgrimage" },
  { match: /night|bar|club|pub|party|rooftop|live-music/, category: "nightlife" },
  { match: /cultur|art|folk|festival|dance|music|theat|local-life/, category: "culture" },
  { match: /beach|coast|island|sea|shore|watersport/, category: "beaches" },
  { match: /wildlife|zoo|bird|sanctuar|national-park|tiger|jungle/, category: "wildlife" },
  { match: /wellness|spa|yoga|ayurved|retreat|meditat|relax/, category: "wellness" },
  { match: /family|kid|child|amusement|theme-park|aquarium|fun/, category: "family-activities" },
];

/** Normalize any AI/user supplied category into a canonical category slug. */
export function normalizeCategory(category?: string | null): (typeof CATEGORY_IMAGES)[number] | null {
  const slug = slugify(category);
  if (!slug) return null;
  if (CATEGORY_SET.has(slug)) return slug as (typeof CATEGORY_IMAGES)[number];
  const alias = CATEGORY_ALIASES.find((entry) => entry.match.test(slug));
  return alias?.category ?? null;
}

/** Normalize a destination string ("Jaipur, Rajasthan" → "jaipur"). */
export function normalizeDestination(destination?: string | null): string {
  const first = (destination ?? "").split(/[,/|(]/)[0];
  return slugify(first);
}

/** Normalize an experience name into a stable file slug. */
export function normalizeExperienceName(name?: string | null): string {
  return slugify(name);
}

/**
 * Ordered list of image candidates for an experience. The component walks this
 * chain with onError so a missing file silently falls through — never a blank
 * area or coloured block.
 */
export function resolveExperienceImageCandidates(input: {
  name?: string | null | undefined;
  category?: string | null | undefined;
  destination?: string | null | undefined;
  imageUrl?: string | null | undefined;
}): string[] {
  const candidates: string[] = [];
  const push = (url?: string | null) => {
    if (url && !candidates.includes(url)) candidates.push(url);
  };

  // Pre-resolved local path stored on the model (never a remote invented URL).
  if (input.imageUrl && input.imageUrl.startsWith("/")) push(input.imageUrl);

  const dest = normalizeDestination(input.destination);
  const nameSlug = normalizeExperienceName(input.name);
  const category = normalizeCategory(input.category);

  // 1. Verified destination-scoped exact file drop-in.
  if (dest && nameSlug) push(`${DESTINATION_DIR}/${dest}/${nameSlug}.jpg`);

  // 2. Configured landmark: exact name or known alias (destination-scoped first).
  const aliasMatch = (scoped: boolean) =>
    LANDMARK_ENTRIES.find((entry) => {
      if (scoped ? entry.destination === undefined : entry.destination !== undefined) return false;
      if (entry.destination && slugify(entry.destination) !== dest) return false;
      return entry.aliases.some((alias) => slugify(alias) === nameSlug);
    });
  if (nameSlug) {
    push(aliasMatch(false)?.image);
    push(aliasMatch(true)?.image);
  }

  // 3. Configured landmark: partial alias containment (handles "Visit Borra Caves").
  if (nameSlug) {
    const partial = LANDMARK_ENTRIES.find((entry) =>
      entry.aliases.some((alias) => {
        const a = slugify(alias);
        return a.length > 5 && (nameSlug.includes(a) || a.includes(nameSlug));
      }),
    );
    push(partial?.image);
  }

  // 4. Landmark type keyword rules (submarine, caves, temple, thali, ...).
  if (nameSlug) {
    const typeRule = LANDMARK_TYPE_RULES.find((rule) => rule.match.test(nameSlug));
    push(typeRule?.image);
  }

  // 5. Destination + category, then global category, then universal default.
  if (dest && category) push(`${DESTINATION_DIR}/${dest}/${category}.jpg`);
  if (category) push(`${CATEGORY_DIR}/${category}.jpg`);
  push(UNIVERSAL_DEFAULT_IMAGE);

  return candidates;
}

/** Convenience: the best first-guess image path. */
export function resolveExperienceImage(input: {
  name?: string | null | undefined;
  category?: string | null | undefined;
  destination?: string | null | undefined;
  imageUrl?: string | null | undefined;
}): string {
  return resolveExperienceImageCandidates(input)[0] ?? UNIVERSAL_DEFAULT_IMAGE;
}
