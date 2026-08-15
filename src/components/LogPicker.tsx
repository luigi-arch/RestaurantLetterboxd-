"use client";

import { useEffect, useRef, useState } from "react";
import { GeneratedCard } from "@/components/GeneratedCard";
import { LogSheet } from "@/components/LogSheet";
import { createClient } from "@/lib/supabase/client";
import { normalize } from "@/lib/text";

type Hit = {
  id: string;
  slug: string;
  name: string;
  cuisines: string[] | null;
  locality: { name: string } | { name: string }[] | null;
};

type Picked = { id: string; name: string; locality: string | null };

/**
 * Restaurant search feeding straight into the log sheet.
 *
 * With no query it shows the curated set, so the screen is useful before a
 * single keystroke — most people are logging somewhere well known.
 */
export function LogPicker() {
  const [query, setQuery] = useState("");
  // Results carry their own term, so staleness is derived instead of being
  // tracked by a second state that an effect has to synchronise.
  const [results, setResults] = useState<{ term: string; hits: Hit[] } | null>(
    null,
  );
  const [picked, setPicked] = useState<Picked | null>(null);
  const latest = useRef(0);

  const term = query.trim();
  const loading = results?.term !== term;
  const hits = results?.term === term ? results.hits : [];

  useEffect(() => {
    const ticket = ++latest.current;

    const timer = setTimeout(
      async () => {
        let request = createClient()
          .from("rl_restaurants")
          .select("id, slug, name, cuisines, locality:rl_localities ( name )")
          .order("name")
          .limit(term.length >= 2 ? 12 : 20);

        if (term.length >= 2) {
          request = request.or(
            `name.ilike.%${term}%,name.ilike.%${normalize(term)}%`,
          );
        } else {
          request = request.eq("is_curated", true);
        }

        const { data } = await request;
        if (ticket !== latest.current) return;
        setResults({ term, hits: (data as unknown as Hit[]) ?? [] });
      },
      term ? 220 : 0,
    );

    return () => clearTimeout(timer);
  }, [term]);

  return (
    <>
      <input
        type="search"
        value={query}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search restaurants"
        className="display w-full rounded-2xl border bg-surface px-5 py-4 text-xl outline-none placeholder:text-faint focus:border-accent"
      />

      <ul className="mt-4 divide-y overflow-hidden rounded-2xl border bg-surface">
        {loading &&
          hits.length === 0 &&
          [0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-3 p-3">
              <div className="skeleton h-11 w-11 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-1/2 rounded" />
                <div className="skeleton h-3 w-1/4 rounded" />
              </div>
            </li>
          ))}

        {!loading && hits.length === 0 && (
          <li className="p-5 text-sm text-dim">
            Nothing matching that. Maltese names work without their accents — try
            “zebbug” or “hamrun”.
          </li>
        )}

        {hits.map((hit) => {
          const locality = Array.isArray(hit.locality)
            ? hit.locality[0]
            : hit.locality;

          return (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() =>
                  setPicked({
                    id: hit.id,
                    name: hit.name,
                    locality: locality?.name ?? null,
                  })
                }
                className="press flex w-full items-center gap-3 p-3 text-left hover:bg-surface-2"
              >
                <GeneratedCard
                  name={hit.name}
                  cuisines={hit.cuisines ?? []}
                  showInitial={false}
                  className="h-11 w-11 shrink-0 rounded-lg"
                />
                <span className="min-w-0 flex-1">
                  <span className="display block truncate text-lg leading-tight">
                    {hit.name}
                  </span>
                  <span className="block text-xs text-faint">
                    {locality?.name ?? "Malta"}
                  </span>
                </span>
                <span className="shrink-0 text-faint" aria-hidden="true">
                  +
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {picked && (
        <LogSheet
          restaurantId={picked.id}
          restaurantName={picked.name}
          localityName={picked.locality}
          onClose={() => setPicked(null)}
        />
      )}
    </>
  );
}
