-- Visits, lists and the social graph.
--
-- The loggable object is a VISIT, not a review. One diner logs the same
-- restaurant many times; that repeat is Letterboxd's "rewatch" and it is exactly
-- what makes the return-rate metric possible.

-- ---------------------------------------------------------------------------
-- Visits
-- ---------------------------------------------------------------------------

create table rl_visits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references rl_profiles (id) on delete cascade,
  restaurant_id  uuid not null references rl_restaurants (id) on delete cascade,
  -- The date of the meal, not when it was logged. Backfilling old meals during
  -- onboarding depends on these being different things.
  visited_on     date not null,
  -- Null is allowed: logging that you went somewhere is useful even without a
  -- score, and forcing a rating suppresses logging.
  rating         numeric(2, 1) check (rating between 0.5 and 5.0),
  -- NOT NULL on purpose. This is the one field we refuse to let anyone skip:
  -- it cannot be gamed at scale and it does not decay into politeness the way
  -- a star rating does on a small island.
  would_return   boolean not null,
  note           text,
  price_per_head numeric(6, 2) check (price_per_head >= 0),
  occasion       text,
  is_public      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Ratings are entered in half stars; reject anything else at the boundary
  -- rather than silently rounding it later.
  constraint rating_half_steps check (rating is null or (rating * 2) = floor(rating * 2)),
  -- A meal cannot have happened tomorrow. Guards the recency weighting against
  -- mistyped years handing one visit runaway influence.
  constraint visited_on_not_future check (visited_on <= (now() at time zone 'utc')::date + 1)
);

create index rl_visits_user_idx on rl_visits (user_id, visited_on desc);
create index rl_visits_restaurant_idx on rl_visits (restaurant_id, visited_on desc);
create index rl_visits_public_feed_idx on rl_visits (created_at desc) where is_public;
-- Supports "have I been here?" lookups on the completion map.
create index rl_visits_user_restaurant_idx on rl_visits (user_id, restaurant_id);

create trigger visits_touch_updated_at
  before update on rl_visits
  for each row execute function rl_touch_updated_at();

create table rl_visit_photos (
  id           uuid primary key default gen_random_uuid(),
  visit_id     uuid not null references rl_visits (id) on delete cascade,
  storage_path text not null,
  position     smallint not null default 0,
  created_at   timestamptz not null default now()
);

create index rl_visit_photos_visit_idx on rl_visit_photos (visit_id, position);

-- ---------------------------------------------------------------------------
-- Lists — the acquisition channel
-- ---------------------------------------------------------------------------

create table rl_lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references rl_profiles (id) on delete cascade,
  slug        text not null,
  title       text not null,
  description text,
  is_public   boolean not null default true,
  cover_image text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Slugs are unique per author, so two people can both have "best-ftira".
  unique (user_id, slug)
);

create index rl_lists_public_idx on rl_lists (updated_at desc) where is_public;

create trigger lists_touch_updated_at
  before update on rl_lists
  for each row execute function rl_touch_updated_at();

create table rl_list_items (
  id            uuid primary key default gen_random_uuid(),
  list_id       uuid not null references rl_lists (id) on delete cascade,
  restaurant_id uuid not null references rl_restaurants (id) on delete cascade,
  position      integer not null default 0,
  note          text,
  created_at    timestamptz not null default now(),
  -- A restaurant appears at most once per list.
  unique (list_id, restaurant_id)
);

create index rl_list_items_list_idx on rl_list_items (list_id, position);

-- ---------------------------------------------------------------------------
-- Follows
-- ---------------------------------------------------------------------------

create table rl_follows (
  follower_id uuid not null references rl_profiles (id) on delete cascade,
  followee_id uuid not null references rl_profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint no_self_follow check (follower_id <> followee_id)
);

-- Reverse lookup: "who follows me".
create index rl_follows_followee_idx on rl_follows (followee_id);
