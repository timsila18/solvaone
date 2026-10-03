export type DeliveryApplication = {
  match_id?: string;
  status?: string; method?: string; provider_message_id?: string | null;
  provider_response?: unknown; error_message?: string | null;
};
export type ProgressMatch = {
  id: string; status: string; vacancy_id?: string; cover_letter?: string | null;
  submitted_at?: string | null; application?: DeliveryApplication | DeliveryApplication[] | null;
};

export function deliveryStage(application?: DeliveryApplication | null) {
  const evidence = application?.provider_response as { confirmation?: string; delivery?: { event?: string } } | null;
  const event = evidence?.delivery?.event;
  if (["email.bounced", "email.failed", "email.complained"].includes(event ?? "")) return "blocked";
  if (application?.status === "submitted" && event === "email.delivered") return "delivered";
  if (application?.status === "submitted" && application.method !== "email" && !application.provider_message_id && evidence?.confirmation?.trim()) return "confirmed";
  if (application?.status === "submitted" && application.provider_message_id) return "accepted";
  if (application?.status === "sending" || application?.status === "submitted") return "processing";
  if (["needs_human", "failed"].includes(application?.status ?? "")) return "blocked";
  return "none";
}

export function successfulDelivery(application?: DeliveryApplication | null) {
  return ["delivered", "confirmed"].includes(deliveryStage(application));
}

export function distinctSuccessfulDeliveries(applications: DeliveryApplication[]) {
  return new Set(applications.filter(successfulDelivery).filter(application => application.match_id).map(application => application.match_id)).size;
}

export function applicationProgress(matches: ProgressMatch[], shortlist: { id: string }[] = []) {
  const result = { suitable: 0, ready: 0, delivered: 0, confirmed: 0, blocked: 0, accepted: 0, processing: 0 };
  const vacancies = new Set(shortlist.map(item => item.id));
  const seen = new Set<string>();
  for (const match of matches) {
    if (match.status === "rejected" || seen.has(match.vacancy_id ?? match.id)) continue;
    seen.add(match.vacancy_id ?? match.id);
    vacancies.add(match.vacancy_id ?? match.id);
    const application = Array.isArray(match.application) ? match.application[0] : match.application;
    const stage = deliveryStage(application);
    if (stage !== "none") result[stage]++;
    else if (match.status === "needs_human") result.blocked++;
    else if (match.cover_letter && ["ready", "authorized"].includes(match.status)) result.ready++;
    else if (["suggested", "preparing", "authorized"].includes(match.status)) result.processing++;
  }
  result.suitable = vacancies.size;
  return result;
}

export function blockerAction(reason: string | null | undefined) {
  const text = reason ?? "";
  if (/unsupported portal|prepared admin application packet/i.test(text)) return { blocker: "Unsupported portal", action: "Open the application packet, attach the CV and tailored letter, then record the employer confirmation." };
  if (/captcha|identity|assessment|personal.*step/i.test(text)) return { blocker: "Official human step", action: "Complete the employer's official check; keep the prepared packet ready. Do not mark submitted until confirmed." };
  if (/unanswered|missing.*answer|preflight:/i.test(text)) return { blocker: "Missing factual answer", action: "Review the saved answers and evidence-backed drafts, then recheck. Do not guess personal facts." };
  if (/sender|resend|403|401|api key/i.test(text)) return { blocker: "Email configuration", action: "Check the verified sender and email-provider access, then retry only if no send was attempted." };
  if (/closed|expired|stale|no longer/i.test(text)) return { blocker: "Vacancy no longer current", action: "Refresh matching for a replacement; do not send to this listing." };
  if (/approval|approve|newer cv/i.test(text)) return { blocker: "CV approval needed", action: "Review and approve the latest CV before restarting applications." };
  if (/bounced|delivery problem|delivery failed/i.test(text)) return { blocker: "Email delivery problem", action: "Verify the recipient against the advert and review delivery evidence before retrying." };
  return { blocker: "Administrator review needed", action: "Check the application packet and previous attempt for evidence before retrying or recording a manual submission." };
}

export function reportEvidence(application: DeliveryApplication | null | undefined, submittedAt?: string | null) {
  const stage = deliveryStage(application);
  const evidence = application?.provider_response as { confirmation?: string; delivery?: { event?: string; at?: string; observedAt?: string } } | null;
  return {
    status: stage === "delivered" ? "Delivered to employer mail server (not employer review)" : stage === "confirmed" ? "Confirmed portal submission" : stage === "accepted" ? "Email provider accepted; delivery not confirmed" : stage === "processing" ? "Attempt awaiting confirmation" : stage === "blocked" ? "Blocked; not confirmed submitted" : "Prepared or shortlisted; not submitted",
    attemptedAt: submittedAt ?? null,
    deliveryAt: stage === "delivered" ? evidence?.delivery?.at ?? null : null,
    confirmation: stage === "confirmed" ? evidence?.confirmation ?? null : null,
    providerId: application?.provider_message_id ?? null
  };
}
