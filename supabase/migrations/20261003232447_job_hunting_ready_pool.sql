alter table public.job_desk_vacancies add column if not exists application_readiness jsonb;
comment on column public.job_desk_vacancies.application_readiness is 'Public employer requirements only; never candidate answers or submission evidence.';
create index if not exists job_desk_vacancies_readiness_idx
on public.job_desk_vacancies ((application_readiness->>'state'), last_seen_at desc)
where status = 'open' and review_status = 'approved' and duplicate_of is null;
