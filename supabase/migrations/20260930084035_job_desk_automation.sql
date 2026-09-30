create table public.job_desk_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('greenhouse', 'lever')),
  site_token text not null check (site_token ~ '^[a-zA-Z0-9_-]{2,80}$'),
  company_name text not null,
  active boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (provider, site_token)
);

create table public.job_desk_vacancies (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.job_desk_sources(id) on delete set null,
  provider text not null check (provider in ('greenhouse', 'lever', 'manual')),
  external_id text not null,
  company_name text not null,
  title text not null,
  location text not null default '',
  workplace_type text not null default 'unspecified' check (workplace_type in ('remote', 'hybrid', 'onsite', 'unspecified')),
  description text not null default '',
  apply_url text not null,
  application_method text not null default 'portal' check (application_method in ('portal', 'email')),
  application_email text,
  email_verified boolean not null default false,
  source_updated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'closed')),
  unique (provider, external_id),
  check (application_method <> 'email' or application_email is not null)
);
create index job_desk_vacancies_open_idx on public.job_desk_vacancies(last_seen_at desc) where status = 'open';
create index job_desk_vacancies_source_idx on public.job_desk_vacancies(source_id, status);

create table public.job_desk_matches (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.job_desk_orders(id) on delete cascade,
  vacancy_id uuid not null references public.job_desk_vacancies(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  reasons jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  status text not null default 'suggested' check (status in ('suggested', 'preparing', 'ready', 'authorized', 'submitted', 'needs_human', 'rejected')),
  cover_letter text,
  authorization_token_hash text unique,
  authorization_expires_at timestamptz,
  authorized_at timestamptz,
  authorized_ip_hash text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, vacancy_id)
);
create index job_desk_matches_order_idx on public.job_desk_matches(order_id, score desc);

create table public.job_desk_applications (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.job_desk_matches(id) on delete cascade,
  order_id uuid not null references public.job_desk_orders(id) on delete cascade,
  method text not null check (method in ('email', 'portal')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'submitted', 'needs_human', 'failed')),
  recipient text,
  provider_message_id text,
  provider_response jsonb not null default '{}'::jsonb,
  error_message text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.job_desk_tasks add column lease_until timestamptz;
create index job_desk_tasks_order_idx on public.job_desk_tasks(order_id, created_at desc);
alter table public.job_desk_ai_runs alter column initiated_by drop not null;
alter table public.job_desk_ai_runs drop constraint job_desk_ai_runs_operation_check;
alter table public.job_desk_ai_runs add constraint job_desk_ai_runs_operation_check check (operation in ('cv_intake_and_revamp', 'cv_revision', 'profile_refresh', 'match_cover_letter'));

create trigger set_job_desk_matches_updated_at before update on public.job_desk_matches for each row execute function public.set_updated_at();
create trigger set_job_desk_applications_updated_at before update on public.job_desk_applications for each row execute function public.set_updated_at();

alter table public.job_desk_sources enable row level security;
alter table public.job_desk_vacancies enable row level security;
alter table public.job_desk_matches enable row level security;
alter table public.job_desk_applications enable row level security;

create policy "Admins manage Job Desk sources" on public.job_desk_sources for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins manage Job Desk vacancies" on public.job_desk_vacancies for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins manage Job Desk matches" on public.job_desk_matches for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins manage Job Desk applications" on public.job_desk_applications for all to authenticated using (private.is_admin()) with check (private.is_admin());

grant select, insert, update, delete on public.job_desk_sources, public.job_desk_vacancies, public.job_desk_matches, public.job_desk_applications to authenticated;

-- Called only with the server-side service key. Row locks make concurrent workers safe.
create function public.claim_job_desk_task(p_worker text)
returns setof public.job_desk_tasks
language plpgsql security definer set search_path = '' as $$
begin
  update public.job_desk_tasks
  set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
      locked_at = null, lease_until = null, locked_by = null,
      available_at = now() + interval '30 seconds',
      last_error = 'Worker lease expired; task returned to queue.'
  where status = 'running' and lease_until < now();

  return query
  with next_task as (
    select id from public.job_desk_tasks
    where status = 'queued' and available_at <= now() and attempts < max_attempts
    order by available_at, created_at
    for update skip locked limit 1
  )
  update public.job_desk_tasks t
  set status = 'running', attempts = t.attempts + 1, locked_at = now(),
      lease_until = now() + interval '4 minutes', locked_by = p_worker
  from next_task where t.id = next_task.id
  returning t.*;
end;
$$;
revoke all on function public.claim_job_desk_task(text) from public, anon, authenticated;
grant execute on function public.claim_job_desk_task(text) to service_role;

insert into public.job_desk_sources(provider, site_token, company_name)
values ('greenhouse', 'gitlab', 'GitLab'), ('greenhouse', 'canonical', 'Canonical')
on conflict (provider, site_token) do nothing;
