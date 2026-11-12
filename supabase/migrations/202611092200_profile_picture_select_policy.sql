-- Storage upload with upsert (INSERT ... ON CONFLICT DO UPDATE) also needs a
-- SELECT policy on storage.objects. Public reads via the public URL do not
-- depend on this; it only lets users see their own object through the API.

drop policy if exists avatars_select_own on storage.objects;
create policy avatars_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
