export const AI_DEPENDENT_TASKS = new Set([
  "process_cv", "match", "recovery_search", "review_matches", "prepare",
  "draft_answers", "resume_assisted"
]);

export function jobDeskAiEnabled() {
  return process.env.JOB_DESK_AI_MODE === "automatic";
}

export function isAiQuotaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /\b429\b|insufficient_quota|no credits remaining|billing quota|quota exceeded/i.test(message);
}
