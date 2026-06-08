alter table public.users add column if not exists referral_code text;
alter table public.users add column if not exists referred_by_code text;

update public.users
set referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where referral_code is null;

alter table public.users alter column referral_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

create unique index if not exists users_referral_code_key on public.users(referral_code);

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text not null default '',
  content text not null default '',
  cover_image text,
  author_id uuid references public.users(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  status text not null default 'unread' check (status in ('unread', 'read', 'archived')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  email text not null,
  subject text not null,
  status text not null default 'logged',
  provider_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.users(id) on delete cascade,
  referred_user_id uuid references public.users(id) on delete set null,
  referral_code text not null,
  status text not null default 'pending' check (status in ('pending', 'converted', 'rejected')),
  reward_status text not null default 'pending' check (reward_status in ('pending', 'earned', 'issued', 'expired')),
  created_at timestamptz not null default now()
);

create table if not exists public.credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  credit_type text not null,
  value numeric(12,2) not null default 0,
  status text not null default 'active' check (status in ('active', 'used', 'expired', 'cancelled')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  role_or_business text,
  testimonial text not null,
  rating integer not null default 5 check (rating between 1 and 5),
  product_type text,
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  subject text not null,
  message text not null,
  status text not null default 'new' check (status in ('new', 'open', 'closed', 'spam')),
  created_at timestamptz not null default now()
);

create index if not exists blog_posts_status_published_at_idx on public.blog_posts(status, published_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists email_logs_created_idx on public.email_logs(created_at desc);
create index if not exists referrals_referrer_created_idx on public.referrals(referrer_user_id, created_at desc);
create index if not exists referrals_code_idx on public.referrals(referral_code);
create index if not exists credits_user_status_idx on public.credits(user_id, status);
create index if not exists testimonials_featured_idx on public.testimonials(is_featured, created_at desc);
create index if not exists contact_messages_status_created_idx on public.contact_messages(status, created_at desc);

drop trigger if exists set_blog_posts_updated_at on public.blog_posts;
create trigger set_blog_posts_updated_at before update on public.blog_posts for each row execute function public.set_updated_at();

alter table public.blog_posts enable row level security;
alter table public.notifications enable row level security;
alter table public.email_logs enable row level security;
alter table public.referrals enable row level security;
alter table public.credits enable row level security;
alter table public.testimonials enable row level security;
alter table public.contact_messages enable row level security;

drop policy if exists "Published blog posts are public" on public.blog_posts;
create policy "Published blog posts are public"
on public.blog_posts for select
to anon, authenticated
using (status = 'published' or private.is_admin());

drop policy if exists "Admins manage blog posts" on public.blog_posts;
create policy "Admins manage blog posts"
on public.blog_posts for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications"
on public.notifications for select
to authenticated
using (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications"
on public.notifications for update
to authenticated
using (user_id = (select auth.uid()) or private.is_admin())
with check (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "Admins read email logs" on public.email_logs;
create policy "Admins read email logs"
on public.email_logs for select
to authenticated
using (private.is_admin());

drop policy if exists "Users read own referrals" on public.referrals;
create policy "Users read own referrals"
on public.referrals for select
to authenticated
using (referrer_user_id = (select auth.uid()) or referred_user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "Users read own credits" on public.credits;
create policy "Users read own credits"
on public.credits for select
to authenticated
using (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "Featured testimonials are public" on public.testimonials;
create policy "Featured testimonials are public"
on public.testimonials for select
to anon, authenticated
using (is_featured = true or private.is_admin());

drop policy if exists "Admins manage testimonials" on public.testimonials;
create policy "Admins manage testimonials"
on public.testimonials for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists "Anyone can submit contact messages" on public.contact_messages;
create policy "Anyone can submit contact messages"
on public.contact_messages for insert
to anon, authenticated
with check (true);

drop policy if exists "Admins manage contact messages" on public.contact_messages;
create policy "Admins manage contact messages"
on public.contact_messages for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

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
begin
  supplied_referral_code := nullif(upper(new.raw_user_meta_data->>'referral_code'), '');
  new_referral_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.users (id, email, full_name, referral_code, referred_by_code)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new_referral_code, supplied_referral_code)
  on conflict (id) do update set email = excluded.email;

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

grant select on public.blog_posts to anon, authenticated;
grant insert on public.contact_messages to anon, authenticated;
grant select on public.testimonials to anon, authenticated;
grant select, insert, update, delete on public.blog_posts to authenticated;
grant select, insert, update on public.notifications to authenticated;
grant select, insert on public.email_logs to authenticated;
grant select, insert, update on public.referrals to authenticated;
grant select, insert, update on public.credits to authenticated;
grant select, insert, update, delete on public.testimonials to authenticated;
grant select, insert, update on public.contact_messages to authenticated;
