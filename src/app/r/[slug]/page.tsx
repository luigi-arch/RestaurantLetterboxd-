import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GeneratedCard } from "@/components/GeneratedCard";
import { RestaurantActions } from "@/components/RestaurantActions";
import { PriceBand, ReturnBadge, Stars } from "@/components/Stars";
import { authRedirectOrigin } from "@/config/site";
import { getRestaurantBySlug, getRestaurantVisits } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { formatVisitDate } from "@/lib/time";

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

  const [{ data: wishRow }, { count: wishCount }] = await Promise.all([
    auth.user
      ? supabase
          .from("rl_wishlist")
          .select("user_id")
          .eq("user_id", auth.user.id)
          .eq("restaurant_id", restaurant.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("rl_wishlist")
      .select("user_id", { count: "exact", head: true })
      .eq("restaurant_id", restaurant.id),
  ]);

  const stats = restaurant.stats;
  const withNotes = visits.filter((v) => v.note);

  // Spend and occasion are only interesting once a few people have logged them.
  const spends = visits
    .map((v) => v.price_per_head)
    .filter((p): p is number => p !== null)
    .map(Number);
  const averageSpend =
    spends.length > 0
      ? Math.round(spends.reduce((a, b) => a + b, 0) / spends.length)
      : null;

  return (
    <div className="space-y-8">
      <div className="rise -mx-5 aspect-[16/9] overflow-hidden sm:mx-0 sm:rounded-3xl">
        {restaurant.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.image.url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <GeneratedCard
            name={restaurant.name}
            cuisines={restaurant.cuisines}
            className="h-full w-full"
          />
        )}
      </div>

      <header className="rise">
        <h1 className="display text-4xl leading-none sm:text-5xl">
          {restaurant.name}
        </h1>

        <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-dim">
          <span>{restaurant.locality?.name ?? "Malta"}</span>
          {restaurant.cuisines.length > 0 && (
            <>
              <Dot />
              <span>{restaurant.cuisines.join(", ")}</span>
            </>
          )}
          {restaurant.price_band && (
            <>
              <Dot />
              <PriceBand band={restaurant.price_band} />
            </>
          )}
        </p>

        {restaurant.status === "unverified" && (
          <p className="mt-3 inline-block rounded-full border px-2.5 py-1 text-[11px] text-faint">
            Details not verified yet
          </p>
        )}
      </header>

      {/* The headline number leads with recency: a restaurant that was good in
          2019 and poor now should read as poor. */}
      <section className="rise">
        {stats?.recent_rating != null ? (
          <div className="flex items-end gap-4">
            <div>
              <p className="label">Recent rating</p>
              <p className="display mt-1 text-6xl tabular leading-none">
                {stats.recent_rating.toFixed(1)}
              </p>
            </div>
            <div className="pb-1.5">
              <Stars value={stats.recent_rating} size={20} />
              {stats.avg_rating != null &&
                stats.avg_rating !== stats.recent_rating && (
                  <p className="mt-1.5 text-xs text-faint">
                    All-time {stats.avg_rating.toFixed(1)}
                  </p>
                )}
            </div>
          </div>
        ) : (
          <div>
            <p className="label">Recent rating</p>
            <p className="display mt-1 text-4xl text-faint">Not yet rated</p>
            <p className="mt-1 text-sm text-dim">
              Every rating here comes from someone who actually went.
            </p>
          </div>
        )}

        <dl className="mt-6 grid grid-cols-3 gap-3 border-t pt-5">
          <Stat
            label="Would return"
            value={
              stats?.would_return_pct != null
                ? `${Math.round(stats.would_return_pct * 100)}%`
                : "—"
            }
          />
          <Stat
            label="Repeat visitors"
            value={
              stats && stats.distinct_diners > 0
                ? `${Math.round(stats.return_rate * 100)}%`
                : "—"
            }
          />
          <Stat
            label="Diners"
            value={stats ? String(stats.distinct_diners) : "0"}
          />
        </dl>

        {averageSpend !== null && (
          <p className="mt-4 text-sm text-dim">
            Average spend{" "}
            <span className="tabular text-text">€{averageSpend}</span> per head,
            across {spends.length} logged {spends.length === 1 ? "visit" : "visits"}.
          </p>
        )}
      </section>

      <div className="rise">
        <RestaurantActions
          restaurantId={restaurant.id}
          restaurantName={restaurant.name}
          localityName={restaurant.locality?.name ?? null}
          signedIn={Boolean(auth.user)}
          initiallyWishlisted={Boolean(wishRow)}
          shareUrl={`${authRedirectOrigin()}/r/${restaurant.slug}`}
        />
        {(wishCount ?? 0) > 0 && (
          <p className="mt-2.5 text-xs text-faint">
            {wishCount} {wishCount === 1 ? "person wants" : "people want"} to go.
          </p>
        )}
      </div>

      {withNotes.length > 0 && (
        <section className="rise">
          <h2 className="label mb-3">What people said</h2>
          <div className="space-y-4">
            {withNotes.slice(0, 3).map((visit) => (
              <blockquote key={visit.id} className="border-l-2 pl-4">
                <p className="display text-xl leading-snug italic">
                  “{visit.note}”
                </p>
                <footer className="mt-2 text-xs text-faint">
                  {visit.diner?.display_name ?? `@${visit.diner?.username}`} ·{" "}
                  {formatVisitDate(visit.visited_on)}
                </footer>
              </blockquote>
            ))}
          </div>
        </section>
      )}

      <section className="rise">
        <h2 className="label mb-3">
          {visits.length > 0 ? "Diary entries" : "Nobody has been yet"}
        </h2>

        {visits.length === 0 ? (
          <p className="text-dim">
            No one has logged a meal here.{" "}
            {auth.user ? (
              "Be the first."
            ) : (
              <Link href="/login" className="text-accent hover:underline">
                Sign in to be the first.
              </Link>
            )}
          </p>
        ) : (
          <ul className="divide-y">
            {visits.map((visit) => (
              <li key={visit.id} className="flex flex-wrap items-center gap-3 py-3.5">
                <span className="text-sm">
                  {visit.diner?.display_name ?? `@${visit.diner?.username}`}
                </span>
                {visit.rating !== null && <Stars value={visit.rating} size={14} />}
                <ReturnBadge wouldReturn={visit.would_return} />
                <span className="ml-auto text-xs text-faint">
                  {formatVisitDate(visit.visited_on)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {restaurant.website && (
        <a
          href={restaurant.website}
          target="_blank"
          rel="noreferrer"
          className="rise block text-sm text-accent hover:underline"
        >
          Visit their website
        </a>
      )}
    </div>
  );
}

function Dot() {
  return <span className="text-faint">·</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="display mt-1 text-3xl tabular">{value}</dd>
    </div>
  );
}
