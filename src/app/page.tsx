import Link from "next/link";
import { RestaurantCard } from "@/components/RestaurantCard";
import { VisitRow } from "@/components/VisitRow";
import { BRAND } from "@/config/brand";
import { browseRestaurants, getRecentVisits } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

// Ratings shift as people log, so don't serve a stale page.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();

  const [topRated, recentVisits] = await Promise.all([
    browseRestaurants(supabase, { sort: "rating", limit: 8 }),
    getRecentVisits(supabase, 8),
  ]);

  const rated = topRated.filter((r) => r.stats?.recent_rating != null);

  return (
    <div className="space-y-10">
      <section className="py-6">
        <h1 className="font-display text-3xl leading-tight font-semibold sm:text-4xl">
          {BRAND.tagline}
        </h1>
        <p className="mt-3 max-w-xl text-muted">
          Malta has around 3,000 restaurants and 588,000 people. Keep a diary of
          the ones you actually eat at, see what the people you trust think, and
          watch the map fill in.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/browse"
            className="rounded-md bg-accent px-4 py-2 font-medium text-background hover:opacity-90"
          >
            Browse restaurants
          </Link>
          <Link
            href="/login"
            className="rounded-md border px-4 py-2 font-medium hover:border-accent"
          >
            Start your diary
          </Link>
        </div>
      </section>

      {recentVisits.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold">Recently logged</h2>
            <span className="text-xs text-faint">Newest first, no algorithm</span>
          </div>
          <div className="mt-3 divide-y rounded-lg border bg-surface">
            {recentVisits.map((visit) => (
              <VisitRow key={visit.id} visit={visit} showRestaurant />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-semibold">
            {rated.length > 0 ? "Highest rated" : "In the catalogue"}
          </h2>
          <Link href="/browse" className="text-sm text-accent hover:underline">
            See all
          </Link>
        </div>

        {rated.length === 0 && (
          <p className="mt-2 text-sm text-muted">
            Nothing has been rated yet — the ratings here come entirely from what
            people log. Be the first.
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(rated.length > 0 ? rated : topRated).slice(0, 8).map((restaurant) => (
            <RestaurantCard key={restaurant.id} restaurant={restaurant} />
          ))}
        </div>
      </section>
    </div>
  );
}
