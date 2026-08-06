/**
 * Single configuration file for experience (attraction) imagery.
 *
 * Add new attractions or landmark types here — UI components never change.
 *
 * Three kinds of entries:
 *   1. LANDMARK_ENTRIES     — a specific named attraction (with aliases).
 *   2. LANDMARK_TYPE_RULES  — generic landmark *types* matched by keyword
 *                             (submarine museum, caves, buddhist ruins, ...),
 *                             so unrelated attractions in one category still
 *                             get distinct, meaningful images.
 *   3. category images      — final fallback (see experience-images.ts).
 */

export const LANDMARK_DIR = "/experiences/landmarks";

export type LandmarkEntry = {
  /** Local image path under public/. */
  image: string;
  /** Exact / alternate names. Matched after normalization (slugified). */
  aliases: string[];
  /** Optional destination scope ("visakhapatnam"). Global when omitted. */
  destination?: string;
};

/** Specific, named attractions. Extend freely — global, not route-specific. */
export const LANDMARK_ENTRIES: LandmarkEntry[] = [
  {
    image: `${LANDMARK_DIR}/submarine-museum.jpg`,
    aliases: [
      "INS Kursura Submarine Museum",
      "INS Kursura",
      "Kursura Museum",
      "Kursura Submarine Museum",
      "Submarine Museum",
    ],
  },
  {
    image: `${LANDMARK_DIR}/caves.jpg`,
    aliases: ["Borra Caves", "Borra Guhalu", "Araku Borra Caves"],
  },
  {
    image: `${LANDMARK_DIR}/hill-temple.jpg`,
    aliases: [
      "Simhachalam Temple",
      "Simhachalam",
      "Sri Varaha Lakshmi Narasimha Swamy Temple",
      "Simhachalam Hill Temple",
    ],
  },
  {
    image: `${LANDMARK_DIR}/buddhist-ruins.jpg`,
    aliases: [
      "Thotlakonda Buddhist Complex",
      "Thotlakonda",
      "Bavikonda",
      "Bavikonda Buddhist Complex",
      "Buddhist Complex",
    ],
  },
  {
    image: `${LANDMARK_DIR}/tribal-museum.jpg`,
    aliases: ["Araku Tribal Museum", "Tribal Museum", "Araku Museum"],
  },
  {
    image: `${LANDMARK_DIR}/thali.jpg`,
    aliases: [
      "Authentic Andhra Thali",
      "Andhra Thali",
      "Andhra Meal",
      "Traditional Thali",
    ],
  },
  {
    image: `${LANDMARK_DIR}/hill-valley.jpg`,
    aliases: ["Araku Valley", "Araku Coffee Plantations", "Coffee Museum"],
  },
  {
    image: `${LANDMARK_DIR}/viewpoint.jpg`,
    aliases: [
      "Kailasagiri",
      "Kailasagiri Hill Park",
      "Dolphin's Nose",
      "Dolphins Nose Lighthouse",
    ],
  },
];

/**
 * Generic landmark *types*, matched by keyword against the normalized name.
 * Ordered: the most specific patterns come first.
 */
export const LANDMARK_TYPE_RULES: { match: RegExp; image: string }[] = [
  { match: /submarine|naval-ship|warship|aircraft-museum/, image: `${LANDMARK_DIR}/submarine-museum.jpg` },
  { match: /cave|caverne|guhalu|grotto/, image: `${LANDMARK_DIR}/caves.jpg` },
  { match: /buddhist|stupa|monaster|vihara|konda-ruins|excavation|archaeolog/, image: `${LANDMARK_DIR}/buddhist-ruins.jpg` },
  { match: /temple|mandir|devasthanam|shrine|gopuram/, image: `${LANDMARK_DIR}/hill-temple.jpg` },
  { match: /tribal|folk-museum|ethnograph|handicraft-museum|heritage-museum/, image: `${LANDMARK_DIR}/tribal-museum.jpg` },
  { match: /thali|meal|cuisine|biryani|breakfast|tiffin|food-tour|street-food/, image: `${LANDMARK_DIR}/thali.jpg` },
  { match: /valley|plantation|coffee|tea-estate|hill-station|ghat/, image: `${LANDMARK_DIR}/hill-valley.jpg` },
  { match: /lighthouse|viewpoint|view-point|hill-park|sunset-point|panorama|ropeway/, image: `${LANDMARK_DIR}/viewpoint.jpg` },
];
