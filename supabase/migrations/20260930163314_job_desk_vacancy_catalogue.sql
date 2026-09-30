alter table public.job_desk_sources drop constraint job_desk_sources_provider_check;
alter table public.job_desk_sources add constraint job_desk_sources_provider_check check (provider in ('greenhouse', 'lever', 'ashby', 'smartrecruiters'));

alter table public.job_desk_vacancies drop constraint job_desk_vacancies_provider_check;
alter table public.job_desk_vacancies add constraint job_desk_vacancies_provider_check check (provider in ('greenhouse', 'lever', 'ashby', 'smartrecruiters', 'manual'));
alter table public.job_desk_vacancies add column review_status text not null default 'needs_review' check (review_status in ('approved', 'needs_review', 'rejected'));
alter table public.job_desk_vacancies add column review_reasons text[] not null default '{}';
alter table public.job_desk_vacancies add column duplicate_of uuid references public.job_desk_vacancies(id) on delete set null;
create index job_desk_vacancies_matchable_idx on public.job_desk_vacancies(last_seen_at desc) where status = 'open' and review_status = 'approved' and duplicate_of is null;

insert into public.job_desk_sources(provider, site_token, company_name) values
  ('greenhouse', 'gitlab', 'GitLab'),
  ('greenhouse', 'canonical', 'Canonical'),
  ('lever', 'binance', 'Binance'),
  ('ashby', 'lilt-production', 'LILT'),
  ('smartrecruiters', 'WatuCreditLtd', 'Watu Credit'),
  ('smartrecruiters', 'Assent', 'Assent'),
  ('smartrecruiters', 'StratostaffEALimited', 'Stratostaff EA')
on conflict (provider, site_token) do nothing;
