-- Website submissions are created by a server-only service client before an admin claims them.
alter table public.job_desk_clients alter column created_by drop not null;
alter table public.job_desk_orders alter column created_by drop not null;
alter table public.job_desk_intake_files alter column uploaded_by drop not null;

alter table public.job_desk_intake_files
  add column if not exists document_kind text not null default 'cv'
  check (document_kind in ('cv', 'supporting'));

create index if not exists job_desk_orders_website_queue_idx
  on public.job_desk_orders(created_at desc)
  where source_channel = 'website' and status = 'intake';
