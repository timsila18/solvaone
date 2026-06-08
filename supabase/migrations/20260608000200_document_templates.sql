create table if not exists public.document_templates (
  id text primary key,
  category text not null,
  products public.product_key[] not null default '{}'::public.product_key[],
  name text not null,
  description text not null,
  source_path text,
  preview_path text,
  file_type text not null,
  tags text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects
add column if not exists template_id text references public.document_templates(id);

alter table public.documents
add column if not exists template_id text references public.document_templates(id);

create index if not exists document_templates_category_idx on public.document_templates(category);
create index if not exists document_templates_products_idx on public.document_templates using gin(products);

create trigger set_document_templates_updated_at
before update on public.document_templates
for each row execute function public.set_updated_at();

alter table public.document_templates enable row level security;

create policy "Authenticated users can read active templates"
on public.document_templates for select
to authenticated
using (is_active = true);

create policy "Admins manage document templates"
on public.document_templates for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

grant select on public.document_templates to authenticated;

insert into public.document_templates (id, category, products, name, description, source_path, preview_path, file_type, tags)
values
  ('cv-professional-summary-clean', 'cv', array['cv_builder','cv_revamp']::public.product_key[], 'Professional Summary Clean', 'Compact professional summary DOCX template for quick CV profile generation.', 'templates/source/cv/professional-summary-17.docx', null, 'docx', array['cv','summary','professional']),
  ('cv-white-blue-minimalist', 'cv', array['cv_builder','cv_revamp']::public.product_key[], 'White and Blue Minimalist CV', 'Minimalist blue CV layout for professional and corporate roles.', 'templates/source/cv/white-blue-minimalist-cv.pdf', '/template-previews/cv/best-resume.webp', 'pdf', array['cv','minimalist','blue']),
  ('cv-blue-gray-simple', 'cv', array['cv_builder','cv_revamp']::public.product_key[], 'Blue and Gray Simple CV', 'Simple structured CV layout with balanced gray and blue sections.', 'templates/source/cv/blue-gray-simple-cv.pdf', '/template-previews/cv/business-resume.webp', 'pdf', array['cv','simple','blue','gray']),
  ('cv-black-white-minimalist', 'cv', array['cv_builder','cv_revamp']::public.product_key[], 'Black and White Minimalist CV', 'Clean monochrome CV reference for executive and formal applications.', 'templates/source/cv/black-white-minimalist-cv.pdf', '/template-previews/cv/supervisor-resume.webp', 'pdf', array['cv','minimalist','monochrome']),
  ('cv-hr-professional', 'cv', array['cv_builder','cv_revamp']::public.product_key[], 'HR Professional CV', 'Two-column HR CV reference with skills, certifications, and experience emphasis.', null, '/template-previews/cv/hr-resume.webp', 'webp', array['cv','hr','two-column']),
  ('cv-teacher-educator', 'cv', array['cv_builder','cv_revamp']::public.product_key[], 'Teacher Educator CV', 'Education-focused CV reference for teachers and training professionals.', null, '/template-previews/cv/teacher-resume.webp', 'webp', array['cv','teacher','education']),
  ('cv-medical-assistant', 'cv', array['cv_builder','cv_revamp']::public.product_key[], 'Medical Assistant CV', 'Healthcare CV reference with credentials and compliance-focused work history.', null, '/template-previews/cv/medical-assistant-resume.webp', 'webp', array['cv','medical','healthcare']),
  ('cv-data-engineer', 'cv', array['cv_builder','cv_revamp']::public.product_key[], 'Data Engineer CV', 'Technical CV reference for data engineering, analytics, and software roles.', null, '/template-previews/cv/data-engineer-resume.webp', 'webp', array['cv','technology','data']),
  ('business-plan-2021-2026', 'business_plan', array['business_plan']::public.product_key[], 'Five-Year Business Plan', 'Formal multi-year business plan reference for strategy and growth planning.', 'templates/source/business-plan/business-plan-2021-2026.pdf', null, 'pdf', array['business-plan','strategy','five-year']),
  ('business-plan-lean-wooden-grain', 'business_plan', array['business_plan']::public.product_key[], 'Lean Business Plan', 'Lean business plan structure for concise venture planning.', 'templates/source/business-plan/sample-lean-business-plan-wooden-grain-toy-company.doc', null, 'doc', array['business-plan','lean','startup']),
  ('business-plan-consulting', 'business_plan', array['business_plan']::public.product_key[], 'Consulting Business Plan', 'Service-business plan reference for consulting and advisory companies.', 'templates/source/business-plan/sample-business-plan-we-can-do-it-consulting.doc', null, 'doc', array['business-plan','consulting','services']),
  ('company-profile-kenya-airways', 'company_profile', array['company_profile']::public.product_key[], 'Aviation Company Profile', 'Corporate profile reference for large service and aviation companies.', 'templates/source/company-profile/kenya-airways-company-profile.pdf', null, 'pdf', array['company-profile','aviation','corporate']),
  ('company-profile-safaricom', 'company_profile', array['company_profile']::public.product_key[], 'Telecom Company Profile', 'Enterprise profile reference for telecom and technology-led companies.', 'templates/source/company-profile/safaricom-company-profile.pdf', null, 'pdf', array['company-profile','telecom','enterprise']),
  ('tender-request-for-proposal', 'tender_procurement', array['company_profile','business_plan']::public.product_key[], 'Request for Proposal', 'Standard procurement request-for-proposal template.', 'templates/source/tender-procurement/doc-05-request-for-proposal.docx', null, 'docx', array['tender','procurement','proposal']),
  ('tender-procurement-goods', 'tender_procurement', array['company_profile','business_plan']::public.product_key[], 'Procurement of Goods', 'Standard goods procurement template for tender responses.', 'templates/source/tender-procurement/doc-04-goods.docx', null, 'docx', array['tender','procurement','goods']),
  ('tender-request-for-quotations', 'tender_procurement', array['company_profile','business_plan']::public.product_key[], 'Request for Quotations', 'RFQ template for structured quotation-based procurement.', 'templates/source/tender-procurement/doc-21-request-for-quotations.docx', null, 'docx', array['tender','rfq','quotations']),
  ('invoice-modern', 'invoice', array['company_profile']::public.product_key[], 'Modern Invoice', 'Modern Word invoice template for business documents.', 'templates/source/invoice/modern-invoice-word.docx', null, 'docx', array['invoice','business','word']),
  ('invoice-letterhead', 'invoice', array['company_profile']::public.product_key[], 'Letterhead Invoice', 'Letterhead-style invoice template for company stationery packs.', 'templates/source/invoice/letterhead-invoice-word.docx', null, 'docx', array['invoice','letterhead','company-profile'])
on conflict (id) do update set
  category = excluded.category,
  products = excluded.products,
  name = excluded.name,
  description = excluded.description,
  source_path = excluded.source_path,
  preview_path = excluded.preview_path,
  file_type = excluded.file_type,
  tags = excluded.tags,
  is_active = true,
  updated_at = now();
