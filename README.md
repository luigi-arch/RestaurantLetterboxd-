# Malta restaurant diary

Letterboxd for restaurants, built for Malta first.

A diary of every meal you eat out, a feed of the people whose taste you trust,
shareable lists, and a map of the islands that fills in as you eat.

## Why Malta

Malta has roughly 3,000–3,500 restaurants for 588,254 residents, one of the
densest markets in Europe. The most trusted local source is *The Definitive(ly)
Good Guide*, an annual **printed book** whose 2025 survey drew 3,703 voluntary
participants covering 288,834 dining experiences.

That number is the thesis: ~3,700 people already rate restaurants seriously,
once a year, into a book. This is that survey running continuously, with a
social graph on top.

Three things make Malta a good beachhead rather than merely a small market:

- **Completionism is attainable.** Around 400–600 venues actually matter, so a
  committed eater can cover 10–20% of them. Nobody covers 1% of Letterboxd's
  film catalogue, and coverage is meaningless in London. A map that fills in as
  you eat is a *finishable game* — and only at this scale.
- **The social graph is pre-trusted.** At 588k people you follow people you
  actually know.
- **The backlog solves cold start.** Every adult here carries 30–80 restaurants
  in their head; onboarding harvests that in five minutes.

## Design decisions worth knowing

**Ratings are five stars in half increments, plus a mandatory would-you-return
flag.** The stars are legible and familiar; the return flag is the honest signal.
It cannot be gamed at scale and it does not decay into politeness on an island
where you might know the owner. It is `NOT NULL` in the schema — the one field
nobody may skip.

**Restaurants rot; films do not.** *Casablanca* is the same film forever, but a
restaurant changes chef and dies. So the headline number is not a plain average:

- a visit's influence halves every 15 months;
- every diner counts once however often they log, so one enthusiast cannot
  outvote the room;
- scores shrink toward the market mean, so a lone five-star does not outrank
  fifty four-and-a-halfs.

The reference implementation is [`src/lib/scoring.ts`](src/lib/scoring.ts),
mirrored in SQL by `refresh_restaurant_stats()`.

**Private visits still count.** Logs are public by default with a per-entry
private toggle. "Private" means your name is not attached, not that your data
vanishes — otherwise the candid ratings, which are exactly the ones people mark
private, would be thrown away. Aggregates are computed by a `SECURITY DEFINER`
function that reads every visit while RLS keeps the rows unreadable. Both
directions are asserted in `supabase/tests/01_rls_and_stats.sql`.

**Nothing hardcodes Malta.** Market specifics live in
[`src/config/market.ts`](src/config/market.ts) and localities carry a `region`
key, so a second market is a seed, not a migration.

## Deployment

Live at **https://mejda-git-main-luigi-archs-projects.vercel.app** — Vercel
project `mejda`, production branch `main`. Every push to `main` deploys; there
are no feature branches.

### The shared-database arrangement

This app currently shares a Supabase project with an unrelated production system
(a content pipeline with ~200k rows). That is a deliberate cost-saving choice
for a prototype, and it constrains the schema in two visible ways:

- **Every table, function and storage bucket carries an `rl_` prefix**, so
  nothing collides with the 56 tables already in `public`.
- **There is no trigger on `auth.users`.** A trigger there fires for the other
  application's signups too, and any exception it raises aborts the INSERT — so
  a bug here would break signup for a live business system. Profiles are created
  on demand by `rl_ensure_profile()` instead.

Both apps also share one `auth.users` pool, which is the part that does not
scale past "friends trying it out".

**Moving to a dedicated project** is a find-and-replace of `rl_` plus a re-run of
`supabase/migrations/`. Worth doing before this carries real users.

### Required manual step: auth redirect

Magic-link sign-in will not work until the deployed origin is allowed in
Supabase → **Authentication → URL Configuration → Redirect URLs**:

```
https://mejda-git-main-luigi-archs-projects.vercel.app/**
```

Without it Supabase ignores `emailRedirectTo` and bounces the user to the
project's Site URL — which belongs to the other application — so the link
appears to work and silently leaves you logged out.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase keys
```

Apply the migrations in order (`supabase/migrations/*.sql`) via the Supabase SQL
editor or the CLI, then seed:

```bash
npm run seed:localities              # Malta's 68 local councils, offline
npm run seed:restaurants -- --dry    # fetch from OSM, report, write nothing
npm run seed:restaurants             # write the catalogue
npm run seed:images -- --all --dry   # report achievable image coverage
```

Then run the app:

```bash
npm run dev
```

### Restaurant data

Seeded from OpenStreetMap via the Overpass API — free and clean under ODbL,
**which requires visible attribution**, hence the footer credit. Google Places
is not used for catalogue data because its terms forbid storing and redisplaying
it.

The raw Overpass response is cached to `data/osm-raw.json` so repeat runs do not
hammer a free community service. If your network blocks Overpass, run the script
somewhere it is reachable and commit that file.

OSM gives ~1,500–2,500 rows of mixed quality. The manual curation pass over the
~400 that matter — correcting names, localities and cuisines by hand, setting
`is_curated` — is the highest-leverage work in the project. A search box that
cannot find *Nenu the Artisan Baker* kills the first session.

### Images

Tiered, best source first, falling through until something lands:

| Tier | Source | Cost | Storable |
|---|---|---|---|
| 1 | Restaurant's own site (`og:image`, JSON-LD) | free | yes |
| 2 | Wikimedia Commons | free | yes |
| 3 | Google Places Photos | paid, per render | **no** |
| 4 | Restaurant claim + upload | free | yes |
| 5 | Diner photos | free | yes |
| 6 | Generated card | free | n/a |

Tier 1 does the work. `og:image` is metadata a site publishes specifically so
third parties can render link previews — caching it is the same act as any
link-preview cache, and it is free, permanent and unmetered.

Tier 3 is a bounded fallback, not a default. Google Places photos have **no
caching exception** in the Maps Platform terms: place IDs may be stored
indefinitely and coordinates for 30 days, but photos must be fetched per render.
Cost therefore scales with *traffic*, not catalogue size — invisible in
development, painful at launch. It is restricted to restaurant detail pages,
never feeds or lists, behind a proxy with a spend cap, and a check constraint in
`0003_images.sql` makes storing one impossible rather than merely discouraged.

Bulk-scraping Google Images or Instagram is not used. Beyond the terms, it does
not work: Instagram's Basic Display API reached end-of-life in December 2024,
Business Discovery is rate-capped per account per week, and the CDN URLs are
signed and expire — the feature would break within weeks of shipping.

Every image row records its source, licence and attribution, so a takedown is a
one-line delete rather than an audit.

## Tests

```bash
npm test          # scoring, text normalisation, image headers
npm run typecheck
```

The SQL suite needs a Postgres to run against:

```bash
createdb rlb
psql -v ON_ERROR_STOP=1 -d rlb -f supabase/tests/00_bootstrap_local.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d rlb -f "$f"; done
psql -v ON_ERROR_STOP=1 -d rlb -f supabase/tests/01_rls_and_stats.sql
```

`00_bootstrap_local.sql` is a minimal stand-in for the parts of Supabase the
migrations depend on (`auth.users`, `auth.uid()`, the anon/authenticated roles),
so the suite runs against a bare Postgres with no Docker.

## Attribution

Restaurant data © OpenStreetMap contributors, available under the
[Open Database Licence](https://www.openstreetmap.org/copyright).
