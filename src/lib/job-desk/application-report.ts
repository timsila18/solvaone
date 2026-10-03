import { applicationProgress, blockerAction, reportEvidence, type DeliveryApplication, type ProgressMatch } from "./application-progress";

export type ReportMatch = ProgressMatch & {
  vacancy?: { title: string; company_name: string; apply_url?: string } | { title: string; company_name: string; apply_url?: string }[] | null;
};
export function reportTime(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not recorded";
  return new Date(value).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" }) + " EAT";
}

export function buildApplicationReport(matches: ReportMatch[]) {
  const progress = applicationProgress(matches);
  const lines = [`Application report: ${progress.suitable} openings; ${progress.ready} ready; ${progress.delivered} delivered emails; ${progress.confirmed} confirmed portal submissions; ${progress.blocked} blocked.`, "Prepared materials and provider acceptance are not proof of delivery or employer review."];
  for (const match of matches.filter(item => item.status !== "rejected")) {
    const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
    const application: DeliveryApplication | undefined | null = Array.isArray(match.application) ? match.application[0] : match.application;
    const evidence = reportEvidence(application, match.submitted_at);
    lines.push("", `${vacancy?.company_name ?? "Employer not recorded"} - ${vacancy?.title ?? "Role not recorded"}`, `Status: ${evidence.status}`, `Submission attempt: ${reportTime(evidence.attemptedAt)}`);
    if (evidence.deliveryAt) lines.push(`Delivery evidence recorded: ${reportTime(evidence.deliveryAt)}`);
    if (evidence.confirmation) lines.push(`Employer confirmation: ${evidence.confirmation}`);
    if (evidence.providerId) lines.push(`Email provider reference (not employer acknowledgement): ${evidence.providerId}`);
    if (application?.error_message) { const action = blockerAction(application.error_message); lines.push(`Next action: ${action.blocker}. ${action.action}`); }
    if (vacancy?.apply_url) lines.push(`Official application: ${vacancy.apply_url}`);
  }
  if (!matches.length) lines.push("", "No applications recorded yet. Vacancy discovery is not a submission.");
  return lines.join("\n");
}

export async function loadReportMatches(db: any, orderId: string): Promise<ReportMatch[]> {
  const { data, error } = await db.from("job_desk_matches").select("id,vacancy_id,status,cover_letter,submitted_at,vacancy:job_desk_vacancies(title,company_name,apply_url),application:job_desk_applications(status,method,provider_message_id,provider_response,error_message)").eq("order_id", orderId).order("created_at").limit(500);
  if (error) throw new Error("Application report evidence could not be loaded.");
  return data ?? [];
}
