import Link from "next/link";
import { GeneratedCard } from "@/components/GeneratedCard";
import { ReturnBadge, Stars } from "@/components/Stars";
import { cuisineEmoji, occasionEmoji, ratingMood } from "@/lib/cuisine";
import { timeAgo } from "@/lib/time";
import type { Visit } from "@/lib/types";

/**
 * A feed entry.
 *
 * The feed carries activities, not restaurants — "Luigi visited Noni", not a
 * card about Noni. People are why you open it, so the person leads and the
 * restaurant follows. Chronological, never ranked.
 *
 * Typed as a union so completions, lists and follows can join later without
 * reshaping the feed; only visits are populated today.
 */
export type Activity =
  | { kind: "visit"; visit: Visit }
  | {
      kind: "completion";
      who: { username: string; display_name: string | null };
      locality: string;
      done: number;
      total: number;
      at: string;
    };

/** Stable tint per person, so the same diner is the same colour everywhere. */
const AVATAR_TINTS = [
  "#153b63",
  "#61754a",
  "#b45a45",
  "#6b5578",
  "#3c4a56",
  "#8a6d4b",
];

function Avatar({ name }: { name: string }) {
  // Initials on a tinted disc: no uploads yet, and a grey silhouette would be
  // worse than something with a bit of identity.
  const initials = name.slice(0, 2).toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;

  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white/90"
      style={{ background: AVATAR_TINTS[hash % AVATAR_TINTS.length] }}
    >
      {initials}
    </span>
  );
}

export function ActivityCard({ activity }: { activity: Activity }) {
  if (activity.kind === "completion") {
    const who = activity.who.display_name ?? activity.who.username;
    const percent = Math.round((activity.done / activity.total) * 100);

    return (
      <article className="flex gap-3 py-5">
        <Avatar name={who} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-dim">
            <span className="font-medium text-text">{who}</span> has eaten through{" "}
            <span className="font-medium text-text">{activity.locality}</span>
          </p>
          <p className="display mt-2 text-4xl tabular">{percent}%</p>
          <p className="label mt-1">
            {activity.done} of {activity.total}
          </p>
          <p className="mt-2 text-xs text-faint">{timeAgo(activity.at)}</p>
        </div>
      </article>
    );
  }

  const { visit } = activity;
  const who = visit.diner?.display_name ?? visit.diner?.username ?? "Someone";

  return (
    <article className="flex gap-3 py-5">
      <Avatar name={who} />

      <div className="min-w-0 flex-1">
        <p className="text-sm text-dim">
          <span className="font-medium text-text">{who}</span> visited
        </p>

        <Link href={`/r/${visit.restaurant.slug}`} className="press mt-1.5 flex gap-3">
          <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl">
            {visit.restaurant.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={visit.restaurant.image.url}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <GeneratedCard
                name={visit.restaurant.name}
                cuisines={visit.restaurant.cuisines}
                showInitial={false}
                className="h-full w-full"
              />
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="display block text-2xl leading-tight">
              {visit.restaurant.name}
            </span>
            <span className="mt-0.5 block text-xs text-faint">
              {cuisineEmoji(visit.restaurant.cuisines)}{" "}
              {visit.restaurant.locality?.name ?? "Malta"}
            </span>
          </span>
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          {visit.rating !== null && (
            <>
              <Stars value={visit.rating} size={17} />
              <span className="text-xs text-faint">{ratingMood(visit.rating)}</span>
            </>
          )}
          <ReturnBadge wouldReturn={visit.would_return} />
          {visit.occasion && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-dim">
              {occasionEmoji(visit.occasion)} {visit.occasion}
            </span>
          )}
          {visit.price_per_head !== null && (
            <span className="tabular text-xs text-faint">
              €{Number(visit.price_per_head).toFixed(0)} pp
            </span>
          )}
          {!visit.is_public && (
            <span className="rounded-full border px-2 py-0.5 text-[10px] text-faint">
              🔒 Private
            </span>
          )}
        </div>

        {visit.note && (
          <blockquote className="display mt-3 border-l-2 pl-3 text-[17px] leading-snug text-dim italic">
            {visit.note}
          </blockquote>
        )}

        <p className="mt-3 text-xs text-faint">{timeAgo(visit.created_at)}</p>
      </div>
    </article>
  );
}
