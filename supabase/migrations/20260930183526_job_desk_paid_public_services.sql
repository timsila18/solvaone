alter table public.job_desk_orders drop constraint job_desk_orders_service_type_check;
alter table public.job_desk_orders add constraint job_desk_orders_service_type_check
  check (service_type in ('cv_revamp', 'cv_build', 'job_search_full', 'interview_coaching', 'linkedin_revamp'));
alter table public.job_desk_orders drop constraint job_desk_orders_status_check;
alter table public.job_desk_orders add constraint job_desk_orders_status_check
  check (status in ('awaiting_payment', 'intake', 'awaiting_information', 'cv_processing', 'cv_review', 'approved', 'active', 'paused', 'completed', 'cancelled', 'failed'));
alter table public.job_desk_orders add column service_details jsonb not null default '{}'::jsonb;
alter table public.job_desk_orders add column public_access_token_hash text unique;

create table public.job_desk_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.job_desk_orders(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'KES' check (currency = 'KES'),
  phone_number text not null,
  status text not null default 'initiating' check (status in ('initiating', 'processing', 'successful', 'failed', 'cancelled', 'timed_out', 'needs_review')),
  checkout_request_id text unique,
  merchant_request_id text,
  mpesa_receipt_number text unique,
  result_code integer,
  result_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index job_desk_payment_attempts_order_idx on public.job_desk_payment_attempts(order_id, created_at desc);
create unique index job_desk_payment_attempts_one_open_idx on public.job_desk_payment_attempts(order_id)
  where status in ('initiating', 'processing');
create trigger set_job_desk_payment_attempts_updated_at before update on public.job_desk_payment_attempts
  for each row execute function public.set_updated_at();

create table public.job_desk_payment_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid references public.job_desk_payment_attempts(id) on delete cascade,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index job_desk_payment_events_attempt_idx on public.job_desk_payment_events(attempt_id, created_at desc);

alter table public.job_desk_payment_attempts enable row level security;
alter table public.job_desk_payment_events enable row level security;
revoke all on public.job_desk_payment_attempts, public.job_desk_payment_events from anon, authenticated;
grant select on public.job_desk_payment_attempts, public.job_desk_payment_events to authenticated;
grant all on public.job_desk_payment_attempts, public.job_desk_payment_events to service_role;
create policy "Admins view Job Desk payments" on public.job_desk_payment_attempts for select to authenticated using (private.is_admin());
create policy "Admins view Job Desk payment events" on public.job_desk_payment_events for select to authenticated using (private.is_admin());
