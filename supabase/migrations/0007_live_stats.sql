-- Keep aggregates live as visits are logged.
--
-- rl_refresh_restaurant_stats() recomputes the whole catalogue and is meant for
-- a scheduled job. That is far too blunt to run on every insert, and waiting for
-- a cron means you log a meal and the rating does not move — which reads as the
-- product being broken.
--
-- So: a single-restaurant recompute, fired by a trigger on rl_visits.
--
-- This trigger is on THIS APP'S OWN TABLE, unlike the auth.users trigger that
-- 0005 deliberately avoids. A failure here can only ever break this app.

create or replace function rl_refresh_stats_for(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_prior_mean numeric;
begin
  -- Same prior as the full refresh: the market's own mean.
  select coalesce(avg(rating), 3.5) into v_prior_mean
  from rl_visits where rating is not null;

  with weighted as (
    select
      v.user_id, v.rating, v.would_return, v.visited_on,
      power(
        0.5,
        greatest(current_date - v.visited_on, 0)::numeric
          / rl_scoring_days_per_month()
          / rl_scoring_half_life_months()
      ) as w
    from rl_visits v
    where v.restaurant_id = target
  ),
  per_diner as (
    select
      user_id,
      max(w) as diner_weight,
      sum(rating * w) filter (where rating is not null)
        / nullif(sum(w) filter (where rating is not null), 0) as diner_rating,
      count(*) as diner_visits,
      (array_agg(would_return order by visited_on desc, w desc))[1]
        as latest_would_return
    from weighted
    group by user_id
  ),
  agg as (
    select
      count(*) as distinct_diners,
      count(*) filter (where diner_visits >= 2)::numeric
        / nullif(count(*), 0) as return_rate,
      count(*) filter (where latest_would_return)::numeric
        / nullif(count(*), 0) as would_return_pct,
      sum(diner_rating * diner_weight) filter (where diner_rating is not null)
        as weighted_sum,
      sum(diner_weight) filter (where diner_rating is not null) as weight_total
    from per_diner
  ),
  raw as (
    select avg(rating) as plain_avg, count(*) as total_visits
    from rl_visits where restaurant_id = target
  )
  insert into rl_restaurant_stats (
    restaurant_id, recent_rating, avg_rating, return_rate,
    would_return_pct, visit_count, distinct_diners, computed_at
  )
  select
    target,
    case
      when a.weight_total is null or a.weight_total = 0 then null
      else round(
        ((a.weighted_sum + v_prior_mean * rl_scoring_prior_weight())
          / (a.weight_total + rl_scoring_prior_weight())) * 2
      ) / 2
    end,
    round(r.plain_avg * 2) / 2,
    coalesce(a.return_rate, 0),
    a.would_return_pct,
    coalesce(r.total_visits, 0),
    coalesce(a.distinct_diners, 0),
    now()
  from agg a cross join raw r
  on conflict (restaurant_id) do update set
    recent_rating    = excluded.recent_rating,
    avg_rating       = excluded.avg_rating,
    return_rate      = excluded.return_rate,
    would_return_pct = excluded.would_return_pct,
    visit_count      = excluded.visit_count,
    distinct_diners  = excluded.distinct_diners,
    computed_at      = excluded.computed_at;

  -- A restaurant whose last visit was deleted should have no stats row at all,
  -- rather than a row of zeroes that renders as "rated 0".
  delete from rl_restaurant_stats
  where restaurant_id = target
    and not exists (select 1 from rl_visits where restaurant_id = target);
end;
$fn$;

create or replace function rl_visits_refresh_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'DELETE' then
    perform rl_refresh_stats_for(old.restaurant_id);
    return old;
  end if;

  perform rl_refresh_stats_for(new.restaurant_id);

  -- A visit moved between restaurants: the old one needs recomputing too.
  if tg_op = 'UPDATE' and old.restaurant_id <> new.restaurant_id then
    perform rl_refresh_stats_for(old.restaurant_id);
  end if;

  return new;
end;
$fn$;

create trigger visits_refresh_stats
  after insert or update or delete on rl_visits
  for each row execute function rl_visits_refresh_stats();
