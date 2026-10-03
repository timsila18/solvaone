import { deliveryStage, type DeliveryApplication } from './application-progress';

export function sourceDeliveryScore(applications: DeliveryApplication[]) {
  const counts = { delivered: 0, confirmed: 0, accepted: 0, blocked: 0 };
  for (const application of applications) {
    const stage = deliveryStage(application);
    if (stage in counts) counts[stage as keyof typeof counts]++;
  }
  return { ...counts, priority: (counts.delivered + counts.confirmed) * 10 - counts.blocked };
}
export async function loadSourceDelivery(db: any) {
  const { data, error } = await db.from('job_desk_applications').select('status,method,provider_message_id,provider_response,match:job_desk_matches(vacancy:job_desk_vacancies(source_id,provider))').order('created_at', { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  const groups = new Map<string, DeliveryApplication[]>();
  for (const application of data ?? []) {
    const match = Array.isArray(application.match) ? application.match[0] : application.match;
    const vacancy = Array.isArray(match?.vacancy) ? match.vacancy[0] : match?.vacancy;
    if (!vacancy) continue;
    const key = vacancy.source_id ?? vacancy.provider;
    groups.set(key, [...(groups.get(key) ?? []), application]);
  }
  return new Map([...groups].map(([key, applications]) => [key, sourceDeliveryScore(applications)]));
}
