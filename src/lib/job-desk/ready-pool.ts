import { createHash } from 'node:crypto';
import { submissionPreflight } from './submission-preflight';
import { prohibitsAnswerDrafting } from './question-policy';
import { submissionHoldReason } from './matching';

export type Readiness = { version: number; state: 'ready' | 'assisted' | 'deferred'; checkedAt: string; fingerprint: string; blockers: string[] };
export type PoolVacancy = { id: string; provider?: string; source_id?: string | null; description: string; apply_url: string; application_method: string; email_verified: boolean; application_email: string | null; application_readiness?: unknown };
export type PoolSource = { active: boolean; provider: string; site_token: string };

export function requirementsFingerprint(vacancy: PoolVacancy, source?: PoolSource) {
  return createHash('sha256').update(JSON.stringify([2, vacancy.description, vacancy.apply_url, vacancy.application_method, vacancy.email_verified, vacancy.application_email, source?.provider, source?.site_token, source?.active])).digest('hex');
}
export function readReadiness(value: unknown): Readiness | null {
  const item = value as Readiness | null;
  return item?.version === 2 && ['ready', 'assisted', 'deferred'].includes(item.state) && typeof item.checkedAt === 'string' && typeof item.fingerprint === 'string' && Array.isArray(item.blockers) && item.blockers.every(x => typeof x === 'string') ? item : null;
}
export function cachedReadiness(vacancy: PoolVacancy, source?: PoolSource, now = Date.now()) {
  const item = readReadiness(vacancy.application_readiness);
  const age = item ? now - Date.parse(item.checkedAt) : NaN;
  return item && age >= 0 && age < (item.state === 'deferred' ? 15 * 60000 : 24 * 3600000) && item.fingerprint === requirementsFingerprint(vacancy, source) ? item : null;
}
export function poolRank(value: unknown) {
  const item = readReadiness(value);
  const age = item ? Date.now() - Date.parse(item.checkedAt) : NaN;
  if (!item || !Number.isFinite(age) || age < 0 || age >= 24 * 3600000) return 1;
  return item.state === 'ready' ? 3 : item.state === 'deferred' ? 1 : 0;
}

export async function inspectRequirements(vacancy: PoolVacancy, source?: PoolSource): Promise<Readiness> {
  const base = { version: 2, checkedAt: new Date().toISOString(), fingerprint: requirementsFingerprint(vacancy, source) };
  if (prohibitsAnswerDrafting(vacancy.description)) return { ...base, state: 'assisted', blockers: ['Employer requires applicant-written answers; automated drafting is prohibited.'] };
  if (vacancy.application_method === 'email') {
    const hold = submissionHoldReason(vacancy.description, 'probe@example.invalid', 10000);
    if (hold) return { ...base, state: 'assisted', blockers: [hold] };
    return { ...base, state: vacancy.email_verified && vacancy.application_email ? 'ready' : 'assisted', blockers: vacancy.email_verified && vacancy.application_email ? [] : ['Application email is not verified.'] };
  }
  if (!source?.active || !['greenhouse', 'lever'].includes(source.provider)) return { ...base, state: 'assisted', blockers: ['Unsupported application portal.'] };
  try {
    // Capability-only probe. These placeholders are never saved as client answers or submitted.
    const known = { first_name: 'Capability', last_name: 'Probe', email: 'probe@example.invalid', phone: '+254700000000', linkedin_profile: 'https://www.linkedin.com/in/capability-probe', website: 'https://example.invalid', current_location: 'Nairobi, Kenya', city: 'Nairobi', country_of_residence: 'Kenya', skills: 'Capability probe', professional_summary: 'Capability probe', employment_history: 'Capability probe', education_history: 'Capability probe' };
    const result = await submissionPreflight({ method: vacancy.application_method, provider: source.provider, siteToken: source.site_token, url: vacancy.apply_url, answers: '', known });
    return { ...base, state: result.ready ? 'ready' : 'assisted', blockers: result.blockers.slice(0, 40).map(x => x.slice(0, 500)) };
  } catch {
    return { ...base, state: 'deferred', blockers: ['Official application requirements temporarily unavailable; retry pending.'] };
  }
}

export async function refreshReadyPool(db: any, vacancies: PoolVacancy[], sources: Map<string, PoolSource>, maxChecks = 16) {
  let checked = 0;
  for (const vacancy of vacancies) {
    const source = sources.get(vacancy.source_id ?? '');
    if (cachedReadiness(vacancy, source)) continue;
    const networkCheck = vacancy.application_method === 'portal' && source?.active && ['greenhouse', 'lever'].includes(source.provider);
    if (networkCheck && checked >= maxChecks) continue;
    if (networkCheck) checked++;
    const readiness = await inspectRequirements(vacancy, source);
    const { data, error } = await db.from('job_desk_vacancies').update({ application_readiness: readiness }).eq('id', vacancy.id).eq('apply_url', vacancy.apply_url).eq('description', vacancy.description).select('id').maybeSingle();
    if (error) throw new Error(error.message);
    if (data) vacancy.application_readiness = readiness;
  }
  return checked;
}
