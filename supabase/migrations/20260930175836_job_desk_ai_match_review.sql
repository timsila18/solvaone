alter table public.job_desk_ai_runs drop constraint job_desk_ai_runs_operation_check;
alter table public.job_desk_ai_runs add constraint job_desk_ai_runs_operation_check
  check (operation in ('cv_intake_and_revamp', 'cv_revision', 'profile_refresh', 'match_cover_letter', 'match_relevance'));
