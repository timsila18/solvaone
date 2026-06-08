alter type public.user_role add value if not exists 'super_admin';

alter table public.users add column if not exists status text not null default 'active' check (status in ('active', 'disabled', 'locked'));
alter table public.users add column if not exists last_login_at timestamptz;

create table if not exists public.auth_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip_address text,
  success boolean not null default false,
  failure_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  level text not null default 'info' check (level in ('info', 'warning', 'error')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null,
  category text not null default 'support',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  assigned_to uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  sender_type text not null check (sender_type in ('user', 'admin', 'system')),
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('fixed', 'percentage')),
  value numeric(12,2) not null check (value > 0),
  product_id text,
  start_date timestamptz,
  end_date timestamptz,
  usage_limit integer,
  usage_count integer not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'escalated')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  consent_type text not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  unique(user_id, consent_type, version)
);

create index if not exists auth_attempts_email_created_idx on public.auth_attempts(lower(email), created_at desc);
create index if not exists system_logs_category_created_idx on public.system_logs(category, created_at desc);
create index if not exists system_logs_level_created_idx on public.system_logs(level, created_at desc);
create index if not exists admin_activity_logs_admin_created_idx on public.admin_activity_logs(admin_id, created_at desc);
create index if not exists tickets_user_status_idx on public.tickets(user_id, status, updated_at desc);
create index if not exists ticket_messages_ticket_created_idx on public.ticket_messages(ticket_id, created_at);
create index if not exists coupons_status_dates_idx on public.coupons(status, start_date, end_date);
create index if not exists refund_requests_user_status_idx on public.refund_requests(user_id, status, created_at desc);
create index if not exists consents_user_type_idx on public.consents(user_id, consent_type, accepted_at desc);
create index if not exists payments_product_created_idx on public.payments(product, created_at desc);
create index if not exists ai_generations_user_created_idx on public.ai_generations(user_id, created_at desc);
create index if not exists ai_generations_product_created_idx on public.ai_generations(product_type, created_at desc);

drop trigger if exists set_tickets_updated_at on public.tickets;
create trigger set_tickets_updated_at before update on public.tickets for each row execute function public.set_updated_at();

drop trigger if exists set_coupons_updated_at on public.coupons;
create trigger set_coupons_updated_at before update on public.coupons for each row execute function public.set_updated_at();

drop trigger if exists set_refund_requests_updated_at on public.refund_requests;
create trigger set_refund_requests_updated_at before update on public.refund_requests for each row execute function public.set_updated_at();

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
    and role::text in ('admin', 'super_admin')
    and status = 'active'
  );
$$;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
    and role::text = 'super_admin'
    and status = 'active'
  );
$$;

alter table public.auth_attempts enable row level security;
alter table public.system_logs enable row level security;
alter table public.admin_activity_logs enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.coupons enable row level security;
alter table public.refund_requests enable row level security;
alter table public.consents enable row level security;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  supplied_referral_code text;
  new_referral_code text;
  referrer_id uuid;
  terms_accepted boolean;
  privacy_accepted boolean;
  terms_version text;
  privacy_version text;
begin
  supplied_referral_code := nullif(upper(new.raw_user_meta_data->>'referral_code'), '');
  new_referral_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  terms_accepted := coalesce((new.raw_user_meta_data->>'terms_accepted')::boolean, false);
  privacy_accepted := coalesce((new.raw_user_meta_data->>'privacy_accepted')::boolean, false);
  terms_version := coalesce(nullif(new.raw_user_meta_data->>'terms_version', ''), '2026-06-08');
  privacy_version := coalesce(nullif(new.raw_user_meta_data->>'privacy_version', ''), '2026-06-08');

  insert into public.users (id, email, full_name, referral_code, referred_by_code)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new_referral_code, supplied_referral_code)
  on conflict (id) do update set email = excluded.email;

  if terms_accepted then
    insert into public.consents (user_id, consent_type, version)
    values (new.id, 'terms', terms_version)
    on conflict do nothing;
  end if;

  if privacy_accepted then
    insert into public.consents (user_id, consent_type, version)
    values (new.id, 'privacy', privacy_version)
    on conflict do nothing;
  end if;

  if supplied_referral_code is not null then
    select id into referrer_id from public.users where referral_code = supplied_referral_code limit 1;
    if referrer_id is not null and referrer_id <> new.id then
      insert into public.referrals (referrer_user_id, referred_user_id, referral_code, status, reward_status)
      values (referrer_id, new.id, supplied_referral_code, 'pending', 'pending')
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop policy if exists "Admins read auth attempts" on public.auth_attempts;
create policy "Admins read auth attempts" on public.auth_attempts for select to authenticated using (private.is_admin());
drop policy if exists "Anyone records auth attempts" on public.auth_attempts;
create policy "Anyone records auth attempts" on public.auth_attempts for insert to anon, authenticated with check (true);

drop policy if exists "Admins read system logs" on public.system_logs;
create policy "Admins read system logs" on public.system_logs for select to authenticated using (private.is_admin());
drop policy if exists "Admins manage system logs" on public.system_logs;
create policy "Admins manage system logs" on public.system_logs for insert to authenticated with check (private.is_admin());

drop policy if exists "Admins read admin activity logs" on public.admin_activity_logs;
create policy "Admins read admin activity logs" on public.admin_activity_logs for select to authenticated using (private.is_admin());
drop policy if exists "Admins create admin activity logs" on public.admin_activity_logs;
create policy "Admins create admin activity logs" on public.admin_activity_logs for insert to authenticated with check (private.is_admin());

drop policy if exists "Users read own tickets" on public.tickets;
create policy "Users read own tickets" on public.tickets for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());
drop policy if exists "Users create own tickets" on public.tickets;
create policy "Users create own tickets" on public.tickets for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Admins update tickets" on public.tickets;
create policy "Admins update tickets" on public.tickets for update to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists "Users read own ticket messages" on public.ticket_messages;
create policy "Users read own ticket messages" on public.ticket_messages for select to authenticated using (
  exists (select 1 from public.tickets where tickets.id = ticket_messages.ticket_id and (tickets.user_id = (select auth.uid()) or private.is_admin()))
);
drop policy if exists "Users create own ticket messages" on public.ticket_messages;
create policy "Users create own ticket messages" on public.ticket_messages for insert to authenticated with check (
  exists (select 1 from public.tickets where tickets.id = ticket_messages.ticket_id and tickets.user_id = (select auth.uid()))
  or private.is_admin()
);

drop policy if exists "Coupons readable by authenticated users" on public.coupons;
create policy "Coupons readable by authenticated users" on public.coupons for select to authenticated using (status = 'active' or private.is_admin());
drop policy if exists "Super admins manage coupons" on public.coupons;
create policy "Super admins manage coupons" on public.coupons for all to authenticated using (private.is_super_admin()) with check (private.is_super_admin());

drop policy if exists "Users read own refund requests" on public.refund_requests;
create policy "Users read own refund requests" on public.refund_requests for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());
drop policy if exists "Users create own refund requests" on public.refund_requests;
create policy "Users create own refund requests" on public.refund_requests for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Admins update refund requests" on public.refund_requests;
create policy "Admins update refund requests" on public.refund_requests for update to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists "Users read own consents" on public.consents;
create policy "Users read own consents" on public.consents for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());
drop policy if exists "Users create own consents" on public.consents;
create policy "Users create own consents" on public.consents for insert to authenticated with check (user_id = (select auth.uid()));

grant execute on function private.is_super_admin() to authenticated;
grant select, insert on public.auth_attempts to anon, authenticated;
grant select, insert on public.system_logs to authenticated;
grant select, insert on public.admin_activity_logs to authenticated;
grant select, insert, update on public.tickets to authenticated;
grant select, insert on public.ticket_messages to authenticated;
grant select, insert, update, delete on public.coupons to authenticated;
grant select, insert, update on public.refund_requests to authenticated;
grant select, insert on public.consents to authenticated;
