import Link from "next/link";
import { GeneratedCard } from "@/components/GeneratedCard";
import { Stars } from "@/components/Stars";
import { cuisineEmoji } from "@/lib/cuisine";
import type { Restaurant } from "@/lib/types";

/** Card used in the Discover rails. Fixed width so rails snap cleanly. */
export function RestaurantTile({
  restaurant,
  badge,
}: {
  restaurant: Restaurant;
  /** Optional overlay, e.g. "6 this week" on the hot rail. */
  badge?: string;
}) {
  const rating = restaurant.stats?.recent_rating ?? null;
  const emoji = cuisineEmoji(restaurant.cuisines);

  return (
    <Link
      href={`/r/${restaurant.slug}`}
      className="press block w-40 shrink-0 sm:w-44"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl">
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

        {badge && (
          <span className="absolute top-2 left-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
            {badge}
          </span>
        )}
      </div>

      <h3 className="display mt-2 text-[17px] leading-tight">
        {emoji && <span className="mr-1">{emoji}</span>}
        {restaurant.name}
      </h3>
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
