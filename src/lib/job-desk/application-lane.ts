import { draftableQuestions, prohibitsAnswerDrafting } from "./question-policy";
export type ApplicationLane = "automatic" | "review" | "assisted" | "confirmation";

type Application = { status?: string; provider_response?: unknown };
export function applicationLane(match: { status: string; application?: Application | null }): ApplicationLane {
  const application = match.application;
  const evidence = application?.provider_response as { clicked?: boolean; preflight?: { blockers?: string[] } } | null;
  // An uncertain send must never enter an automatic retry lane.
  if (application?.status === "sending" || application?.status === "submitted" || evidence?.clicked === true || match.status === "submitted") return "confirmation";
  const blockers = evidence?.preflight?.blockers ?? [];
  if (match.status === "needs_human" && evidence?.clicked === false && blockers.length && !prohibitsAnswerDrafting(blockers.join(" ")) && draftableQuestions(blockers).length) return "review";
  if (match.status === "needs_human" || application?.status === "needs_human" || application?.status === "failed" || match.status === "ready") return "assisted";
  return ["suggested", "preparing", "authorized"].includes(match.status) ? "automatic" : "assisted";
}
