-- Storage buckets.
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
  values ('restaurant-images', 'restaurant-images', true)
  on conflict (id) do nothing;

  -- Diners' own photos and avatars, uploaded from the client.
  insert into storage.buckets (id, name, public)
  values ('visit-photos', 'visit-photos', true)
  on conflict (id) do nothing;

  insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
end
$$;

-- Policies live outside the DO block so they are skipped cleanly when storage
-- is absent: creating a policy on a missing table is an error, not a no-op.
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    return;
  end if;

  -- Anyone may read: public restaurant and list pages render without a session.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'public_read_restaurant_images'
  ) then
    execute $policy$
      create policy public_read_restaurant_images on storage.objects
        for select using (bucket_id in ('restaurant-images', 'visit-photos', 'avatars'))
    $policy$;
  end if;

  -- Diners write only inside a folder named for their own user id.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'own_folder_write_visit_photos'
  ) then
    execute $policy$
      create policy own_folder_write_visit_photos on storage.objects
        for all to authenticated
        using (
          bucket_id in ('visit-photos', 'avatars')
          and (storage.foldername(name))[1] = auth.uid()::text
        )
        with check (
          bucket_id in ('visit-photos', 'avatars')
          and (storage.foldername(name))[1] = auth.uid()::text
        )
    $policy$;
  end if;
end
$$;
