alter type public.payment_status add value if not exists 'processing';
alter type public.payment_status add value if not exists 'successful';
alter type public.payment_status add value if not exists 'timed_out';

create table if not exists public.product_pricing (
  product_id text primary key,
  product_name text not null,
  category text not null,
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'KES',
  description text not null,
  features text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payments
add column if not exists product_id text references public.product_pricing(product_id),
add column if not exists phone_number text,
add column if not exists payment_method text not null default 'mpesa',
add column if not exists mpesa_receipt_number text,
add column if not exists transaction_date timestamptz,
add column if not exists result_code integer,
add column if not exists result_description text,
add column if not exists receipt_number text,
add column if not exists verified_by uuid references public.users(id) on delete set null,
add column if not exists verified_at timestamptz;

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete cascade,
  event_type text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade unique,
  balance numeric(12,2) not null default 0 check (balance >= 0),
  currency text not null default 'KES',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  transaction_type text not null,
  amount numeric(12,2) not null,
  reference text,
  description text,
  created_at timestamptz not null default now()
);

create unique index if not exists payments_mpesa_receipt_number_unique
on public.payments(mpesa_receipt_number)
where mpesa_receipt_number is not null;

create unique index if not exists payments_receipt_number_unique
on public.payments(receipt_number)
where receipt_number is not null;

create index if not exists payments_product_id_idx on public.payments(product_id);
create index if not exists payments_phone_number_idx on public.payments(phone_number);
create index if not exists payment_events_payment_id_idx on public.payment_events(payment_id);
create index if not exists wallets_user_id_idx on public.wallets(user_id);
create index if not exists wallet_transactions_user_id_idx on public.wallet_transactions(user_id, created_at desc);

create trigger set_product_pricing_updated_at
before update on public.product_pricing
for each row execute function public.set_updated_at();

create trigger set_wallets_updated_at
before update on public.wallets
for each row execute function public.set_updated_at();

alter table public.product_pricing enable row level security;
alter table public.payment_events enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

create policy "Authenticated users read active product pricing"
on public.product_pricing for select
to authenticated
using (is_active = true or private.is_admin());

create policy "Admins manage product pricing"
on public.product_pricing for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "Users read own payment events"
on public.payment_events for select
to authenticated
using (
  exists (
    select 1 from public.payments
    where payments.id = payment_events.payment_id
    and (payments.user_id = (select auth.uid()) or private.is_admin())
  )
);

create policy "Users create own payment events"
on public.payment_events for insert
to authenticated
with check (
  payment_id is null
  or exists (
    select 1 from public.payments
    where payments.id = payment_events.payment_id
    and (payments.user_id = (select auth.uid()) or private.is_admin())
  )
);

create policy "Users read own wallet"
on public.wallets for select
to authenticated
using (user_id = (select auth.uid()) or private.is_admin());

create policy "Admins manage wallets"
on public.wallets for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "Users read own wallet transactions"
on public.wallet_transactions for select
to authenticated
using (user_id = (select auth.uid()) or private.is_admin());

create policy "Admins manage wallet transactions"
on public.wallet_transactions for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

grant select on public.product_pricing to authenticated;
grant select, insert on public.payment_events to authenticated;
grant select on public.wallets to authenticated;
grant select on public.wallet_transactions to authenticated;

insert into public.product_pricing (product_id, product_name, category, price, currency, description, features)
values
  ('cv_builder', 'CV Builder', 'career', 299, 'KES', 'Create a detailed ATS-friendly CV with Solva Intelligence.', array['Guided CV builder','ATS keywords','Editable document','PDF and DOCX download']),
  ('cv_revamp', 'CV Revamp', 'career', 499, 'KES', 'Rewrite and upgrade an existing CV professionally.', array['Old CV cleanup','Achievement bullets','ATS improvement','Missing information notes']),
  ('cover_letter', 'Cover Letter', 'career', 199, 'KES', 'Generate a tailored professional cover letter.', array['Role-specific letter','Kenyan professional tone','Editable document','PDF and DOCX download']),
  ('cv_cover_bundle', 'CV + Cover Letter Bundle', 'career', 699, 'KES', 'Bundle a premium CV with a tailored cover letter.', array['CV Builder','Cover Letter','ATS keywords','Better value']),
  ('company_profile', 'Company Profile', 'business', 999, 'KES', 'Create a tender-ready company profile for Kenyan SMEs.', array['Tender-ready structure','Services and compliance sections','Editable profile','PDF and DOCX download']),
  ('business_plan', 'Business Plan', 'business', 1499, 'KES', 'Generate a practical business plan for SMEs and startups.', array['Investor-readable plan','Market and operations sections','Financial assumptions','Implementation roadmap'])
on conflict (product_id) do update set
  product_name = excluded.product_name,
  category = excluded.category,
  price = excluded.price,
  currency = excluded.currency,
  description = excluded.description,
  features = excluded.features,
  is_active = true,
  updated_at = now();
