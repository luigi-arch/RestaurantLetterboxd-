import type { Metadata } from "next";
import { RestaurantCard } from "@/components/RestaurantCard";
import { SearchControls } from "@/components/SearchControls";
import { browseRestaurants, getLocalities } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Browse" };
export const dynamic = "force-dynamic";

export default async function BrowsePage({
  searchParams,
}: {
  // In Next.js 16 searchParams is a Promise and must be awaited.
  searchParams: Promise<{ q?: string; locality?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const sort =
    params.sort === "return" || params.sort === "name" ? params.sort : "rating";

  const [restaurants, localities] = await Promise.all([
    browseRestaurants(supabase, {
      query: params.q,
      localityId: params.locality,
      sort,
      limit: 200,
    }),
    getLocalities(supabase),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Browse</h1>
        <p className="mt-1 text-sm text-muted">
          {restaurants.length} restaurant{restaurants.length === 1 ? "" : "s"}
          {params.q ? ` matching “${params.q}”` : ""}
        </p>
      </div>

      <SearchControls
        localities={localities}
        defaultQuery={params.q ?? ""}
        defaultLocality={params.locality ?? ""}
        defaultSort={sort}
      />

      {restaurants.length === 0 ? (
        <p className="rounded-lg border bg-surface p-6 text-center text-sm text-muted">
          Nothing found. Maltese names are searchable without diacritics — try
          “hamrun” for Ħamrun, or “zebbug” for Żebbuġ.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {restaurants.map((restaurant) => (
            <RestaurantCard key={restaurant.id} restaurant={restaurant} />
          ))}
        </div>
      )}
    </div>
  );
}
