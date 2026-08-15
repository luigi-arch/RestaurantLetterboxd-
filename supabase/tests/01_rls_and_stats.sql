-- The critical correctness test for this schema.
--
-- A bug here is simultaneously a privacy breach and a data-quality disaster, so
-- both directions are asserted explicitly:
--   * another diner must NOT be able to read a private visit;
--   * that private visit MUST still count toward the public aggregate.
--
-- Run with:  psql -v ON_ERROR_STOP=1 -d rlb -f supabase/tests/01_rls_and_stats.sql

\set ON_ERROR_STOP on
set client_min_messages = warning;

begin;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com');
-- Profiles are created by the on_auth_user_created trigger.

insert into localities (id, region, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'malta', 'Valletta');

insert into restaurants (id, slug, name, locality_id, status, is_curated) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'test-kitchen', 'Test Kitchen',
   'aaaaaaaa-0000-0000-0000-000000000001', 'open', true);

-- Alice: one public visit (4.0) and one private visit (2.0). The private one is
-- the candid rating — exactly the kind that must survive into the aggregate.
insert into visits (user_id, restaurant_id, visited_on, rating, would_return, is_public) values
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000001',
   current_date, 4.0, true, true),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001',
   current_date, 2.0, false, false);

-- ---------------------------------------------------------------------------
-- 1. Visibility
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

do $$
declare n integer;
begin
  select count(*) into n from visits;
  if n <> 1 then
    raise exception 'RLS LEAK: Alice sees % visits, expected 1 (her own public one)', n;
  end if;

  select count(*) into n from visits where rating = 2.0;
  if n <> 0 then
    raise exception 'RLS LEAK: Alice can read Bob''s private visit';
  end if;
end
$$;

-- Bob sees his own private visit plus Alice's public one.
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';

do $$
declare n integer;
begin
  select count(*) into n from visits;
  if n <> 2 then
    raise exception 'OWNERSHIP BROKEN: Bob sees % visits, expected 2', n;
  end if;
end
$$;

-- A logged-out visitor sees only public visits. Public list and restaurant pages
-- render with no session at all, so this is the acquisition path.
set local role anon;
set local "request.jwt.claim.sub" = '';

do $$
declare n integer;
begin
  select count(*) into n from visits;
  if n <> 1 then
    raise exception 'RLS LEAK: anonymous visitor sees % visits, expected 1', n;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Private visits must still reach the aggregate
-- ---------------------------------------------------------------------------

reset role;
select refresh_restaurant_stats();

do $$
declare s record;
begin
  select * into s from restaurant_stats
  where restaurant_id = 'bbbbbbbb-0000-0000-0000-000000000001';

  if s.visit_count <> 2 then
    raise exception
      'DATA LOSS: aggregate counted % visits, expected 2 — the private visit was dropped',
      s.visit_count;
  end if;

  if s.distinct_diners <> 2 then
    raise exception 'DATA LOSS: expected 2 distinct diners, got %', s.distinct_diners;
  end if;

  -- Both rated today, so decay is 1 for each: raw mean 3.0, pulled toward the
  -- market prior (itself 3.0 here). Must sit between the two ratings.
  if s.recent_rating is null or s.recent_rating <= 2.0 or s.recent_rating >= 4.0 then
    raise exception
      'SCORING WRONG: recent_rating % should sit between the 2.0 and 4.0 ratings',
      s.recent_rating;
  end if;

  -- Alice said yes, Bob said no → half.
  if s.would_return_pct <> 0.5 then
    raise exception 'SCORING WRONG: would_return_pct % expected 0.500', s.would_return_pct;
  end if;

  -- Neither diner returned.
  if s.return_rate <> 0 then
    raise exception 'SCORING WRONG: return_rate % expected 0', s.return_rate;
  end if;
end
$$;

-- Aggregates are public even though a visit behind them is not.
set local role anon;
do $$
declare n integer;
begin
  select visit_count into n from restaurant_stats
  where restaurant_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if n <> 2 then
    raise exception 'anon should read aggregates including private visits, got %', n;
  end if;
end
$$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Return rate reacts to a second visit
-- ---------------------------------------------------------------------------

insert into visits (user_id, restaurant_id, visited_on, rating, would_return, is_public)
values ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000001',
        current_date - 30, 4.5, true, true);

select refresh_restaurant_stats();

do $$
declare s record;
begin
  select * into s from restaurant_stats
  where restaurant_id = 'bbbbbbbb-0000-0000-0000-000000000001';

  -- One of two diners has now returned.
  if s.return_rate <> 0.5 then
    raise exception 'SCORING WRONG: return_rate % expected 0.500', s.return_rate;
  end if;
  if s.visit_count <> 3 then
    raise exception 'expected 3 visits, got %', s.visit_count;
  end if;
  -- Still two diners: repeat visits must not inflate the diner count.
  if s.distinct_diners <> 2 then
    raise exception 'expected 2 distinct diners, got %', s.distinct_diners;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Constraints that protect the product rules
-- ---------------------------------------------------------------------------

do $$
begin
  -- would_return is the one field nobody may skip.
  begin
    insert into visits (user_id, restaurant_id, visited_on, rating, would_return)
    values ('11111111-1111-1111-1111-111111111111',
            'bbbbbbbb-0000-0000-0000-000000000001', current_date, 4.0, null);
    raise exception 'CONSTRAINT MISSING: would_return accepted null';
  exception when not_null_violation then null;
  end;

  -- Quarter stars are not a thing.
  begin
    insert into visits (user_id, restaurant_id, visited_on, rating, would_return)
    values ('11111111-1111-1111-1111-111111111111',
            'bbbbbbbb-0000-0000-0000-000000000001', current_date, 4.25, true);
    raise exception 'CONSTRAINT MISSING: quarter-star rating accepted';
  exception when check_violation then null;
  end;

  -- A meal cannot have happened next year.
  begin
    insert into visits (user_id, restaurant_id, visited_on, rating, would_return)
    values ('11111111-1111-1111-1111-111111111111',
            'bbbbbbbb-0000-0000-0000-000000000001', current_date + 400, 5.0, true);
    raise exception 'CONSTRAINT MISSING: future-dated visit accepted';
  exception when check_violation then null;
  end;

  -- Google Places photos may never be written to storage: no caching exception
  -- exists in the Maps Platform terms, so this is enforced in the database
  -- rather than left to code review.
  begin
    insert into restaurant_images (restaurant_id, source, storage_path)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'google_places', 'images/leak.jpg');
    raise exception 'CONSTRAINT MISSING: a Google Places photo was stored';
  exception when check_violation then null;
  end;

  -- Sources we may keep must actually carry a stored path.
  begin
    insert into restaurant_images (restaurant_id, source, storage_path)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'site_og', null);
    raise exception 'CONSTRAINT MISSING: storable image accepted without a path';
  exception when check_violation then null;
  end;

  -- Nobody follows themselves.
  begin
    insert into follows (follower_id, followee_id)
    values ('11111111-1111-1111-1111-111111111111',
            '11111111-1111-1111-1111-111111111111');
    raise exception 'CONSTRAINT MISSING: self-follow accepted';
  exception when check_violation then null;
  end;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Maltese search normalisation
-- ---------------------------------------------------------------------------

do $$
begin
  if mt_normalize('Għajnsielem') <> 'ghajnsielem' then
    raise exception 'mt_normalize failed on Għajnsielem: %', mt_normalize('Għajnsielem');
  end if;
  if mt_normalize('Ħamrun') <> 'hamrun' then
    raise exception 'mt_normalize failed on Ħamrun: %', mt_normalize('Ħamrun');
  end if;
  if mt_normalize('Ta'' Ċenċ') <> 'ta'' cenc' then
    raise exception 'mt_normalize failed on Ta'' Ċenċ: %', mt_normalize('Ta'' Ċenċ');
  end if;
  if mt_normalize('Żebbuġ') <> 'zebbug' then
    raise exception 'mt_normalize failed on Żebbuġ: %', mt_normalize('Żebbuġ');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Auto-created profiles
-- ---------------------------------------------------------------------------

do $$
declare u text;
begin
  select username into u from profiles
  where id = '11111111-1111-1111-1111-111111111111';
  if u <> 'alice' then
    raise exception 'expected username alice, got %', u;
  end if;
end
$$;

-- Colliding email local parts must not break signup.
insert into auth.users (id, email)
values ('33333333-3333-3333-3333-333333333333', 'alice@other.com');

do $$
declare u text;
begin
  select username into u from profiles
  where id = '33333333-3333-3333-3333-333333333333';
  if u <> 'alice1' then
    raise exception 'expected de-colliding username alice1, got %', u;
  end if;
end
$$;

rollback;

\echo '  ALL SCHEMA TESTS PASSED'
