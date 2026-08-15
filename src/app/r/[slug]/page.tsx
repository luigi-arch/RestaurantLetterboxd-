import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GeneratedCard } from "@/components/GeneratedCard";
import { LogVisitPanel } from "@/components/LogVisitPanel";
import { PriceBand, Stars } from "@/components/Stars";
import { VisitRow } from "@/components/VisitRow";
import { getRestaurantBySlug, getRestaurantVisits } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const restaurant = await getRestaurantBySlug(supabase, slug);
  if (!restaurant) return { title: "Not found" };

  const where = restaurant.locality?.name ?? "Malta";
  return {
    title: `${restaurant.name}, ${where}`,
    description: `Ratings, return rate and diary entries for ${restaurant.name} in ${where}.`,
  };
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-surface p-3">
      <p className="text-xs text-faint">{label}</p>
      <p className="mt-0.5 font-display text-xl font-semibold tabular">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-faint">{hint}</p>}
    </div>
  );
}

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const restaurant = await getRestaurantBySlug(supabase, slug);
  if (!restaurant) notFound();

  const [visits, { data: auth }] = await Promise.all([
    getRestaurantVisits(supabase, restaurant.id),
    supabase.auth.getUser(),
  ]);

  const stats = restaurant.stats;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border bg-surface">
        <div className="relative aspect-[16/7] w-full">
          {restaurant.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={restaurant.image.url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <GeneratedCard name={restaurant.name} className="h-full w-full" />
          )}
        </div>

        <div className="p-4">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <h1 className="font-display text-2xl leading-tight font-semibold">
              {restaurant.name}
            </h1>
            <span className="mt-1">
              <PriceBand band={restaurant.price_band} />
            </span>
          </div>

          <p className="mt-1 text-sm text-muted">
            {restaurant.locality?.name ?? "Malta"}
            {restaurant.cuisines.length > 0 && (
              <span className="text-faint"> · {restaurant.cuisines.join(", ")}</span>
            )}
          </p>

          {restaurant.status === "unverified" && (
            <p className="mt-2 inline-block rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] text-gold">
              Details not yet verified
            </p>
          )}

          {restaurant.website && (
            <a
              href={restaurant.website}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-sm text-accent hover:underline"
            >
              Visit website
            </a>
          )}
        </div>
      </div>

      {/* Stats. recent_rating leads because a restaurant that was good in 2019
          and bad now should read as bad. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Recent rating"
          value={stats?.recent_rating != null ? stats.recent_rating.toFixed(1) : "—"}
          hint="Weighted to the last 15 months"
        />
        <Stat
          label="Would return"
          value={
            stats?.would_return_pct != null
              ? `${Math.round(stats.would_return_pct * 100)}%`
              : "—"
          }
          hint="Of diners, on their last visit"
        />
        <Stat
          label="Return rate"
          value={
            stats && stats.distinct_diners > 0
              ? `${Math.round(stats.return_rate * 100)}%`
              : "—"
          }
          hint="Came back at least once"
        />
        <Stat
          label="Diners"
          value={stats ? String(stats.distinct_diners) : "0"}
          hint={stats ? `${stats.visit_count} visits logged` : "Nobody yet"}
        />
      </div>

      {stats?.recent_rating != null && (
        <div className="flex items-center gap-3">
          <Stars value={stats.recent_rating} size={22} />
          {stats.avg_rating != null &&
            stats.avg_rating !== stats.recent_rating && (
              <span className="text-xs text-faint">
                All-time average {stats.avg_rating.toFixed(1)}
              </span>
            )}
        </div>
      )}

      <LogVisitPanel
        restaurantId={restaurant.id}
        restaurantName={restaurant.name}
        signedIn={Boolean(auth.user)}
      />

      <section>
        <h2 className="font-display text-lg font-semibold">
          {visits.length > 0 ? "Diary entries" : "No entries yet"}
        </h2>

        {visits.length === 0 ? (
          <p className="mt-2 rounded-lg border bg-surface p-6 text-center text-sm text-muted">
            Nobody has logged a meal here.{" "}
            {auth.user ? (
              "Be the first."
            ) : (
              <Link href="/login" className="text-accent hover:underline">
                Sign in to be the first.
              </Link>
            )}
          </p>
        ) : (
          <div className="mt-3 divide-y rounded-lg border bg-surface">
            {visits.map((visit) => (
              <VisitRow key={visit.id} visit={visit} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
