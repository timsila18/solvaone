insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cv-uploads',
  'cv-uploads',
  false,
  8388608,
  array[
    'text/plain',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own CV files" on storage.objects;
create policy "Users upload own CV files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'cv-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users read own CV files" on storage.objects;
create policy "Users read own CV files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'cv-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users update own CV files" on storage.objects;
create policy "Users update own CV files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'cv-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'cv-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users delete own CV files" on storage.objects;
create policy "Users delete own CV files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'cv-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
