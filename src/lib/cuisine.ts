/**
 * Cuisine symbols.
 *
 * These earn their place by being scannable: in a feed or a rail you read the
 * emoji before the word, so a row of results sorts itself in your eye before
 * you have parsed a single name. One per restaurant, never a string of them —
 * the moment there are three the page stops feeling like a journal.
 */
const CUISINE_EMOJI: [RegExp, string][] = [
  [/pastizzi|ftira|bakery|bread/, "🥐"],
  [/pizza/, "🍕"],
  [/pasta|italian/, "🍝"],
  [/seafood|fish/, "🐟"],
  [/rabbit/, "🐇"],
  [/maltese|traditional|farm/, "🇲🇹"],
  [/cafe|coffee/, "☕"],
  [/cake|pastr|dessert|ice ?cream/, "🍰"],
  [/wine|bar/, "🍷"],
  [/steak|grill/, "🔥"],
  [/fine dining/, "✨"],
  [/cheese/, "🧀"],
  [/food hall/, "🍽️"],
  [/mediterranean|modern european/, "🫒"],
];

export function cuisineEmoji(cuisines: string[]): string | null {
  const joined = cuisines.join(" ").toLowerCase();
  for (const [pattern, emoji] of CUISINE_EMOJI) {
    if (pattern.test(joined)) return emoji;
  }
  return cuisines.length > 0 ? "🍽️" : null;
}

/** Occasion chips, used in the log sheet and on restaurant pages. */
export const OCCASIONS: { label: string; emoji: string }[] = [
  { label: "Date night", emoji: "🕯️" },
  { label: "Family", emoji: "👨‍👩‍👧" },
  { label: "Lunch", emoji: "🥗" },
  { label: "With friends", emoji: "🍻" },
  { label: "Solo", emoji: "📖" },
  { label: "Work", emoji: "💼" },
];

export function occasionEmoji(occasion: string | null): string | null {
  if (!occasion) return null;
  return OCCASIONS.find((o) => o.label === occasion)?.emoji ?? null;
}

/**
 * A light remark on a rating. Shown beside a diner's score in the feed.
 * Deliberately understated — the app should sound like a friend, not a brand.
 */
export function ratingMood(rating: number | null): string | null {
  if (rating === null) return null;
  if (rating >= 4.75) return "🤌 perfect";
  if (rating >= 4.25) return "🔥 excellent";
  if (rating >= 3.75) return "😌 very good";
  if (rating >= 3) return "🙂 solid";
  if (rating >= 2) return "😐 not great";
  return "💀 no";
}
