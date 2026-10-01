create table public.job_desk_authorization_batches (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.job_desk_orders(id) on delete cascade,
  token_hash text not null unique,
  match_ids uuid[] not null check (cardinality(match_ids) between 1 and 10),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index job_desk_authorization_batches_order_idx on public.job_desk_authorization_batches(order_id, created_at desc);
alter table public.job_desk_authorization_batches enable row level security;
revoke all on public.job_desk_authorization_batches from anon, authenticated;
grant select on public.job_desk_authorization_batches to authenticated;
grant all on public.job_desk_authorization_batches to service_role;
create policy "Admins view Job Desk authorization batches" on public.job_desk_authorization_batches
  for select to authenticated using (private.is_admin());
