import Link from "next/link";
import { Stars } from "@/components/Stars";
import type { Visit } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function VisitRow({
  visit,
  showRestaurant = false,
}: {
  visit: Visit;
  showRestaurant?: boolean;
}) {
  return (
    <article className="p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {showRestaurant && (
          <Link
            href={`/r/${visit.restaurant.slug}`}
            className="font-display font-semibold hover:text-accent"
          >
            {visit.restaurant.name}
          </Link>
        )}

        {visit.diner && (
          <span className="text-sm text-muted">
            {showRestaurant ? "— " : ""}
            {visit.diner.display_name ?? `@${visit.diner.username}`}
          </span>
        )}

        <span className="ml-auto text-xs text-faint tabular">
          {formatDate(visit.visited_on)}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
        {visit.rating !== null ? (
          <>
            <Stars value={visit.rating} size={13} />
            <span className="tabular text-muted">{visit.rating.toFixed(1)}</span>
          </>
        ) : (
          <span className="text-xs text-faint">No rating</span>
        )}

        {/* The honest signal, and the one nobody is allowed to skip. */}
        <span
          className={
            visit.would_return
              ? "rounded-full bg-balcony-green/15 px-2 py-0.5 text-[11px] font-medium text-balcony-green"
              : "rounded-full bg-balcony-red/15 px-2 py-0.5 text-[11px] font-medium text-balcony-red"
          }
        >
          {visit.would_return ? "Would return" : "Wouldn't return"}
        </span>

        {!visit.is_public && (
          <span className="rounded-full border px-2 py-0.5 text-[11px] text-faint">
            Private
          </span>
        )}

        {visit.price_per_head !== null && (
          <span className="text-xs text-faint tabular">
            €{Number(visit.price_per_head).toFixed(0)} pp
          </span>
        )}
      </div>

      {visit.note && (
        <p className="mt-1.5 text-sm text-muted whitespace-pre-line">{visit.note}</p>
      )}
    </article>
  );
}
