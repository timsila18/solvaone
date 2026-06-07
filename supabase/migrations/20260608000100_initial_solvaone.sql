create extension if not exists "pgcrypto";
create schema if not exists private;

create type public.user_role as enum ('user', 'admin');
create type public.product_key as enum ('cv_builder', 'cv_revamp', 'cover_letter', 'company_profile', 'business_plan');
create type public.project_status as enum ('draft', 'awaiting_payment', 'paid', 'generating', 'ready', 'archived');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'cancelled');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role public.user_role not null default 'user',
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  product public.product_key not null,
  title text not null,
  status public.project_status not null default 'draft',
  source_brief text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  html text not null default '',
  format text not null default 'html',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  product public.product_key not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'KES',
  status public.payment_status not null default 'pending',
  provider text not null default 'mpesa',
  checkout_request_id text unique,
  merchant_request_id text,
  provider_reference text,
  raw_request jsonb,
  raw_callback jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index projects_user_id_updated_at_idx on public.projects(user_id, updated_at desc);
create index documents_project_id_idx on public.documents(project_id);
create index documents_user_id_updated_at_idx on public.documents(user_id, updated_at desc);
create index payments_user_id_created_at_idx on public.payments(user_id, created_at desc);
create index payments_status_idx on public.payments(status);
create index audit_logs_user_id_created_at_idx on public.audit_logs(user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_users_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger set_projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger set_documents_updated_at before update on public.documents for each row execute function public.set_updated_at();
create trigger set_payments_updated_at before update on public.payments for each row execute function public.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.documents enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
    and role = 'admin'
  );
$$;

create policy "Users can read own profile"
on public.users for select
to authenticated
using (id = auth.uid() or private.is_admin());

create policy "Admins can update users"
on public.users for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "Users manage own projects"
on public.projects for all
to authenticated
using (user_id = auth.uid() or private.is_admin())
with check (user_id = auth.uid() or private.is_admin());

create policy "Users manage own documents"
on public.documents for all
to authenticated
using (user_id = auth.uid() or private.is_admin())
with check (user_id = auth.uid() or private.is_admin());

create policy "Users read own payments"
on public.payments for select
to authenticated
using (user_id = auth.uid() or private.is_admin());

create policy "Users create own payments"
on public.payments for insert
to authenticated
with check (user_id = auth.uid());

create policy "Admins update payments"
on public.payments for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "Users read own audit logs"
on public.audit_logs for select
to authenticated
using (user_id = auth.uid() or private.is_admin());

create policy "Users create own audit logs"
on public.audit_logs for insert
to authenticated
with check (user_id = auth.uid() or private.is_admin());

grant usage on schema public to anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert on public.payments to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select on public.users to authenticated;
