import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVE_MARKET } from "@/config/market";
import { normalize } from "@/lib/text";
import type { Restaurant, Visit } from "@/lib/types";

/**
 * Postgrest select strings. The image join takes only the primary row, which is
 * the one the ingestion pipeline marks per restaurant.
 */
const RESTAURANT_SELECT = `
  id, slug, name, cuisines, price_band, status, website, phone, lat, lng,
  locality:rl_localities ( id, name ),
  stats:rl_restaurant_stats (
    recent_rating, avg_rating, return_rate, would_return_pct,
    visit_count, distinct_diners
  ),
  images:rl_restaurant_images ( source, storage_path, source_url, attribution_html, is_primary )
`;

type RawImage = {
  source: string;
  storage_path: string | null;
  source_url: string | null;
  attribution_html: string | null;
  is_primary: boolean;
};

type RawRestaurant = Omit<Restaurant, "locality" | "stats" | "image"> & {
  locality: { id: string; name: string } | { id: string; name: string }[] | null;
  stats: Restaurant["stats"] | Restaurant["stats"][] | null;
  images: RawImage[] | null;
};

/** Postgrest returns embedded rows as arrays or objects depending on cardinality. */
function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function publicImageUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/rl-restaurant-images/${storagePath}`;
}

/**
 * Resolves an image row to a URL. Demo rows are remote placeholders we do not
 * hold, so they carry a source_url and no storage path; every other source is a
 * file in our own bucket.
 */
function imageUrlFor(image: RawImage): string | null {
  if (image.source === "demo") return image.source_url;
  return image.storage_path ? publicImageUrl(image.storage_path) : null;
}

function shapeRestaurant(row: RawRestaurant): Restaurant {
  const usable = (row.images ?? []).filter((i) => imageUrlFor(i) !== null);
  // A real photo always beats a placeholder, whatever is_primary says.
  const primary =
    usable.find((i) => i.is_primary && i.source !== "demo") ??
    usable.find((i) => i.source !== "demo") ??
    usable.find((i) => i.is_primary) ??
    usable[0] ??
    null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    cuisines: row.cuisines ?? [],
    price_band: row.price_band,
    status: row.status,
    website: row.website,
    phone: row.phone,
    lat: row.lat,
    lng: row.lng,
    locality: first(row.locality),
    stats: first(row.stats),
    image: primary
      ? {
          url: imageUrlFor(primary)!,
          attribution_html: primary.attribution_html,
          isPlaceholder: primary.source === "demo",
        }
      : null,
  };
}

export type BrowseOptions = {
  query?: string;
  localityId?: string;
  sort?: "rating" | "return" | "name";
  limit?: number;
};

/**
 * Browse and search the catalogue.
 *
 * Search is diacritic-insensitive on the client side of the query too: the user
 * types "ghajnsielem" and we match "Għajnsielem", because nobody types ħ on a
 * phone. `ilike` against the raw name would miss it, so we widen the pattern.
 */
export async function browseRestaurants(
  supabase: SupabaseClient,
  options: BrowseOptions = {},
): Promise<Restaurant[]> {
  const { query, localityId, sort = "rating", limit = 60 } = options;

  let request = supabase.from("rl_restaurants").select(RESTAURANT_SELECT);

  if (localityId) request = request.eq("locality_id", localityId);

  if (query?.trim()) {
    const term = query.trim();
    // Match either the literal text or its normalised form, so both
    // "Ħamrun" and "hamrun" find the same row.
    request = request.or(
      `name.ilike.%${term}%,name.ilike.%${normalize(term)}%`,
    );
  }

  request = request.order("name");
  request = request.limit(limit);

  const { data, error } = await request;
  if (error) throw error;

  const shaped = (data as unknown as RawRestaurant[]).map(shapeRestaurant);

  // Sorting by an embedded table is awkward in Postgrest, and at Malta's scale
  // (hundreds of rows, not millions) doing it here is simpler and fast enough.
  if (sort === "rating") {
    shaped.sort((a, b) => {
      const ar = a.stats?.recent_rating ?? -1;
      const br = b.stats?.recent_rating ?? -1;
      if (br !== ar) return br - ar;
      return a.name.localeCompare(b.name);
    });
  } else if (sort === "return") {
    shaped.sort((a, b) => {
      const ar = a.stats?.return_rate ?? -1;
      const br = b.stats?.return_rate ?? -1;
      if (br !== ar) return br - ar;
      return a.name.localeCompare(b.name);
    });
  }

  return shaped;
}

export async function getRestaurantBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<Restaurant | null> {
  const { data, error } = await supabase
    .from("rl_restaurants")
    .select(RESTAURANT_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return shapeRestaurant(data as unknown as RawRestaurant);
}

const VISIT_SELECT = `
  id, visited_on, rating, would_return, note, price_per_head, occasion, is_public, created_at,
  diner:rl_profiles ( username, display_name ),
  restaurant:rl_restaurants (
    slug, name, cuisines,
    locality:rl_localities ( name ),
    images:rl_restaurant_images ( source, storage_path, source_url, attribution_html, is_primary )
  )
`;

type RawVisit = Omit<Visit, "diner" | "restaurant"> & {
  diner: Visit["diner"] | Visit["diner"][];
  restaurant: Record<string, unknown> | Record<string, unknown>[];
};

function shapeVisit(row: RawVisit): Visit {
  const restaurant = first(row.restaurant) as {
    slug: string;
    name: string;
    cuisines: string[] | null;
    locality: { name: string } | { name: string }[] | null;
    images: RawImage[] | null;
  };

  const usable = (restaurant.images ?? []).filter((i) => imageUrlFor(i) !== null);
  const primary =
    usable.find((i) => i.is_primary && i.source !== "demo") ??
    usable.find((i) => i.source !== "demo") ??
    usable.find((i) => i.is_primary) ??
    usable[0] ??
    null;

  return {
    id: row.id,
    visited_on: row.visited_on,
    rating: row.rating,
    would_return: row.would_return,
    note: row.note,
    price_per_head: row.price_per_head,
    occasion: row.occasion,
    is_public: row.is_public,
    created_at: row.created_at,
    diner: first(row.diner),
    restaurant: {
      slug: restaurant.slug,
      name: restaurant.name,
      cuisines: restaurant.cuisines ?? [],
      locality: first(restaurant.locality),
      image: primary
        ? {
            url: imageUrlFor(primary)!,
            attribution_html: primary.attribution_html,
            isPlaceholder: primary.source === "demo",
          }
        : null,
    },
  };
}

/** Visits for one restaurant. RLS already hides other people's private entries. */
export async function getRestaurantVisits(
  supabase: SupabaseClient,
  restaurantId: string,
  limit = 30,
): Promise<Visit[]> {
  const { data, error } = await supabase
    .from("rl_visits")
    .select(VISIT_SELECT)
    .eq("restaurant_id", restaurantId)
    .order("visited_on", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as unknown as RawVisit[]).map(shapeVisit);
}

/** The signed-in diner's own diary, private entries included. */
export async function getMyVisits(
  supabase: SupabaseClient,
  userId: string,
  limit = 100,
): Promise<Visit[]> {
  const { data, error } = await supabase
    .from("rl_visits")
    .select(VISIT_SELECT)
    .eq("user_id", userId)
    .order("visited_on", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as unknown as RawVisit[]).map(shapeVisit);
}

/** The public feed: everyone's public visits, newest first. No algorithm. */
export async function getRecentVisits(
  supabase: SupabaseClient,
  limit = 40,
): Promise<Visit[]> {
  const { data, error } = await supabase
    .from("rl_visits")
    .select(VISIT_SELECT)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as unknown as RawVisit[]).map(shapeVisit);
}

/**
 * How many public visits were logged in the last week.
 *
 * Lives here rather than being derived in the page because reading the clock
 * during render is impure — the same component could produce two different
 * numbers on two renders.
 */
export async function countVisitsThisWeek(
  supabase: SupabaseClient,
): Promise<number> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { count } = await supabase
    .from("rl_visits")
    .select("id", { count: "exact", head: true })
    .eq("is_public", true)
    .gte("created_at", since);
  return count ?? 0;
}

/**
 * Hot this week: restaurants people are logging right now.
 *
 * Counts distinct diners in the last seven days rather than raw visits, so one
 * person logging four times does not manufacture a trend — the same
 * per-diner rule the ratings use. Returns the count alongside each restaurant so
 * the UI can say why it is hot.
 */
export async function getHotThisWeek(
  supabase: SupabaseClient,
  limit = 10,
): Promise<{ restaurant: Restaurant; diners: number }[]> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const { data: recent, error } = await supabase
    .from("rl_visits")
    .select("restaurant_id, user_id")
    .gte("visited_on", since);

  if (error) throw error;

  const dinersByRestaurant = new Map<string, Set<string>>();
  for (const row of recent ?? []) {
    const id = row.restaurant_id as string;
    const set = dinersByRestaurant.get(id) ?? new Set<string>();
    set.add(row.user_id as string);
    dinersByRestaurant.set(id, set);
  }

  const ranked = [...dinersByRestaurant.entries()]
    .map(([id, diners]) => ({ id, count: diners.size }))
    // Two people is a coincidence, not a trend.
    .filter((entry) => entry.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  if (ranked.length === 0) return [];

  const { data, error: fetchError } = await supabase
    .from("rl_restaurants")
    .select(RESTAURANT_SELECT)
    .in(
      "id",
      ranked.map((entry) => entry.id),
    );

  if (fetchError) throw fetchError;

  const byId = new Map(
    (data as unknown as RawRestaurant[]).map((row) => [row.id, shapeRestaurant(row)]),
  );

  return ranked
    .map((entry) => {
      const restaurant = byId.get(entry.id);
      return restaurant ? { restaurant, diners: entry.count } : null;
    })
    .filter((entry): entry is { restaurant: Restaurant; diners: number } => entry !== null);
}

export async function getLocalities(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("rl_localities")
    .select("id, name")
    .eq("region", ACTIVE_MARKET.key)
    .order("name");

  if (error) throw error;
  return data ?? [];
}

/**
 * Per-locality coverage, which is what the completion screen is built from.
 *
 * Done in one pass over the catalogue rather than a query per locality: Malta's
 * whole restaurant list is small enough that fetching it and counting in memory
 * is faster than 68 round trips, and it keeps the maths readable.
 */
export async function getLocalityCoverage(
  supabase: SupabaseClient,
  userId: string,
) {
  const [{ data: localities }, { data: restaurants }, { data: visits }] =
    await Promise.all([
      supabase
        .from("rl_localities")
        .select("id, name")
        .eq("region", ACTIVE_MARKET.key)
        .order("name"),
      supabase.from("rl_restaurants").select("id, locality_id"),
      supabase.from("rl_visits").select("restaurant_id").eq("user_id", userId),
    ]);

  const visitedIds = new Set(
    (visits ?? []).map((v) => v.restaurant_id as string),
  );

  const totals = new Map<string, { total: number; visited: number }>();
  for (const restaurant of restaurants ?? []) {
    const localityId = restaurant.locality_id as string | null;
    if (!localityId) continue;
    const entry = totals.get(localityId) ?? { total: 0, visited: 0 };
    entry.total += 1;
    if (visitedIds.has(restaurant.id as string)) entry.visited += 1;
    totals.set(localityId, entry);
  }

  return (localities ?? []).map((locality) => {
    const entry = totals.get(locality.id as string) ?? { total: 0, visited: 0 };
    return {
      id: locality.id as string,
      name: locality.name as string,
      ...entry,
    };
  });
}

/**
 * Coverage for the completion map: how much of the catalogue this diner has
 * eaten through. The denominator is the curated set, not every licensed outlet —
 * "87 of 412" only means something if the 412 are places worth going.
 */
export async function getCoverage(supabase: SupabaseClient, userId: string) {
  const [{ count: curatedTotal }, { data: visited }, { count: localityTotal }] =
    await Promise.all([
      supabase
        .from("rl_restaurants")
        .select("id", { count: "exact", head: true })
        .eq("is_curated", true),
      supabase.from("rl_visits").select("restaurant_id").eq("user_id", userId),
      supabase
        .from("rl_localities")
        .select("id", { count: "exact", head: true })
        .eq("region", ACTIVE_MARKET.key),
    ]);

  const distinctRestaurants = new Set(
    (visited ?? []).map((v) => v.restaurant_id as string),
  );

  let localitiesVisited = 0;
  if (distinctRestaurants.size > 0) {
    const { data: localityRows } = await supabase
      .from("rl_restaurants")
      .select("locality_id")
      .in("id", [...distinctRestaurants]);
    localitiesVisited = new Set(
      (localityRows ?? [])
        .map((r) => r.locality_id as string | null)
        .filter(Boolean),
    ).size;
  }

  return {
    restaurantsVisited: distinctRestaurants.size,
    restaurantsTotal: curatedTotal ?? 0,
    localitiesVisited,
    localitiesTotal: localityTotal ?? 0,
  };
}
