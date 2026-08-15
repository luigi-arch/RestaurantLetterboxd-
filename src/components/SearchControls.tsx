"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export function SearchControls({
  localities,
  defaultQuery,
  defaultLocality,
  defaultSort,
}: {
  localities: { id: string; name: string }[];
  defaultQuery: string;
  defaultLocality: string;
  defaultSort: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState(defaultQuery);

  function apply(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => router.push(`/browse?${params.toString()}`));
  }

  // Debounce typing so a search does not fire a request per keystroke.
  useEffect(() => {
    if (query === defaultQuery) return;
    const timer = setTimeout(() => apply({ q: query }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-wrap gap-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search restaurants…"
        className="min-w-48 flex-1 rounded-md border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />

      <select
        value={defaultLocality}
        onChange={(e) => apply({ locality: e.target.value })}
        className="rounded-md border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      >
        <option value="">Everywhere</option>
        {localities.map((locality) => (
          <option key={locality.id} value={locality.id}>
            {locality.name}
          </option>
        ))}
      </select>

      <select
        value={defaultSort}
        onChange={(e) => apply({ sort: e.target.value })}
        className="rounded-md border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      >
        <option value="rating">Highest rated</option>
        <option value="return">Most returned to</option>
        <option value="name">A–Z</option>
      </select>
    </div>
  );
}
