import { compareSubmissionCandidates, type SubmissionRoute } from "./submission-priority";

export const SHORTLIST_TARGET = 20;
export const APPLICATION_TARGET = 10;

export function rotatingReviewBatch<T>(candidates: T[], window: number, size = 10) {
  if (candidates.length <= size) return candidates;
  const offset = (window % Math.ceil(candidates.length / size)) * size;
  return candidates.slice(offset, offset + size);
}

type Application = { status: string; provider_message_id?: string | null; provider_response?: unknown };
export function occupiesApplicationSlot(match: { id: string; status: string; application?: Application | Application[] | null }, queuedPreparation: Set<string | undefined>) {
  const applications = Array.isArray(match.application) ? match.application : match.application ? [match.application] : [];
  if (applications.length) return applications.some(application => {
    const response = application.provider_response as { confirmation?: string; clicked?: boolean; delivery?: { event?: string } } | null;
    const failedDelivery = ["email.bounced", "email.failed", "email.complained"].includes(response?.delivery?.event ?? "");
    return application.status === "sending" || (application.status === "submitted" && !failedDelivery && Boolean(application.provider_message_id || response?.confirmation)) || (application.status === "needs_human" && response?.clicked !== false);
  });
  return ["preparing", "ready", "authorized"].includes(match.status) || queuedPreparation.has(match.id);
}

export function reviewedShortlist<T extends { score: number; vacancy: SubmissionRoute & { id: string } }>(candidates: T[]) {
  const seen = new Set<string>();
  return [...candidates].sort(compareSubmissionCandidates).filter(item => {
    if (seen.has(item.vacancy.id)) return false;
    seen.add(item.vacancy.id);
    return true;
  }).slice(0, SHORTLIST_TARGET);
}

export function screeningBatch<T>(candidates: T[], window: number) {
  if (candidates.length <= 64) return candidates;
  // Reserve most checks for fresh alternatives rather than repeatedly blocked top forms.
  const offset = 16 + (window % Math.ceil((candidates.length - 16) / 48)) * 48;
  return [...candidates.slice(0, 16), ...candidates.slice(offset, offset + 48)];
}
