import Link from "next/link";
import { GeneratedCard } from "@/components/GeneratedCard";
import { PriceBand, Stars } from "@/components/Stars";
import type { Restaurant } from "@/lib/types";

export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const stats = restaurant.stats;
  const rating = stats?.recent_rating ?? null;

  return (
    <Link
      href={`/r/${restaurant.slug}`}
      className="group block overflow-hidden rounded-lg border bg-surface transition hover:border-accent/50 hover:bg-surface-raised"
    >
      <div className="relative aspect-[3/2] w-full">
        {restaurant.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.image.url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <GeneratedCard name={restaurant.name} className="h-full w-full" />
        )}
      </div>

      <div className="p-3">
        <h3 className="font-display text-base leading-tight font-semibold group-hover:text-accent">
          {restaurant.name}
        </h3>

        <p className="mt-0.5 text-xs text-muted">
          {restaurant.locality?.name ?? "Malta"}
          {restaurant.cuisines.length > 0 && (
            <span className="text-faint"> · {restaurant.cuisines[0]}</span>
          )}
        </p>

        <div className="mt-2 flex items-center gap-2 text-xs">
          {rating !== null ? (
            <>
              <Stars value={rating} size={13} />
              <span className="tabular text-muted">{rating.toFixed(1)}</span>
            </>
          ) : (
            // Never render an unrated restaurant as though it scored zero.
            <span className="text-faint">Not yet rated</span>
          )}

          <span className="ml-auto">
            <PriceBand band={restaurant.price_band} />
          </span>
        </div>

        {stats && stats.distinct_diners > 0 && (
          <p className="mt-1.5 text-[11px] text-faint tabular">
            {stats.distinct_diners} diner{stats.distinct_diners === 1 ? "" : "s"}
            {stats.would_return_pct !== null && (
              <> · {Math.round(stats.would_return_pct * 100)}% would return</>
            )}
          </p>
        )}
      </div>
    </Link>
  );
}
