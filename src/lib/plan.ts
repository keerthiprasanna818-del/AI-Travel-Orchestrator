import { budgetNumber, cityName, tripNights, type TripPlan } from "./trip";

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 100000;
  return h;
}

export type Flight = {
  airline: string;
  code: string;
  depart: string;
  arrive: string;
  duration: string;
  stops: string;
  price: number;
  badge?: "Best Value" | "Cheapest" | "Fastest";
  url: string;
};

export type Train = {
  name: string;
  number: string;
  depart: string;
  arrive: string;
  duration: string;
  classes: string;
  price: number;
  badge?: string;
};

export type Hotel = {
  name: string;
  rating: number;
  match: number;
  price: number;
  amenities: string[];
  distance: string;
  cancellation: string;
  hue: number;
};

export type Experience = {
  name: string;
  category: string;
  rating: number;
  description: string;
  duration: string;
  hue: number;
};

export type DayPlan = {
  day: number;
  title: string;
  morning: string;
  afternoon: string;
  evening: string;
  transport: string;
  spend: number;
};

export function buildPlan(trip: TripPlan) {
  const seed = hash(trip.destination + trip.from + trip.departDate);
  const nights = tripNights(trip);
  const days = nights + 1;
  const budget = budgetNumber(trip);
  const dest = cityName(trip.destination);
  const origin = cityName(trip.from);
  const intl = trip.travelType === "International";
  const travellers = Math.max(1, trip.adults + trip.children);

  const baseFare = Math.round((intl ? 24000 : 5200) + (seed % 1800));
  const flights: Flight[] = [
    {
      airline: "IndiGo",
      code: "6E",
      depart: "06:15",
      arrive: intl ? "13:40" : "08:25",
      duration: intl ? "7h 25m" : "2h 10m",
      stops: "Non-stop",
      price: baseFare,
      badge: "Cheapest",
      url: "https://www.google.com/travel/flights",
    },
    {
      airline: "Vistara",
      code: "UK",
      depart: "09:40",
      arrive: intl ? "17:05" : "11:55",
      duration: intl ? "7h 25m" : "2h 15m",
      stops: "Non-stop",
      price: Math.round(baseFare * 1.18),
      badge: "Best Value",
      url: "https://www.skyscanner.co.in",
    },
    {
      airline: "Air India",
      code: "AI",
      depart: "13:05",
      arrive: intl ? "19:50" : "15:05",
      duration: intl ? "6h 45m" : "2h 00m",
      stops: "Non-stop",
      price: Math.round(baseFare * 1.32),
      badge: "Fastest",
      url: "https://www.makemytrip.com/flights/",
    },
    {
      airline: "Akasa Air",
      code: "QP",
      depart: "18:20",
      arrive: intl ? "04:10 +1" : "21:15",
      duration: intl ? "9h 50m" : "2h 55m",
      stops: "1 stop",
      price: Math.round(baseFare * 0.94),
      url: "https://www.skyscanner.co.in",
    },
  ];

  const trains: Train[] = intl
    ? []
    : [
        {
          name: `${origin} – ${dest} Rajdhani Express`,
          number: `120${(seed % 9) + 1}`,
          depart: "20:10",
          arrive: "11:45 +1",
          duration: "15h 35m",
          classes: "3A · 2A · 1A",
          price: 2450,
          badge: "Most Comfortable",
        },
        {
          name: `${dest} Superfast Express`,
          number: `226${(seed % 7) + 2}`,
          depart: "06:35",
          arrive: "22:05",
          duration: "15h 30m",
          classes: "SL · 3A",
          price: 1180,
          badge: "Cheapest",
        },
        {
          name: `${dest} Duronto Express`,
          number: `123${(seed % 5) + 3}`,
          depart: "23:15",
          arrive: "13:20 +1",
          duration: "14h 05m",
          classes: "3A · 2A",
          price: 2760,
          badge: "Fastest",
        },
      ];

  const nightly = Math.round(
    (trip.accommodation.includes("Luxury") || trip.accommodation === "Resort"
      ? 12500
      : trip.accommodation.includes("Hostel") || trip.accommodation.includes("Budget")
        ? 2200
        : 5400) *
      (intl ? 1.8 : 1),
  );

  const hotels: Hotel[] = [
    {
      name: `The ${dest} Heritage House`,
      rating: 4.8,
      match: 96,
      price: Math.round(nightly * 1.25),
      amenities: ["Rooftop pool", "Free breakfast", "Spa", "Airport pickup"],
      distance: "0.8 km from city centre",
      cancellation: "Free cancellation till 24h before",
      hue: 285,
    },
    {
      name: `Aurora Suites ${dest}`,
      rating: 4.6,
      match: 91,
      price: nightly,
      amenities: ["Free Wi-Fi", "Gym", "Breakfast", "Workspace"],
      distance: "1.6 km from main attractions",
      cancellation: "Free cancellation till 48h before",
      hue: 185,
    },
    {
      name: `${dest} Courtyard Boutique`,
      rating: 4.4,
      match: 87,
      price: Math.round(nightly * 0.78),
      amenities: ["Courtyard cafe", "Free Wi-Fi", "Laundry"],
      distance: "2.4 km from city centre",
      cancellation: "Partially refundable",
      hue: 148,
    },
    {
      name: `Skyline Residency ${dest}`,
      rating: 4.2,
      match: 82,
      price: Math.round(nightly * 0.62),
      amenities: ["Kitchenette", "Metro nearby", "Pet friendly"],
      distance: "3.1 km from old town",
      cancellation: "Non-refundable saver rate",
      hue: 92,
    },
  ];

  const [f0, f1, f2] = flights as [Flight, Flight, Flight, Flight];
  const flightCost = f1.price * travellers;
  const [, h1, h2] = hotels as [Hotel, Hotel, Hotel, Hotel];
  const hotelCost = h1.price * nights;
  const food = Math.round(950 * travellers * days * (intl ? 2.1 : 1));
  const localTransport = Math.round(600 * days * (intl ? 1.6 : 1));
  const activities = Math.round(1400 * days * (intl ? 1.7 : 1));
  const shopping = Math.round(budget * 0.06);
  const misc = Math.round(budget * 0.04);
  const total = flightCost + hotelCost + food + localTransport + activities + shopping + misc;
  const savings = Math.round((f2.price - f0.price) * travellers + nightly * 0.4 * nights);

  const budgetBreakdown = [
    { label: "Flights", value: flightCost, color: "var(--chart-1)" },
    { label: "Hotels", value: hotelCost, color: "var(--chart-2)" },
    { label: "Food", value: food, color: "var(--chart-3)" },
    { label: "Transportation", value: localTransport, color: "var(--chart-4)" },
    { label: "Activities", value: activities, color: "var(--chart-5)" },
    { label: "Shopping", value: shopping, color: "var(--chart-1)" },
    { label: "Miscellaneous", value: misc, color: "var(--chart-2)" },
  ];

  const dayTemplates = [
    {
      title: "Arrival & first impressions",
      morning: `Arrive in ${dest}, hotel check-in and a slow neighbourhood walk`,
      afternoon: "Signature local lunch, then the city's landmark quarter",
      evening: "Sunset viewpoint followed by a street-food trail",
    },
    {
      title: "Heritage & culture day",
      morning: "Early entry to the main heritage site before crowds build",
      afternoon: "Museum circuit and artisan workshops",
      evening: "Cultural performance and a rooftop dinner",
    },
    {
      title: "Nature & outdoors",
      morning: "Scenic drive to the nearby nature trail",
      afternoon: "Picnic lunch and guided walk",
      evening: "Lakeside cafe and stargazing",
    },
    {
      title: "Food, markets & shopping",
      morning: "Local market tour with a guide",
      afternoon: "Hands-on cooking class",
      evening: "Boutique shopping street and dessert crawl",
    },
    {
      title: "Hidden gems day",
      morning: "Lesser-known stepwell / old town lanes",
      afternoon: "Neighbourhood cafe hopping",
      evening: "Live music at a local venue",
    },
    {
      title: "Relax & depart",
      morning: "Slow breakfast and spa or pool time",
      afternoon: "Last-minute souvenirs and checkout",
      evening: `Transfer and departure from ${dest}`,
    },
  ];

  const itinerary: DayPlan[] = Array.from({ length: days }, (_, i) => {
    const t = dayTemplates[i === days - 1 ? 5 : Math.min(i, 4)]!;
    return {
      day: i + 1,
      title: t.title,
      morning: t.morning,
      afternoon: t.afternoon,
      evening: t.evening,
      transport: i === 0 ? "Airport transfer + walking" : i % 2 === 0 ? "Metro / local rail" : "Pre-booked cab (half day)",
      spend: Math.round((food + localTransport + activities) / days),
    };
  });

  const experiences: Experience[] = [
    { name: `Old Quarter Thali House`, category: "Restaurant", rating: 4.7, description: "Regional thali served the traditional way, best before 1 PM.", duration: "1h 15m", hue: 20 },
    { name: `Brewhouse ${dest}`, category: "Cafe", rating: 4.5, description: "Slow-brew coffee bar with a courtyard for morning planning.", duration: "45m", hue: 40 },
    { name: `${dest} Fort & Ramparts`, category: "Attraction", rating: 4.9, description: "The signature skyline view — arrive at opening for empty frames.", duration: "3h", hue: 285 },
    { name: `City Museum of ${dest}`, category: "Museum", rating: 4.4, description: "Compact, well-curated galleries covering 400 years of the region.", duration: "2h", hue: 220 },
    { name: `Ancient Riverside Temple`, category: "Temple", rating: 4.8, description: "Evening aarti with lamps on the water — deeply atmospheric.", duration: "1h", hue: 92 },
    { name: `Bazaar Lane`, category: "Shopping", rating: 4.3, description: "Textiles, brass and handmade souvenirs; bargaining expected.", duration: "2h", hue: 340 },
    { name: `Canyon Zipline & Trek`, category: "Adventure", rating: 4.6, description: "Half-day adrenaline block with certified operators.", duration: "4h", hue: 148 },
    { name: `The Blue Stepwell`, category: "Hidden Gem", rating: 4.9, description: "Rarely crowded, extraordinary geometry — a photographer's favourite.", duration: "1h", hue: 185 },
    { name: `Village Craft Homestay Visit`, category: "Local Experience", rating: 4.7, description: "Meet block-printing families and try the craft yourself.", duration: "3h", hue: 55 },
  ];

  const insights = [
    `Visit ${dest}'s headline attractions before 9 AM — footfall drops by roughly 60%.`,
    `Light rain expected around Day ${Math.min(4, days)} — the itinerary keeps indoor options that day.`,
    `The recommended hotel's location cuts local transport spend by about 25%.`,
    `Tuesday offers the cheapest return flight on this route — around ${Math.round(baseFare * 0.12)} rupees less.`,
    `Booking hotel + activities together in this window historically saves 8–12%.`,
  ];

  const suggestions = [
    `Choose ${f0.airline} (${f0.depart}) to save ${(f1.price - f0.price) * travellers} rupees on airfare.`,
    `Shift two dinners to local eateries to free up roughly ${Math.round(food * 0.15)} rupees.`,
    `A ${nights}-night stay at ${h2.name} keeps you within budget with a 4.4 rating.`,
  ];

  const confidence = 88 + (seed % 9);

  return {
    dest,
    origin,
    intl,
    nights,
    days,
    budget,
    travellers,
    flights,
    trains,
    hotels,
    hotelNightly: nightly,
    budgetBreakdown,
    total,
    savings,
    remaining: budget - total,
    itinerary,
    experiences,
    insights,
    suggestions,
    confidence,
  };
}

export type Plan = ReturnType<typeof buildPlan>;