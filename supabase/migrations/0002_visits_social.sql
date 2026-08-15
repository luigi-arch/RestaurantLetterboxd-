-- Visits, lists and the social graph.
--
-- The loggable object is a VISIT, not a review. One diner logs the same
-- restaurant many times; that repeat is Letterboxd's "rewatch" and it is exactly
-- what makes the return-rate metric possible.

-- ---------------------------------------------------------------------------
-- Visits
-- ---------------------------------------------------------------------------

create table visits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles (id) on delete cascade,
  restaurant_id  uuid not null references restaurants (id) on delete cascade,
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

create index visits_user_idx on visits (user_id, visited_on desc);
create index visits_restaurant_idx on visits (restaurant_id, visited_on desc);
create index visits_public_feed_idx on visits (created_at desc) where is_public;
-- Supports "have I been here?" lookups on the completion map.
create index visits_user_restaurant_idx on visits (user_id, restaurant_id);

create trigger visits_touch_updated_at
  before update on visits
  for each row execute function touch_updated_at();

create table visit_photos (
  id           uuid primary key default gen_random_uuid(),
  visit_id     uuid not null references visits (id) on delete cascade,
  storage_path text not null,
  position     smallint not null default 0,
  created_at   timestamptz not null default now()
);

create index visit_photos_visit_idx on visit_photos (visit_id, position);

-- ---------------------------------------------------------------------------
-- Lists — the acquisition channel
-- ---------------------------------------------------------------------------

create table lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
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

create index lists_public_idx on lists (updated_at desc) where is_public;

create trigger lists_touch_updated_at
  before update on lists
  for each row execute function touch_updated_at();

create table list_items (
  id            uuid primary key default gen_random_uuid(),
  list_id       uuid not null references lists (id) on delete cascade,
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  position      integer not null default 0,
  note          text,
  created_at    timestamptz not null default now(),
  -- A restaurant appears at most once per list.
  unique (list_id, restaurant_id)
);

create index list_items_list_idx on list_items (list_id, position);

-- ---------------------------------------------------------------------------
-- Follows
-- ---------------------------------------------------------------------------

create table follows (
  follower_id uuid not null references profiles (id) on delete cascade,
  followee_id uuid not null references profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint no_self_follow check (follower_id <> followee_id)
);

-- Reverse lookup: "who follows me".
create index follows_followee_idx on follows (followee_id);
