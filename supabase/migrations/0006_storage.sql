-- Storage buckets.
--
-- Bucket ids carry the `rl-` prefix for the same reason the tables carry `rl_`:
-- this app currently shares a Supabase project with an unrelated production
-- system, and a generic id like "avatars" would collide with it.
--
-- Skipped when running against a bare Postgres that has no `storage` schema
-- (see supabase/tests/), so the migration set stays runnable locally.

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema absent — skipping bucket setup (local test run)';
    return;
  end if;

  -- Restaurant imagery: publicly readable, written only by the service role
  -- running the ingestion scripts.
  insert into storage.buckets (id, name, public)
  values ('rl-restaurant-images', 'rl-restaurant-images', true)
  on conflict (id) do nothing;

  -- Diners' own photos and avatars, uploaded from the client.
  insert into storage.buckets (id, name, public)
  values ('rl-visit-photos', 'rl-visit-photos', true)
  on conflict (id) do nothing;

  insert into storage.buckets (id, name, public)
  values ('rl-avatars', 'rl-avatars', true)
  on conflict (id) do nothing;
end
$$;

-- Policies live outside the DO block above so they are skipped cleanly when
-- storage is absent: creating a policy on a missing table is an error, not a
-- no-op. Each is guarded so re-running the migration is safe.
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    return;
  end if;

  -- Anyone may read: public restaurant and list pages render without a session.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'rl_public_read_images'
  ) then
    execute $policy$
      create policy rl_public_read_images on storage.objects
        for select using (
          bucket_id in ('rl-restaurant-images', 'rl-visit-photos', 'rl-avatars')
        )
    $policy$;
  end if;

  -- Diners write only inside a folder named for their own user id.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'rl_own_folder_write'
  ) then
    execute $policy$
      create policy rl_own_folder_write on storage.objects
        for all to authenticated
        using (
          bucket_id in ('rl-visit-photos', 'rl-avatars')
          and (storage.foldername(name))[1] = auth.uid()::text
        )
        with check (
          bucket_id in ('rl-visit-photos', 'rl-avatars')
          and (storage.foldername(name))[1] = auth.uid()::text
        )
    $policy$;
  end if;
end
$$;
