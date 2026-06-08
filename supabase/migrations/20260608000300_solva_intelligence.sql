create type public.ai_generation_status as enum ('queued', 'running', 'succeeded', 'failed');
create type public.document_change_type as enum ('autosave', 'generation', 'manual_edit', 'section_regeneration', 'section_improvement');

create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  product_type public.product_key not null,
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  model_used text not null,
  token_input integer not null default 0,
  token_output integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost numeric(12,6) not null default 0,
  status public.ai_generation_status not null default 'queued',
  error_message text,
  quality_scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  version_number integer not null,
  content jsonb not null default '{}'::jsonb,
  change_type public.document_change_type not null,
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

create table public.templates (
  id text primary key,
  product_type public.product_key not null,
  template_name text not null,
  template_style text not null,
  is_active boolean not null default true,
  content_schema jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.documents
add column if not exists structured_content jsonb not null default '{}'::jsonb,
add column if not exists quality_scores jsonb not null default '{}'::jsonb,
add column if not exists generation_status public.ai_generation_status not null default 'queued';

create index ai_generations_user_created_at_idx on public.ai_generations(user_id, created_at desc);
create index ai_generations_project_created_at_idx on public.ai_generations(project_id, created_at desc);
create index ai_generations_status_idx on public.ai_generations(status);
create index ai_generations_product_type_idx on public.ai_generations(product_type);
create index document_versions_document_version_idx on public.document_versions(document_id, version_number desc);
create index templates_product_type_idx on public.templates(product_type);

alter table public.ai_generations enable row level security;
alter table public.document_versions enable row level security;
alter table public.templates enable row level security;

create policy "Users read own ai generations"
on public.ai_generations for select
to authenticated
using (user_id = (select auth.uid()) or private.is_admin());

create policy "Users create own ai generations"
on public.ai_generations for insert
to authenticated
with check (user_id = (select auth.uid()) or private.is_admin());

create policy "Users update own ai generations"
on public.ai_generations for update
to authenticated
using (user_id = (select auth.uid()) or private.is_admin())
with check (user_id = (select auth.uid()) or private.is_admin());

create policy "Users read own document versions"
on public.document_versions for select
to authenticated
using (user_id = (select auth.uid()) or private.is_admin());

create policy "Users create own document versions"
on public.document_versions for insert
to authenticated
with check (user_id = (select auth.uid()) or private.is_admin());

create policy "Authenticated users read active templates"
on public.templates for select
to authenticated
using (is_active = true or private.is_admin());

create policy "Admins manage templates"
on public.templates for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

grant select, insert, update on public.ai_generations to authenticated;
grant select, insert on public.document_versions to authenticated;
grant select on public.templates to authenticated;

insert into public.templates (id, product_type, template_name, template_style, content_schema)
values
  ('cv-builder-graduate', 'cv_builder', 'Graduate CV', 'graduate', '{"sections":["personal_details","professional_summary","education","skills","projects","referees"]}'::jsonb),
  ('cv-builder-professional', 'cv_builder', 'Professional CV', 'professional', '{"sections":["personal_details","professional_summary","work_experience","education","skills","certifications","referees"]}'::jsonb),
  ('cv-builder-executive', 'cv_builder', 'Executive CV', 'executive', '{"sections":["personal_details","executive_summary","leadership_experience","work_experience","achievements","education","board_roles"]}'::jsonb),
  ('cv-builder-technical', 'cv_builder', 'Technical CV', 'technical', '{"sections":["personal_details","technical_summary","technical_skills","work_experience","projects","education","certifications"]}'::jsonb),
  ('cv-builder-public-service', 'cv_builder', 'Government/Public Service CV', 'public_service', '{"sections":["personal_details","career_objective","work_experience","public_service_competencies","education","certifications","referees"]}'::jsonb),
  ('cv-revamp-ats', 'cv_revamp', 'ATS Optimization', 'ats_optimization', '{"outputs":["revamped_cv","improvements","keywords","missing_information"]}'::jsonb),
  ('cover-letter-professional', 'cover_letter', 'Professional Application', 'professional_application', '{"sections":["salutation","opening","body","closing"]}'::jsonb),
  ('company-profile-tender-ready', 'company_profile', 'Tender-Ready Company Profile', 'tender_ready', '{"sections":["cover_page","overview","background","vision","mission","values","services","why_choose_us","team","projects","compliance","contacts"]}'::jsonb),
  ('business-plan-sme', 'business_plan', 'SME Business Plan', 'kenya_sme', '{"sections":["executive_summary","business_description","problem","solution","products","market","customers","competitors","marketing","operations","team","revenue","risks","financial_plan","roadmap","conclusion"]}'::jsonb)
on conflict (id) do update set
  product_type = excluded.product_type,
  template_name = excluded.template_name,
  template_style = excluded.template_style,
  content_schema = excluded.content_schema,
  is_active = true;
