import Link from "next/link";
import { GeneratedCard } from "@/components/GeneratedCard";
import { Stars } from "@/components/Stars";
import type { Restaurant } from "@/lib/types";

/** Card used in the Discover rails. Fixed width so rails snap cleanly. */
export function RestaurantTile({ restaurant }: { restaurant: Restaurant }) {
  const rating = restaurant.stats?.recent_rating ?? null;

  return (
    <Link
      href={`/r/${restaurant.slug}`}
      className="press block w-40 shrink-0 sm:w-44"
    >
      <div className="aspect-[4/5] w-full overflow-hidden rounded-xl">
        {restaurant.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.image.url}
            alt=""
            loading="lazy"
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

      <h3 className="display mt-2 text-[17px] leading-tight">{restaurant.name}</h3>
      <p className="mt-0.5 text-xs text-faint">
        {restaurant.locality?.name ?? "Malta"}
      </p>

      {rating !== null ? (
        <div className="mt-1.5 flex items-center gap-1.5">
          <Stars value={rating} size={12} />
          <span className="tabular text-xs text-dim">{rating.toFixed(1)}</span>
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-faint">Not yet rated</p>
      )}
    </Link>
  );
}
