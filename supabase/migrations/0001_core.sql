-- Core catalogue: markets, localities, restaurants, profiles.
--
-- Portability rule: nothing in this schema hardcodes Malta. Localities carry a
-- `region` key matching src/config/market.ts, so a second market is a seed, not
-- a migration.

create extension if not exists "pg_trgm";
create extension if not exists "unaccent";

-- ---------------------------------------------------------------------------
-- Maltese-aware text normalisation
-- ---------------------------------------------------------------------------

-- Maltese uses ħ ġ ż ċ, and nobody types them on a phone keyboard. Searching for
-- "ghajnsielem" must find "Għajnsielem", and "Hamrun" must find "Ħamrun".
-- unaccent alone does not reliably fold ħ/Ħ, so we map the Maltese set explicitly.
--
-- IMMUTABLE (not STABLE) so it can be used in an index expression.
create or replace function mt_normalize(input text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(
    translate(
      input,
      'ħĦġĠżŻċĊàÀèÈìÌòÒùÙáÁéÉíÍóÓúÚâÂêÊîÎôÔûÛäÄëËïÏöÖüÜñÑçÇ',
      'hHgGzZcCaAeEiIoOuUaAeEiIoOuUaAeEiIoOuUaAeEiIoOuUnNcC'
    )
  );
$$;

comment on function mt_normalize(text) is
  'Lowercases and strips Maltese/Latin diacritics so search works from a plain keyboard.';

-- ---------------------------------------------------------------------------
-- Localities
-- ---------------------------------------------------------------------------

create table localities (
  id          uuid primary key default gen_random_uuid(),
  -- Matches Market.key in src/config/market.ts.
  region      text not null,
  name        text not null,
  -- Alternate/historic names: Birgu/Vittoriosa, Isla/Senglea, Rabat Gozo/Victoria.
  aliases     text[] not null default '{}',
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now(),
  unique (region, name)
);

create index localities_region_idx on localities (region);
create index localities_name_trgm_idx
  on localities using gin (mt_normalize(name) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  username         text not null unique,
  display_name     text,
  bio              text,
  avatar_url       text,
  -- Per the product decision: logs are public by default. This flips the
  -- default for users who would rather keep a private diary; individual visits
  -- can still be overridden either way.
  default_private  boolean not null default false,
  created_at       timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,24}$')
);

create index profiles_username_trgm_idx
  on profiles using gin (mt_normalize(username) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Restaurants
-- ---------------------------------------------------------------------------

create type restaurant_status as enum ('open', 'closed', 'unverified');

create table restaurants (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  locality_id   uuid references localities (id) on delete set null,
  lat           double precision,
  lng           double precision,
  cuisines      text[] not null default '{}',
  -- 1..4, rendered as € to €€€€. Null until someone tells us.
  price_band    smallint check (price_band between 1 and 4),
  -- OpenStreetMap element id, e.g. 'node/1234'. Unique so the seed is idempotent.
  osm_id        text unique,
  phone         text,
  website       text,
  status        restaurant_status not null default 'unverified',
  -- Set by hand during the curation pass; drives the "restaurants that matter"
  -- catalogue used by onboarding and the completion map denominator.
  is_curated    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint lat_range check (lat is null or lat between -90 and 90),
  constraint lng_range check (lng is null or lng between -180 and 180)
);

create index restaurants_locality_idx on restaurants (locality_id);
create index restaurants_status_idx on restaurants (status);
create index restaurants_curated_idx on restaurants (is_curated) where is_curated;
create index restaurants_name_trgm_idx
  on restaurants using gin (mt_normalize(name) gin_trgm_ops);
create index restaurants_geo_idx on restaurants (lat, lng);

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger restaurants_touch_updated_at
  before update on restaurants
  for each row execute function touch_updated_at();
