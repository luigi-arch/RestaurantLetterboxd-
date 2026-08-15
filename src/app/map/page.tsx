import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocalityCoverage } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your map" };
export const dynamic = "force-dynamic";

/**
 * Completion.
 *
 * This is the Malta-specific hook: around 400–600 restaurants actually matter,
 * so eating through the catalogue is a game you can genuinely finish. Nobody
 * covers 1% of Letterboxd's films, and coverage means nothing in London.
 *
 * NOTE: this is a locality grid rather than a geographic map, because the
 * seeded restaurants have no coordinates yet — the OpenStreetMap import that
 * carries lat/lng has not been able to run. When it does, each of these cells
 * becomes a region of a real dotted map of Malta and Gozo.
 */
export default async function MapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const coverage = await getLocalityCoverage(supabase, user.id);

  const visitedTotal = coverage.reduce((sum, l) => sum + l.visited, 0);
  const restaurantTotal = coverage.reduce((sum, l) => sum + l.total, 0);
  const localitiesStarted = coverage.filter((l) => l.visited > 0).length;
  const localitiesWithFood = coverage.filter((l) => l.total > 0).length;
  const percent =
    restaurantTotal > 0 ? Math.round((visitedTotal / restaurantTotal) * 100) : 0;

  return (
    <div className="space-y-8">
      <header className="rise">
        <p className="label">You have visited</p>
        <p className="display mt-1 text-7xl tabular leading-none">{visitedTotal}</p>
        <p className="mt-1 text-dim">
          of {restaurantTotal} restaurants in the catalogue
        </p>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="grow-bar h-full rounded-full bg-accent"
            style={{ width: `${Math.max(percent, 1)}%` }}
          />
        </div>
        <p className="mt-2 tabular text-sm text-dim">{percent}% complete</p>
      </header>

      <section className="rise">
        <div className="flex items-baseline justify-between">
          <h2 className="label">Localities</h2>
          <p className="tabular text-sm text-dim">
            {localitiesStarted} / {localitiesWithFood}
          </p>
        </div>

        {/* Grey means never been, filled means been, and a full ring means the
            locality is finished. */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {coverage
            .filter((locality) => locality.total > 0)
            .map((locality, index) => {
              const done = locality.visited >= locality.total;
              const started = locality.visited > 0;

              return (
                <Link
                  key={locality.id}
                  href={`/discover`}
                  className={`press rise rounded-2xl border p-3 ${
                    done
                      ? "border-success bg-success/10"
                      : started
                        ? "border-accent/40 bg-accent/5"
                        : ""
                  }`}
                  style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
                >
                  <p className="truncate text-sm font-medium">{locality.name}</p>
                  <p
                    className={`tabular mt-1 text-xs ${
                      done ? "text-success" : started ? "text-accent" : "text-faint"
                    }`}
                  >
                    {locality.visited} / {locality.total}
                    {done && " ✓"}
                  </p>
                </Link>
              );
            })}
        </div>
      </section>

      <p className="rise text-xs text-faint">
        A dotted map of Malta and Gozo replaces this grid once the restaurant
        import brings coordinates with it.
      </p>
    </div>
  );
}
