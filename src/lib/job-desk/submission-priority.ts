export type SubmissionRoute = {
  provider?: string | null;
  application_method?: string | null;
  email_verified?: boolean | null;
  application_email?: string | null;
};

export function submissionRouteRank(vacancy: SubmissionRoute): number {
  if (vacancy.application_method === "email") {
    return vacancy.email_verified && vacancy.application_email?.trim() ? 2 : 0;
  }
  return vacancy.application_method === "portal" && ["greenhouse", "lever"].includes(vacancy.provider ?? "") ? 1 : 0;
}

export function compareSubmissionCandidates(
  a: { vacancy: SubmissionRoute; score: number },
  b: { vacancy: SubmissionRoute; score: number },
): number {
  return submissionRouteRank(b.vacancy) - submissionRouteRank(a.vacancy) || b.score - a.score;
}
