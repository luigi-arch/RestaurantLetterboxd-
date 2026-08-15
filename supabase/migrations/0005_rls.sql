-- Row-level security.
--
-- The governing idea: "private" means your NAME is not attached, not that your
-- data disappears. Private visit rows are unreadable by anyone but their author,
-- while rl_refresh_restaurant_stats() (SECURITY DEFINER) still counts them toward
-- the public aggregates. Both halves are asserted in the RLS tests.

alter table rl_profiles           enable row level security;
alter table rl_localities         enable row level security;
alter table rl_restaurants        enable row level security;
alter table rl_restaurant_images  enable row level security;
alter table rl_restaurant_stats   enable row level security;
alter table rl_visits             enable row level security;
alter table rl_visit_photos       enable row level security;
alter table rl_lists              enable row level security;
alter table rl_list_items         enable row level security;
alter table rl_follows            enable row level security;

-- ---------------------------------------------------------------------------
-- Public catalogue — readable by everyone, including logged-out visitors.
-- Public list pages are the acquisition channel, so they must render with no
-- session at all.
-- ---------------------------------------------------------------------------

create policy localities_public_read on rl_localities
  for select using (true);

create policy restaurants_public_read on rl_restaurants
  for select using (true);

create policy restaurant_images_public_read on rl_restaurant_images
  for select using (true);

-- Aggregates are public even though the visits behind them may not be.
create policy restaurant_stats_public_read on rl_restaurant_stats
  for select using (true);

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create policy profiles_public_read on rl_profiles
  for select using (true);

create policy profiles_insert_own on rl_profiles
  for insert with check (auth.uid() = id);

create policy profiles_update_own on rl_profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Visits
-- ---------------------------------------------------------------------------

create policy visits_read_public_or_own on rl_visits
  for select using (is_public or auth.uid() = user_id);

create policy visits_insert_own on rl_visits
  for insert with check (auth.uid() = user_id);

create policy visits_update_own on rl_visits
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy visits_delete_own on rl_visits
  for delete using (auth.uid() = user_id);

-- Photos inherit their visit's visibility.
create policy visit_photos_read on rl_visit_photos
  for select using (
    exists (
      select 1 from rl_visits v
      where v.id = rl_visit_photos.visit_id
        and (v.is_public or v.user_id = auth.uid())
    )
  );

create policy visit_photos_write_own on rl_visit_photos
  for all using (
    exists (
      select 1 from rl_visits v
      where v.id = rl_visit_photos.visit_id and v.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from rl_visits v
      where v.id = rl_visit_photos.visit_id and v.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Lists
-- ---------------------------------------------------------------------------

create policy lists_read_public_or_own on rl_lists
  for select using (is_public or auth.uid() = user_id);

create policy lists_write_own on rl_lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy list_items_read on rl_list_items
  for select using (
    exists (
      select 1 from rl_lists l
      where l.id = rl_list_items.list_id
        and (l.is_public or l.user_id = auth.uid())
    )
  );

create policy list_items_write_own on rl_list_items
  for all using (
    exists (
      select 1 from rl_lists l
      where l.id = rl_list_items.list_id and l.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from rl_lists l
      where l.id = rl_list_items.list_id and l.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Follows — public, the way Letterboxd's are.
-- ---------------------------------------------------------------------------

create policy follows_public_read on rl_follows
  for select using (true);

create policy follows_insert_own on rl_follows
  for insert with check (auth.uid() = follower_id);

create policy follows_delete_own on rl_follows
  for delete using (auth.uid() = follower_id);

-- ---------------------------------------------------------------------------
-- Writes to the catalogue are service-role only for now. Restaurant edits by
-- users arrive with the claim flow (Tier 4 imagery) and get their own policies.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Profile creation
-- ---------------------------------------------------------------------------
--
-- Deliberately NOT a trigger on auth.users.
--
-- This app currently shares a Supabase project with an unrelated production
-- system. A trigger on auth.users fires for THAT application's signups too, and
-- any exception it raises aborts the INSERT — so a bug here would break signup
-- for a live business system. The blast radius is unacceptable for a shared
-- project.
--
-- Instead the profile is created on demand by rl_ensure_profile(), called from
-- the app the first time an authenticated user needs one. It touches only this
-- app's tables and cannot affect anyone else's auth flow.
--
-- If this app ever moves to its own project, a trigger becomes safe again — but
-- lazy creation works fine there too, so there is little reason to switch.

create or replace function rl_ensure_profile(preferred_name text default null)
returns rl_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_email text;
  base_username text;
  candidate text;
  suffix integer := 0;
  result rl_profiles;
begin
  if caller is null then
    raise exception 'rl_ensure_profile requires an authenticated caller';
  end if;

  select * into result from rl_profiles where id = caller;
  if found then
    return result;
  end if;

  select email into caller_email from auth.users where id = caller;

  -- Derive a legal username from the email local part, then de-collide.
  base_username := regexp_replace(
    lower(split_part(coalesce(caller_email, 'diner'), '@', 1)), '[^a-z0-9_]', '', 'g'
  );
  if length(base_username) < 3 then
    base_username := 'diner';
  end if;
  base_username := left(base_username, 20);
  candidate := base_username;

  while exists (select 1 from rl_profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := left(base_username, 20) || suffix::text;
  end loop;

  insert into rl_profiles (id, username, display_name)
  values (caller, candidate, nullif(trim(coalesce(preferred_name, '')), ''))
  returning * into result;

  return result;
end;
$$;

comment on function rl_ensure_profile(text) is
  'Creates the calling user''s profile if absent and returns it. Replaces an auth.users trigger, which would be unsafe in a shared Supabase project.';

grant execute on function rl_ensure_profile(text) to authenticated;
