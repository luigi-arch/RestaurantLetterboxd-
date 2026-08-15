-- Row-level security.
--
-- The governing idea: "private" means your NAME is not attached, not that your
-- data disappears. Private visit rows are unreadable by anyone but their author,
-- while refresh_restaurant_stats() (SECURITY DEFINER) still counts them toward
-- the public aggregates. Both halves are asserted in the RLS tests.

alter table profiles           enable row level security;
alter table localities         enable row level security;
alter table restaurants        enable row level security;
alter table restaurant_images  enable row level security;
alter table restaurant_stats   enable row level security;
alter table visits             enable row level security;
alter table visit_photos       enable row level security;
alter table lists              enable row level security;
alter table list_items         enable row level security;
alter table follows            enable row level security;

-- ---------------------------------------------------------------------------
-- Public catalogue — readable by everyone, including logged-out visitors.
-- Public list pages are the acquisition channel, so they must render with no
-- session at all.
-- ---------------------------------------------------------------------------

create policy localities_public_read on localities
  for select using (true);

create policy restaurants_public_read on restaurants
  for select using (true);

create policy restaurant_images_public_read on restaurant_images
  for select using (true);

-- Aggregates are public even though the visits behind them may not be.
create policy restaurant_stats_public_read on restaurant_stats
  for select using (true);

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create policy profiles_public_read on profiles
  for select using (true);

create policy profiles_insert_own on profiles
  for insert with check (auth.uid() = id);

create policy profiles_update_own on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Visits
-- ---------------------------------------------------------------------------

create policy visits_read_public_or_own on visits
  for select using (is_public or auth.uid() = user_id);

create policy visits_insert_own on visits
  for insert with check (auth.uid() = user_id);

create policy visits_update_own on visits
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy visits_delete_own on visits
  for delete using (auth.uid() = user_id);

-- Photos inherit their visit's visibility.
create policy visit_photos_read on visit_photos
  for select using (
    exists (
      select 1 from visits v
      where v.id = visit_photos.visit_id
        and (v.is_public or v.user_id = auth.uid())
    )
  );

create policy visit_photos_write_own on visit_photos
  for all using (
    exists (
      select 1 from visits v
      where v.id = visit_photos.visit_id and v.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from visits v
      where v.id = visit_photos.visit_id and v.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Lists
-- ---------------------------------------------------------------------------

create policy lists_read_public_or_own on lists
  for select using (is_public or auth.uid() = user_id);

create policy lists_write_own on lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy list_items_read on list_items
  for select using (
    exists (
      select 1 from lists l
      where l.id = list_items.list_id
        and (l.is_public or l.user_id = auth.uid())
    )
  );

create policy list_items_write_own on list_items
  for all using (
    exists (
      select 1 from lists l
      where l.id = list_items.list_id and l.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from lists l
      where l.id = list_items.list_id and l.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Follows — public, the way Letterboxd's are.
-- ---------------------------------------------------------------------------

create policy follows_public_read on follows
  for select using (true);

create policy follows_insert_own on follows
  for insert with check (auth.uid() = follower_id);

create policy follows_delete_own on follows
  for delete using (auth.uid() = follower_id);

-- ---------------------------------------------------------------------------
-- Writes to the catalogue are service-role only for now. Restaurant edits by
-- users arrive with the claim flow (Tier 4 imagery) and get their own policies.
-- ---------------------------------------------------------------------------

-- New signups get a profile row automatically, so the app never has to handle a
-- logged-in user without one.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  candidate text;
  suffix integer := 0;
begin
  -- Derive a legal username from the email local part, then de-collide.
  base_username := regexp_replace(
    lower(split_part(coalesce(new.email, 'diner'), '@', 1)), '[^a-z0-9_]', '', 'g'
  );
  if length(base_username) < 3 then
    base_username := 'diner';
  end if;
  base_username := left(base_username, 20);
  candidate := base_username;

  while exists (select 1 from profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := left(base_username, 20) || suffix::text;
  end loop;

  insert into profiles (id, username, display_name)
  values (new.id, candidate, new.raw_user_meta_data ->> 'full_name');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
