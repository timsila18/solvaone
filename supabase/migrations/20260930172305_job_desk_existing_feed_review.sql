-- Preserve match availability for recently synced official listings while new feeds are reviewed.
update public.job_desk_vacancies v
set review_status = 'approved'
from public.job_desk_sources s
where v.source_id = s.id
  and v.provider = 'greenhouse'
  and s.provider = 'greenhouse'
  and v.status = 'open'
  and v.review_status = 'needs_review'
  and v.last_seen_at >= now() - interval '72 hours'
  and length(v.description) >= 160
  and v.apply_url ~* '^https://(job-boards|boards)\.greenhouse\.io/'
  and lower(split_part(v.apply_url, '/', 4)) = lower(s.site_token)
  and v.description !~* 'application (fee|charge)|pay (a|an|the) (registration|processing|application) fee|send money|deposit to apply|apply (only |exclusively )?(via|through) (whatsapp|telegram)';
