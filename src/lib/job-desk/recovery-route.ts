import { canRetrySubmission } from './submission-preflight';

export function recoverableSubmission(application: { status?: string; provider_response?: unknown; error_message?: string | null }, vacancy: { application_method?: string; email_verified?: boolean; application_email?: string | null }, source: { active?: boolean; provider?: string } | null) {
  if (!canRetrySubmission(application)) return false;
  const reason = application.error_message ?? '';
  if (!/unsupported portal|could not be verified|could not be checked|configure.*sender/i.test(reason)) return false;
  if (vacancy.application_method === 'email') return Boolean(vacancy.email_verified && vacancy.application_email);
  return vacancy.application_method === 'portal' && Boolean(source?.active && ['greenhouse', 'lever'].includes(source.provider ?? ''));
}
