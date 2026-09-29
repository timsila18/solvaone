create table if not exists public.job_desk_clients (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.users(id) on delete restrict,
  linked_user_id uuid references public.users(id) on delete set null,
  full_name text not null,
  whatsapp_phone text not null,
  email text,
  source text not null default 'whatsapp' check (source in ('whatsapp', 'tiktok', 'website', 'referral', 'other')),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  consent_to_process boolean not null default false,
  consent_notes text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_desk_candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.job_desk_clients(id) on delete cascade,
  target_job_titles text[] not null default '{}',
  preferred_industries text[] not null default '{}',
  preferred_locations text[] not null default '{}',
  employment_types text[] not null default '{}',
  remote_preference text not null default 'flexible' check (remote_preference in ('onsite', 'hybrid', 'remote', 'flexible')),
  experience_level text,
  salary_expectation text,
  job_search_notes text,
  structured_profile jsonb not null default '{}'::jsonb,
  completeness_score integer not null default 0 check (completeness_score between 0 and 100),
  last_extracted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_desk_orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.job_desk_clients(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete restrict,
  assigned_to uuid references public.users(id) on delete set null,
  service_type text not null default 'job_search_full' check (service_type in ('cv_revamp', 'cv_build', 'job_search_full')),
  status text not null default 'intake' check (status in ('intake', 'awaiting_information', 'cv_processing', 'cv_review', 'approved', 'active', 'paused', 'completed', 'cancelled', 'failed')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partially_paid', 'paid', 'waived', 'refunded')),
  payment_method text check (payment_method in ('mpesa', 'cash', 'bank', 'manual', 'other')),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  currency text not null default 'KES',
  payment_reference text,
  paid_at timestamptz,
  source_channel text not null default 'whatsapp',
  instructions text,
  application_authorized boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_desk_intake_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.job_desk_orders(id) on delete cascade,
  client_id uuid not null references public.job_desk_clients(id) on delete cascade,
  uploaded_by uuid not null references public.users(id) on delete restrict,
  storage_path text not null unique,
  file_name text not null,
  file_size bigint not null check (file_size >= 0),
  content_type text not null,
  extracted_text text not null default '',
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'succeeded', 'needs_text', 'failed')),
  extraction_warning text,
  created_at timestamptz not null default now()
);

create table if not exists public.job_desk_ai_runs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.job_desk_orders(id) on delete cascade,
  initiated_by uuid not null references public.users(id) on delete restrict,
  operation text not null check (operation in ('cv_intake_and_revamp', 'cv_revision', 'profile_refresh')),
  input_fingerprint text not null,
  model_used text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  token_input integer not null default 0,
  token_output integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost numeric(12,6) not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, operation, input_fingerprint)
);

create table if not exists public.job_desk_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.job_desk_orders(id) on delete cascade,
  client_id uuid not null references public.job_desk_clients(id) on delete cascade,
  ai_run_id uuid references public.job_desk_ai_runs(id) on delete set null,
  document_type text not null check (document_type in ('revamped_cv', 'questionnaire', 'cover_letter', 'application_report')),
  title text not null,
  structured_content jsonb not null default '{}'::jsonb,
  html text not null default '',
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'superseded')),
  version integer not null default 1,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, document_type, version)
);

create table if not exists public.job_desk_questionnaires (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.job_desk_orders(id) on delete cascade,
  client_id uuid not null references public.job_desk_clients(id) on delete cascade,
  questions jsonb not null default '[]'::jsonb,
  responses jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'sent', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_desk_tasks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.job_desk_orders(id) on delete cascade,
  task_type text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'paused', 'cancelled')),
  deduplication_key text unique,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_desk_clients_created_idx on public.job_desk_clients(created_at desc);
create index if not exists job_desk_clients_phone_idx on public.job_desk_clients(whatsapp_phone);
create index if not exists job_desk_orders_status_created_idx on public.job_desk_orders(status, created_at desc);
create index if not exists job_desk_orders_client_idx on public.job_desk_orders(client_id, created_at desc);
create index if not exists job_desk_ai_runs_order_idx on public.job_desk_ai_runs(order_id, created_at desc);
create index if not exists job_desk_documents_order_idx on public.job_desk_documents(order_id, created_at desc);
create index if not exists job_desk_tasks_ready_idx on public.job_desk_tasks(status, available_at) where status = 'queued';

create trigger set_job_desk_clients_updated_at before update on public.job_desk_clients for each row execute function public.set_updated_at();
create trigger set_job_desk_profiles_updated_at before update on public.job_desk_candidate_profiles for each row execute function public.set_updated_at();
create trigger set_job_desk_orders_updated_at before update on public.job_desk_orders for each row execute function public.set_updated_at();
create trigger set_job_desk_documents_updated_at before update on public.job_desk_documents for each row execute function public.set_updated_at();
create trigger set_job_desk_questionnaires_updated_at before update on public.job_desk_questionnaires for each row execute function public.set_updated_at();
create trigger set_job_desk_tasks_updated_at before update on public.job_desk_tasks for each row execute function public.set_updated_at();

alter table public.job_desk_clients enable row level security;
alter table public.job_desk_candidate_profiles enable row level security;
alter table public.job_desk_orders enable row level security;
alter table public.job_desk_intake_files enable row level security;
alter table public.job_desk_ai_runs enable row level security;
alter table public.job_desk_documents enable row level security;
alter table public.job_desk_questionnaires enable row level security;
alter table public.job_desk_tasks enable row level security;

create policy "Admins manage Job Desk clients" on public.job_desk_clients for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins manage Job Desk profiles" on public.job_desk_candidate_profiles for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins manage Job Desk orders" on public.job_desk_orders for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins manage Job Desk intake files" on public.job_desk_intake_files for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins manage Job Desk AI runs" on public.job_desk_ai_runs for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins manage Job Desk documents" on public.job_desk_documents for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins manage Job Desk questionnaires" on public.job_desk_questionnaires for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "Admins manage Job Desk tasks" on public.job_desk_tasks for all to authenticated using (private.is_admin()) with check (private.is_admin());

grant select, insert, update, delete on public.job_desk_clients to authenticated;
grant select, insert, update, delete on public.job_desk_candidate_profiles to authenticated;
grant select, insert, update, delete on public.job_desk_orders to authenticated;
grant select, insert, update, delete on public.job_desk_intake_files to authenticated;
grant select, insert, update, delete on public.job_desk_ai_runs to authenticated;
grant select, insert, update, delete on public.job_desk_documents to authenticated;
grant select, insert, update, delete on public.job_desk_questionnaires to authenticated;
grant select, insert, update, delete on public.job_desk_tasks to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-desk-intake',
  'job-desk-intake',
  false,
  10485760,
  array['text/plain', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins upload Job Desk files" on storage.objects for insert to authenticated with check (bucket_id = 'job-desk-intake' and private.is_admin());
create policy "Admins read Job Desk files" on storage.objects for select to authenticated using (bucket_id = 'job-desk-intake' and private.is_admin());
create policy "Admins update Job Desk files" on storage.objects for update to authenticated using (bucket_id = 'job-desk-intake' and private.is_admin()) with check (bucket_id = 'job-desk-intake' and private.is_admin());
create policy "Admins delete Job Desk files" on storage.objects for delete to authenticated using (bucket_id = 'job-desk-intake' and private.is_admin());
