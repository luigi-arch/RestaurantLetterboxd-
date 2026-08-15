-- Continues 0009. Split into its own file because a new enum value cannot be
-- referenced in the same transaction that created it.

-- ---------------------------------------------------------------------------
-- Demo images are remote, so they are exempt from needing a stored file
-- ---------------------------------------------------------------------------
alter table rl_restaurant_images
  drop constraint if exists storable_sources_have_a_path;

alter table rl_restaurant_images
  add constraint storable_sources_have_a_path
  check (source in ('google_places', 'demo') or storage_path is not null);

-- ...but they must actually be remote. Without this, 'demo' would become a hole
-- in the provenance rules that anything could be filed under.
alter table rl_restaurant_images
  drop constraint if exists demo_images_are_remote;

alter table rl_restaurant_images
  add constraint demo_images_are_remote
  check (source <> 'demo' or (storage_path is null and source_url is not null));

-- The Google Places rule is deliberately untouched: those photos have no
-- caching exception in the Maps Platform terms and may never be stored at all.

-- ---------------------------------------------------------------------------
-- Weaken the Bayesian prior: 5 → 3
-- ---------------------------------------------------------------------------
--
-- Seeding ~500 visits exposed this. With a prior weight of 5 the entire
-- catalogue collapsed into 3.5–4.0 — half a star between the best restaurant in
-- Malta and the worst — because most restaurants sit at three to eight diners
-- and the prior dominates until far more people have logged.
--
-- That is not a seeding artefact. It is exactly the state Malta will be in for
-- months after launch, and it would have shipped a leaderboard where nothing
-- was distinguishable from anything else.
--
-- Kept in step with PRIOR_WEIGHT in src/lib/scoring.ts, which is the reference
-- implementation and carries the tests.
create or replace function rl_scoring_prior_weight() returns numeric
  language sql immutable as $fn$ select 3::numeric $fn$;
