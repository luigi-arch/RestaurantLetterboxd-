import Link from "next/link";
import { ActivityCard, type Activity } from "@/components/ActivityCard";
import { BRAND } from "@/config/brand";
import { countVisitsThisWeek, getRecentVisits } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const supabase = await createClient();

  const [visits, thisWeek, { data: auth }] = await Promise.all([
    getRecentVisits(supabase, 40),
    countVisitsThisWeek(supabase),
    supabase.auth.getUser(),
  ]);

  const activities: Activity[] = visits.map((visit) => ({
    kind: "visit",
    visit,
  }));

  return (
    <div>
      <header className="mb-2 flex items-baseline justify-between">
        <h1 className="label">Recently</h1>
        {thisWeek > 0 && (
          <span className="text-[11px] text-faint">
            🔥 {thisWeek} logged this week
          </span>
        )}
      </header>

      {activities.length === 0 ? (
        <EmptyFeed signedIn={Boolean(auth.user)} />
      ) : (
        <div className="divide-y">
          {activities.map((activity, index) => (
            <div
              key={activity.kind === "visit" ? activity.visit.id : index}
              className="rise"
              // Staggered so the feed assembles rather than appearing at once.
              style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
            >
              <ActivityCard activity={activity} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyFeed({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="rise py-10">
      <h2 className="display max-w-md text-3xl leading-tight">
        Nobody has logged a meal yet.
      </h2>
      <p className="mt-4 max-w-md text-dim">
        {BRAND.name} has nothing in it but the restaurants — every rating here
        comes from someone actually going. Start with a place you ate at recently;
        the diary is worth more the moment it has some history behind it.
      </p>

      <Link
        href={signedIn ? "/log" : "/login"}
        className="press mt-6 inline-block rounded-full bg-accent px-5 py-2.5 font-medium text-bg"
      >
        {signedIn ? "Log your first visit" : "Start your diary"}
      </Link>

      <dl className="mt-12 grid grid-cols-3 gap-4 border-t pt-6">
        {[
          ["3,000+", "Restaurants in Malta"],
          ["588,254", "People"],
          ["1–2×", "Meals out per week"],
        ].map(([stat, label]) => (
          <div key={label}>
            <dt className="display text-2xl tabular">{stat}</dt>
            <dd className="label mt-1 leading-tight">{label}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
