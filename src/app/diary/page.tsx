import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VisitRow } from "@/components/VisitRow";
import { getCoverage, getMyVisits } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your diary" };
export const dynamic = "force-dynamic";

function CoverageBar({ done, total }: { done: number; total: number }) {
  const percent = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border-subtle">
      <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
    </div>
  );
}

export default async function DiaryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [visits, coverage] = await Promise.all([
    getMyVisits(supabase, user.id),
    getCoverage(supabase, user.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Your diary</h1>
        <p className="mt-1 text-sm text-muted">
          {visits.length} visit{visits.length === 1 ? "" : "s"} logged
        </p>
      </div>

      {/* Coverage is the Malta-specific hook: at this scale, eating through the
          catalogue is a game you can actually finish. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-surface p-4">
          <p className="text-xs text-faint">Restaurants</p>
          <p className="mt-0.5 font-display text-2xl font-semibold tabular">
            {coverage.restaurantsVisited}
            <span className="text-base font-normal text-faint">
              {" "}
              of {coverage.restaurantsTotal}
            </span>
          </p>
          <CoverageBar
            done={coverage.restaurantsVisited}
            total={coverage.restaurantsTotal}
          />
        </div>

        <div className="rounded-lg border bg-surface p-4">
          <p className="text-xs text-faint">Localities</p>
          <p className="mt-0.5 font-display text-2xl font-semibold tabular">
            {coverage.localitiesVisited}
            <span className="text-base font-normal text-faint">
              {" "}
              of {coverage.localitiesTotal}
            </span>
          </p>
          <CoverageBar
            done={coverage.localitiesVisited}
            total={coverage.localitiesTotal}
          />
          <p className="mt-1.5 text-[11px] text-faint">
            Malta and Gozo have {coverage.localitiesTotal} local councils between
            them.
          </p>
        </div>
      </div>

      {visits.length === 0 ? (
        <div className="rounded-lg border bg-surface p-8 text-center">
          <p className="font-display text-lg font-semibold">Nothing logged yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Start with somewhere you have already been — the last few months are
            usually easy to remember, and the diary is more useful the moment it
            has some history in it.
          </p>
          <Link
            href="/browse"
            className="mt-4 inline-block rounded-md bg-accent px-4 py-2 font-medium text-background hover:opacity-90"
          >
            Find a restaurant
          </Link>
        </div>
      ) : (
        <div className="divide-y rounded-lg border bg-surface">
          {visits.map((visit) => (
            <VisitRow key={visit.id} visit={visit} showRestaurant />
          ))}
        </div>
      )}
    </div>
  );
}
