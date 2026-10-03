import Link from "next/link";
import { AutomationControls } from "./automation-controls";

export function MatchCoverage({ result }: { result: unknown }) {
  const coverage = (result as { coverage?: Record<string, unknown> } | null)?.coverage;
  if (!coverage || typeof coverage.suitable !== "number") return null;
  const suitable = coverage.suitable;
  const supported = Number(coverage.supported ?? 0);
  const filters = Array.isArray(coverage.filterReasons) ? coverage.filterReasons as Array<{ reason: string; count: number }> : [];
  const scope = coverage.searchScope as { roles?: string[]; locations?: string[]; arrangement?: string } | undefined;
  const shortlist = Array.isArray(coverage.shortlist) ? coverage.shortlist as Array<{ id: string; title: string; company: string; score: number; selected: boolean; reasons: string[] }> : [];
  const rejected = Array.isArray(coverage.rejectedExamples) ? coverage.rejectedExamples as Array<{ title: string; company: string; reason: string }> : [];
  const skipped = Array.isArray(coverage.skippedExamples) ? coverage.skippedExamples as Array<{ title: string; company: string; reason: string }> : [];
  return <section className="border-b border-black/10 py-5 dark:border-white/10" aria-label="Matching coverage">
    <h2 className="text-lg font-bold">Latest matching check</h2>
    {scope && <p className="mt-2 text-sm font-bold">Searching: {scope.roles?.join(", ")} · {scope.locations?.join(", ")} · {scope.arrangement}</p>}
    <p className="mt-2 text-sm">{Number(coverage.recentApproved ?? 0)} recent approved listings · {Number(coverage.scopeEligible ?? 0)} within authorization · {suitable} suitable · {supported} supported submission candidates</p>
    <p className="mt-2 text-sm">Target: {Number(coverage.shortlistTarget ?? 20)} reviewed shortlist matches, then {Number(coverage.target ?? 10)} applications. {Number(coverage.evidenceCandidates ?? 0)} candidates reviewed against the CV and full advert requirements.</p>
    {typeof coverage.rankingEligible === "number" && <p className="mt-2 text-sm">{coverage.rankingEligible} passed location, experience and role-evidence checks · {Number(coverage.alreadyHandled ?? 0)} already being handled. Catalogue totals are not client matches.</p>}
    {filters.length > 0 && <div className="mt-3 text-sm"><h3 className="font-bold">What is narrowing this search</h3><ul className="mt-2 space-y-2">{filters.map(item => <li key={item.reason}>{item.count} listings: {item.reason}</li>)}</ul><p className="mt-2">Next action: review the agreed locations and role choices below. Remote does not mean worldwide; country-restricted adverts cannot be submitted as Kenya-eligible jobs.</p></div>}
    {typeof coverage.selectedForPreparation === "number" ? <p className="mt-2 text-sm">{coverage.selectedForPreparation} selected for preparation · {Number(coverage.committedSlots ?? 0)} existing completed, in-progress or uncertain application slots. Preparation is not submission confirmation.</p> : null}
    {shortlist.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer font-bold">Reviewed shortlist ({shortlist.length})</summary><ul className="mt-2 divide-y divide-black/10 dark:divide-white/10">{shortlist.map(item => <li key={item.id} className="py-3"><strong>{item.title} · {item.company}</strong><p>{item.score}% relevance score · {item.selected ? "Selected for preparation" : "Backup match"}</p><p className="mt-1 text-black/55 dark:text-white/55">{item.reasons.join(" · ")}</p></li>)}</ul></details>}
    {typeof coverage.automaticScreened === "number" ? <p className="mt-2 text-sm">{Number(coverage.automaticSkipped ?? 0)} forms need answers or requirement checks · {Number(coverage.assistedPackets ?? 0)} suitable opportunities queued for assisted packets. Unsupported portals never enter automatic submission.</p> : null}
    {skipped.length ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-bold">Skipped automatic applications</summary><ul className="mt-2 space-y-2">{skipped.map((item, index) => <li key={index}><strong>{item.title} · {item.company}</strong>: {item.reason}</li>)}</ul></details> : null}
    {rejected.length ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-bold">Why other roles were not selected</summary><ul className="mt-2 space-y-2">{rejected.map((item, index) => <li key={index}><strong>{item.title} · {item.company}</strong>: {item.reason}</li>)}</ul></details> : null}
    <p className="mt-2 text-sm">{suitable === 0 ? "No suitable, automatically completable vacancy found in the current catalogue. No application was sent from this matching check. Official recruiter-email discovery and source refresh continue in the background." : supported === 0 ? "Suitable listings exist, but their submission route needs administrator review." : typeof coverage.automaticScreened === "number" ? "Eligible applications passed required-answer screening. Final checks still run immediately before submission." : "Supported candidates were identified; required-answer screening still needs to run."}</p>
    {Number(coverage.refreshedSources ?? 0) > 0 ? <p className="mt-2 text-sm">{Number(coverage.refreshedSources)} stale sources queued for refresh; matching will rerun after import.</p> : null}
    <div className="mt-3 flex flex-wrap items-center gap-4"><AutomationControls action="refresh_all" label="Refresh vacancy sources" /><Link href="/dashboard/admin/job-desk/vacancies" className="text-sm font-bold text-brand-blue">Manage sources</Link></div>
  </section>;
}
