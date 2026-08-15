-- Aggregate restaurant statistics.
--
-- This mirrors src/lib/scoring.ts, which is the reference implementation and
-- carries the unit tests. Any change to the maths must land in both, and
-- scripts/check-scoring-parity.ts asserts the two agree on shared fixtures.
--
-- Why a table refreshed by a SECURITY DEFINER function rather than a view:
-- private visits MUST feed these aggregates. "Private" means your name is not
-- attached, not that your data vanishes — otherwise the honest ratings, which
-- are precisely the ones people mark private, would be thrown away. A definer
-- function reads every visit while RLS keeps the underlying rows unreadable.

create table restaurant_stats (
  restaurant_id     uuid primary key references restaurants (id) on delete cascade,
  -- Recency-weighted, per-diner-normalised, shrunk toward the market mean.
  -- The headline number on a restaurant page.
  recent_rating     numeric(2, 1),
  -- Plain arithmetic mean of every rating ever. Shown quietly beside the above.
  avg_rating        numeric(2, 1),
  -- Share of diners who came back at least once. The metric nobody else
  -- publishes and the hardest to buy.
  return_rate       numeric(4, 3) not null default 0,
  -- Share of diners whose most recent visit said they would return.
  would_return_pct  numeric(4, 3),
  visit_count       integer not null default 0,
  distinct_diners   integer not null default 0,
  computed_at       timestamptz not null default now()
);

create index restaurant_stats_recent_rating_idx
  on restaurant_stats (recent_rating desc nulls last);
create index restaurant_stats_return_rate_idx
  on restaurant_stats (return_rate desc);

-- Tunables, kept in one place so the SQL and TS constants can be compared.
create or replace function scoring_half_life_months() returns numeric
  language sql immutable as $$ select 15::numeric $$;
create or replace function scoring_prior_weight() returns numeric
  language sql immutable as $$ select 5::numeric $$;
create or replace function scoring_days_per_month() returns numeric
  language sql immutable as $$ select 30.436875::numeric $$;

create or replace function refresh_restaurant_stats()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prior_mean numeric;
  v_rows integer;
begin
  -- The prior is the market's own mean rating, so shrinkage pulls toward what
  -- Malta actually thinks rather than an arbitrary constant. Falls back to 3.5
  -- before any ratings exist.
  select coalesce(avg(rating), 3.5) into v_prior_mean
  from visits where rating is not null;

  with weighted as (
    select
      v.restaurant_id,
      v.user_id,
      v.rating,
      v.would_return,
      v.visited_on,
      -- Exponential decay, halving every half-life. Future dates clamp to 1 so
      -- a mistyped year cannot outweigh the present.
      power(
        0.5,
        greatest(current_date - v.visited_on, 0)::numeric
          / scoring_days_per_month()
          / scoring_half_life_months()
      ) as w
    from visits v
  ),
  -- One row per diner per restaurant: every diner counts once however often
  -- they log, so a single enthusiast cannot move the score.
  per_diner as (
    select
      restaurant_id,
      user_id,
      -- How much this diner's opinion counts: driven by their most recent meal.
      max(w) as diner_weight,
      sum(rating * w) filter (where rating is not null)
        / nullif(sum(w) filter (where rating is not null), 0) as diner_rating,
      count(*) as diner_visits,
      -- Their latest answer is the honest one: loved it twice then let down
      -- counts as a no.
      (array_agg(would_return order by visited_on desc, w desc))[1]
        as latest_would_return
    from weighted
    group by restaurant_id, user_id
  ),
  raw as (
    select restaurant_id,
           avg(rating) as plain_avg,
           count(*) as total_visits
    from visits
    group by restaurant_id
  ),
  agg as (
    select
      d.restaurant_id,
      count(*) as distinct_diners,
      count(*) filter (where d.diner_visits >= 2)::numeric
        / nullif(count(*), 0) as return_rate,
      count(*) filter (where d.latest_would_return)::numeric
        / nullif(count(*), 0) as would_return_pct,
      sum(d.diner_rating * d.diner_weight) filter (where d.diner_rating is not null)
        as weighted_sum,
      sum(d.diner_weight) filter (where d.diner_rating is not null)
        as weight_total
    from per_diner d
    group by d.restaurant_id
  )
  insert into restaurant_stats as rs (
    restaurant_id, recent_rating, avg_rating, return_rate,
    would_return_pct, visit_count, distinct_diners, computed_at
  )
  select
    a.restaurant_id,
    case
      when a.weight_total is null or a.weight_total = 0 then null
      else round(
        ((a.weighted_sum + v_prior_mean * scoring_prior_weight())
          / (a.weight_total + scoring_prior_weight())) * 2
      ) / 2
    end,
    round(r.plain_avg * 2) / 2,
    coalesce(a.return_rate, 0),
    a.would_return_pct,
    coalesce(r.total_visits, 0),
    a.distinct_diners,
    now()
  from agg a
  join raw r on r.restaurant_id = a.restaurant_id
  on conflict (restaurant_id) do update set
    recent_rating    = excluded.recent_rating,
    avg_rating       = excluded.avg_rating,
    return_rate      = excluded.return_rate,
    would_return_pct = excluded.would_return_pct,
    visit_count      = excluded.visit_count,
    distinct_diners  = excluded.distinct_diners,
    computed_at      = excluded.computed_at;

  get diagnostics v_rows = row_count;

  -- Drop stats for restaurants whose last visit was deleted.
  delete from restaurant_stats s
  where not exists (select 1 from visits v where v.restaurant_id = s.restaurant_id);

  return v_rows;
end;
$$;

comment on function refresh_restaurant_stats() is
  'Recomputes restaurant_stats from every visit, including private ones. SECURITY DEFINER by design: private visits must feed aggregates without their rows being readable.';

-- Only the service role runs the refresh; end users read the resulting table.
revoke execute on function refresh_restaurant_stats() from public, anon, authenticated;
