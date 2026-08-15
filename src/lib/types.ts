/** Shapes returned by the queries in ./queries.ts. */

export type Locality = {
  id: string;
  name: string;
  aliases: string[];
};

export type RestaurantStats = {
  recent_rating: number | null;
  avg_rating: number | null;
  return_rate: number;
  would_return_pct: number | null;
  visit_count: number;
  distinct_diners: number;
};

export type Restaurant = {
  id: string;
  slug: string;
  name: string;
  cuisines: string[];
  price_band: number | null;
  status: "open" | "closed" | "unverified";
  website: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  locality: Pick<Locality, "id" | "name"> | null;
  stats: RestaurantStats | null;
  image: {
    url: string;
    attribution_html: string | null;
    /** True for stock placeholders, which must be labelled as not this restaurant. */
    isPlaceholder: boolean;
  } | null;
};

export type Visit = {
  id: string;
  visited_on: string;
  rating: number | null;
  would_return: boolean;
  note: string | null;
  price_per_head: number | null;
  occasion: string | null;
  is_public: boolean;
  created_at: string;
  diner: { username: string; display_name: string | null } | null;
  restaurant: Pick<Restaurant, "slug" | "name" | "cuisines" | "image"> & {
    locality: { name: string } | null;
  };
};

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  created_at: string;
};
