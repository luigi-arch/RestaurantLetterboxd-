-- Restaurant imagery, with mandatory provenance.
--
-- Every image records where it came from and under what licence. If a source's
-- terms change, or a restaurant objects to a photo, removal is a one-line delete
-- by `source` rather than a forensic audit. This is cheap now and expensive to
-- retrofit, which is why it exists before the first image is fetched.

create type rl_image_source as enum (
  -- Tier 1: og:image / twitter:image / JSON-LD from the restaurant's own site.
  -- Metadata published specifically so third parties can render link previews.
  'site_og',
  -- Tier 2: Wikimedia Commons, CC-licensed, attribution recorded.
  'wikimedia',
  -- Tier 3: Google Places. NEVER stored — see the storage_path constraint below.
  'google_places',
  -- Tier 4: uploaded by the restaurant via the claim flow.
  'owner',
  -- Tier 5: a diner's photo, promoted from rl_visit_photos.
  'user'
);

create table rl_restaurant_images (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references rl_restaurants (id) on delete cascade,
  source           rl_image_source not null,
  -- Path in Supabase Storage. Null for sources we are not permitted to store.
  storage_path     text,
  -- Where it came from: page URL, Commons file URL, or Places photo reference.
  source_url       text,
  license          text,
  -- Pre-rendered attribution markup, shown wherever the image appears.
  attribution_html text,
  width            integer,
  height           integer,
  fetched_at       timestamptz not null default now(),
  is_primary       boolean not null default false,

  -- Google Places photos have no caching exception in the Maps Platform service
  -- terms: place IDs may be stored indefinitely and coordinates for 30 days, but
  -- photos must be fetched per render. Encoding that here means the rule cannot
  -- be lost to a future refactor or a hurried pull request.
  constraint google_places_never_stored
    check (source <> 'google_places' or storage_path is null),

  -- Anything we *are* allowed to keep must actually be kept.
  constraint storable_sources_have_a_path
    check (source = 'google_places' or storage_path is not null)
);

create index rl_restaurant_images_restaurant_idx on rl_restaurant_images (restaurant_id);
create index rl_restaurant_images_source_idx on rl_restaurant_images (source);
-- Re-crawl scheduling: Tier 1 images go stale when a restaurant redesigns or
-- its domain lapses into a parked page.
create index rl_restaurant_images_fetched_idx on rl_restaurant_images (fetched_at)
  where source = 'site_og';

-- At most one primary image per restaurant.
create unique index rl_restaurant_images_one_primary_idx
  on rl_restaurant_images (restaurant_id)
  where is_primary;
