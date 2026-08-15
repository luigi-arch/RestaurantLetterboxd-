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
  images:rl_restaurant_images ( storage_path, attribution_html, is_primary )
`;

type RawRestaurant = Omit<Restaurant, "locality" | "stats" | "image"> & {
  locality: { id: string; name: string } | { id: string; name: string }[] | null;
  stats: Restaurant["stats"] | Restaurant["stats"][] | null;
  images:
    | { storage_path: string | null; attribution_html: string | null; is_primary: boolean }[]
    | null;
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

function shapeRestaurant(row: RawRestaurant): Restaurant {
  const primary =
    row.images?.find((i) => i.is_primary && i.storage_path) ??
    row.images?.find((i) => i.storage_path) ??
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
    image: primary?.storage_path
      ? {
          url: publicImageUrl(primary.storage_path),
          attribution_html: primary.attribution_html,
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
  id, visited_on, rating, would_return, note, price_per_head, is_public, created_at,
  diner:rl_profiles ( username, display_name ),
  restaurant:rl_restaurants ( slug, name, locality:rl_localities ( name ) )
`;

type RawVisit = Omit<Visit, "diner" | "restaurant"> & {
  diner: Visit["diner"] | Visit["diner"][];
  restaurant: Record<string, unknown> | Record<string, unknown>[];
};

function shapeVisit(row: RawVisit): Visit {
  const restaurant = first(row.restaurant) as {
    slug: string;
    name: string;
    locality: { name: string } | { name: string }[] | null;
  };

  return {
    id: row.id,
    visited_on: row.visited_on,
    rating: row.rating,
    would_return: row.would_return,
    note: row.note,
    price_per_head: row.price_per_head,
    is_public: row.is_public,
    created_at: row.created_at,
    diner: first(row.diner),
    restaurant: {
      slug: restaurant.slug,
      name: restaurant.name,
      locality: first(restaurant.locality),
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
