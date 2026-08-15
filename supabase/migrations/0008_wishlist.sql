-- "Want to visit".
--
-- Deliberately separate from rl_visits rather than a flag on it: wanting to go
-- is not a visit with null fields, it has no date and no rating, and mixing the
-- two would quietly corrupt every aggregate — a wishlist entry must never count
-- as a diner.
--
-- It is also the other half of the completion map. Grey means never been, green
-- means been, and this is what makes a pin worth aiming at.

create table rl_wishlist (
  user_id       uuid not null references rl_profiles (id) on delete cascade,
  restaurant_id uuid not null references rl_restaurants (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, restaurant_id)
);

create index rl_wishlist_restaurant_idx on rl_wishlist (restaurant_id);

alter table rl_wishlist enable row level security;

-- Public read: "3 people want to go here" is a useful signal, and a wishlist is
-- less socially loaded than a rating.
create policy wishlist_public_read on rl_wishlist for select using (true);

create policy wishlist_insert_own on rl_wishlist
  for insert with check (auth.uid() = user_id);

create policy wishlist_delete_own on rl_wishlist
  for delete using (auth.uid() = user_id);
