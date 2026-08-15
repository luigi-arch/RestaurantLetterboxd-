"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalize } from "@/lib/text";

type Hit = {
  id: string;
  slug: string;
  name: string;
  cuisines: string[] | null;
  locality: { name: string } | { name: string }[] | null;
};

/**
 * Search as you type, results inline.
 *
 * Queries both the raw text and its diacritic-folded form, so "hamrun" finds
 * Ħamrun and "ghajnsielem" finds Għajnsielem — nobody types ħ on a phone.
 */
export function DiscoverSearch() {
  const [query, setQuery] = useState("");
  // Results carry the term they belong to, so "is this stale?" is derived
  // rather than tracked in a second state that an effect has to keep in step.
  const [results, setResults] = useState<{ term: string; hits: Hit[] }>({
    term: "",
    hits: [],
  });
  const latest = useRef(0);

  const term = query.trim();
  const showPanel = term.length >= 2;
  const searching = showPanel && results.term !== term;
  const hits = results.term === term ? results.hits : [];

  useEffect(() => {
    if (term.length < 2) return;
    const ticket = ++latest.current;

    const timer = setTimeout(async () => {
      const { data } = await createClient()
        .from("rl_restaurants")
        .select("id, slug, name, cuisines, locality:rl_localities ( name )")
        .or(`name.ilike.%${term}%,name.ilike.%${normalize(term)}%`)
        .limit(8);

      // Ignore responses that arrive after a newer keystroke.
      if (ticket !== latest.current) return;
      setResults({ term, hits: (data as unknown as Hit[]) ?? [] });
    }, 220);

    return () => clearTimeout(timer);
  }, [term]);

  return (
    <div>
      <label className="block">
        <span className="sr-only">Search restaurants</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search restaurants"
          className="display w-full rounded-2xl border bg-surface px-5 py-4 text-xl outline-none placeholder:text-faint focus:border-accent"
        />
      </label>

      {showPanel && (
        <div className="fade-in mt-3 overflow-hidden rounded-2xl border bg-surface">
          {searching && hits.length === 0 && (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-5 w-2/3 rounded" />
              ))}
            </div>
          )}

          {!searching && hits.length === 0 && (
            <p className="p-4 text-sm text-dim">
              Nothing matching that. Maltese names work without their accents —
              try “zebbug” or “hamrun”.
            </p>
          )}

          <ul className="divide-y">
            {hits.map((hit) => {
              const locality = Array.isArray(hit.locality)
                ? hit.locality[0]
                : hit.locality;
              return (
                <li key={hit.id}>
                  <Link
                    href={`/r/${hit.slug}`}
                    className="press flex items-baseline gap-3 px-4 py-3 hover:bg-surface-2"
                  >
                    <span className="display text-lg">{hit.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-faint">
                      {locality?.name}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
