import type { Metadata } from "next";
import { DiscoverSearch } from "@/components/DiscoverSearch";
import { RestaurantTile } from "@/components/RestaurantTile";
import { browseRestaurants } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type { Restaurant } from "@/lib/types";

export const metadata: Metadata = { title: "Discover" };
export const dynamic = "force-dynamic";

/**
 * Discover is rails, not an endless list.
 *
 * Sections are chosen to be populated by the data that actually exists. Several
 * obvious ones — trending, recently improved, highest return rate — depend on
 * visit history and would be empty shelves today, so they are deliberately
 * absent until they would say something.
 */
type Rail = {
  title: string;
  note?: string;
  pick: (all: Restaurant[]) => Restaurant[];
};

const matchesCuisine = (r: Restaurant, pattern: RegExp) =>
  pattern.test(r.cuisines.join(" "));

const RAILS: Rail[] = [
  {
    title: "Highest rated",
    note: "By recent rating, weighted to the last 15 months",
    pick: (all) =>
      all
        .filter((r) => r.stats?.recent_rating != null)
        .sort(
          (a, b) => (b.stats!.recent_rating ?? 0) - (a.stats!.recent_rating ?? 0),
        ),
  },
  {
    title: "Most returned to",
    note: "The share of diners who came back",
    pick: (all) =>
      all
        .filter((r) => (r.stats?.distinct_diners ?? 0) > 0)
        .sort((a, b) => (b.stats?.return_rate ?? 0) - (a.stats?.return_rate ?? 0)),
  },
  {
    title: "Maltese kitchens",
    pick: (all) => all.filter((r) => matchesCuisine(r, /maltese|rabbit|ftira|farm/)),
  },
  {
    title: "Seafood",
    pick: (all) => all.filter((r) => matchesCuisine(r, /seafood|fish/)),
  },
  {
    title: "Pizza and pasta",
    pick: (all) => all.filter((r) => matchesCuisine(r, /pizza|italian|pasta/)),
  },
  {
    title: "Worth the occasion",
    note: "€€€€",
    pick: (all) => all.filter((r) => r.price_band === 4),
  },
  {
    title: "Cheap and cheerful",
    note: "€ and €€",
    pick: (all) => all.filter((r) => (r.price_band ?? 9) <= 2),
  },
  {
    title: "Over in Gozo",
    pick: (all) =>
      all.filter((r) =>
        /victoria|xagħra|xewkija|nadur|munxar|għarb|għasri|kerċem|qala|sannat|fontana|għajnsielem|san lawrenz|żebbuġ għawdex/i.test(
          r.locality?.name ?? "",
        ),
      ),
  },
  {
    title: "Cafés and bakeries",
    pick: (all) => all.filter((r) => matchesCuisine(r, /cafe|pastr|cake|pastizzi|bread/)),
  },
];

export default async function DiscoverPage() {
  const supabase = await createClient();
  const all = await browseRestaurants(supabase, { sort: "name", limit: 500 });

  const rails = RAILS.map((rail) => ({
    ...rail,
    items: rail.pick(all).slice(0, 12),
  })).filter((rail) => rail.items.length > 0);

  return (
    <div className="space-y-10">
      <DiscoverSearch />

      {rails.map((rail, index) => (
        <section
          key={rail.title}
          className="rise"
          style={{ animationDelay: `${Math.min(index, 6) * 50}ms` }}
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="display text-xl">{rail.title}</h2>
            {rail.note && (
              <span className="shrink-0 text-[11px] text-faint">{rail.note}</span>
            )}
          </div>

          {/* Negative margin lets the rail bleed to the screen edge. */}
          <div className="no-scrollbar rail -mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-1">
            {rail.items.map((restaurant) => (
              <RestaurantTile key={restaurant.id} restaurant={restaurant} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
