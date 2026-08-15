import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { ReturnBadge, Stars } from "@/components/Stars";
import { getCoverage, getMyVisits } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { formatVisitDate, monthKey } from "@/lib/time";
import type { Visit } from "@/lib/types";

export const metadata: Metadata = { title: "You" };
export const dynamic = "force-dynamic";

export default async function MePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [visits, coverage, { data: profile }] = await Promise.all([
    getMyVisits(supabase, user.id),
    getCoverage(supabase, user.id),
    supabase
      .from("rl_profiles")
      .select("username, display_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const percent =
    coverage.restaurantsTotal > 0
      ? Math.round((coverage.restaurantsVisited / coverage.restaurantsTotal) * 100)
      : 0;

  // Diary grouped by month, the way a journal reads.
  const byMonth = new Map<string, Visit[]>();
  for (const visit of visits) {
    const key = monthKey(visit.visited_on);
    const bucket = byMonth.get(key);
    if (bucket) bucket.push(visit);
    else byMonth.set(key, [visit]);
  }

  return (
    <div className="space-y-9">
      <header className="rise">
        <p className="label">
          {profile?.display_name ?? `@${profile?.username ?? "you"}`}
        </p>

        {/* The hero stat is what you have eaten, not who follows you. */}
        <p className="display mt-2 text-7xl tabular leading-none">
          {visits.length}
        </p>
        <p className="mt-1 text-dim">
          {visits.length === 1 ? "meal logged" : "meals logged"}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4 border-t pt-5">
          <div>
            <p className="label">Completion</p>
            <p className="display mt-1 text-3xl tabular">{percent}%</p>
            <p className="mt-0.5 text-xs text-faint">
              {coverage.restaurantsVisited} of {coverage.restaurantsTotal}
            </p>
          </div>
          <div>
            <p className="label">Localities</p>
            <p className="display mt-1 text-3xl tabular">
              {coverage.localitiesVisited}
              <span className="text-faint"> / {coverage.localitiesTotal}</span>
            </p>
            <Link href="/map" className="mt-0.5 block text-xs text-accent">
              See your map
            </Link>
          </div>
        </div>
      </header>

      {visits.length === 0 ? (
        <div className="rise">
          <h2 className="display text-2xl">Your diary is empty</h2>
          <p className="mt-3 text-dim">
            Start with somewhere you have already been. The last few months are
            usually easy to remember, and the diary is worth far more once it has
            some history in it.
          </p>
          <Link
            href="/log"
            className="press mt-5 inline-block rounded-full bg-accent px-5 py-2.5 font-medium text-bg"
          >
            Log your first visit
          </Link>
        </div>
      ) : (
        <section className="rise">
          <h2 className="label mb-4">Diary</h2>

          <div className="space-y-8">
            {[...byMonth.entries()].map(([month, monthVisits]) => (
              <div key={month}>
                <h3 className="display sticky top-14 z-10 bg-bg/90 py-1.5 text-lg backdrop-blur">
                  {month}
                </h3>

                <ul className="divide-y">
                  {monthVisits.map((visit) => (
                    <li key={visit.id} className="py-3.5">
                      <div className="flex items-baseline gap-3">
                        <Link
                          href={`/r/${visit.restaurant.slug}`}
                          className="display text-lg hover:text-accent"
                        >
                          {visit.restaurant.name}
                        </Link>
                        <span className="ml-auto shrink-0 text-xs text-faint">
                          {formatVisitDate(visit.visited_on)}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2.5">
                        {visit.rating !== null && (
                          <Stars value={visit.rating} size={14} />
                        )}
                        <ReturnBadge wouldReturn={visit.would_return} />
                        {!visit.is_public && (
                          <span className="rounded-full border px-2 py-0.5 text-[10px] text-faint">
                            Private
                          </span>
                        )}
                      </div>

                      {visit.note && (
                        <p className="mt-2 text-sm text-dim">{visit.note}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="rise border-t pt-6">
        <SignOutButton />
      </div>
    </div>
  );
}
