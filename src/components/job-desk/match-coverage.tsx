import Link from "next/link";
import { AutomationControls } from "./automation-controls";

export function MatchCoverage({ result }: { result: unknown }) {
  const coverage = (result as { coverage?: Record<string, unknown> } | null)?.coverage;
  if (!coverage || typeof coverage.suitable !== "number") return null;
  const suitable = coverage.suitable;
  const supported = Number(coverage.supported ?? 0);
  const rejected = Array.isArray(coverage.rejectedExamples) ? coverage.rejectedExamples as Array<{ title: string; company: string; reason: string }> : [];
  return <section className="border-b border-black/10 py-5 dark:border-white/10" aria-label="Matching coverage">
    <h2 className="text-lg font-bold">Latest matching check</h2>
    <p className="mt-2 text-sm">{Number(coverage.recentApproved ?? 0)} recent approved listings · {Number(coverage.scopeEligible ?? 0)} within authorization · {suitable} suitable · {supported} supported submission candidates</p>
    <p className="mt-2 text-sm">Target: 10 suitable openings. {Number(coverage.evidenceCandidates ?? 0)} candidates reviewed against the CV and full advert requirements.</p>
    {rejected.length ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-bold">Why other roles were not selected</summary><ul className="mt-2 space-y-2">{rejected.map((item, index) => <li key={index}><strong>{item.title} · {item.company}</strong>: {item.reason}</li>)}</ul></details> : null}
    <p className="mt-2 text-sm">{suitable === 0 ? "No suitable vacancy found in the current catalogue. This is not a failed application." : supported === 0 ? "Suitable listings exist, but their submission route or score needs administrator review." : "Supported candidates still need final vacancy and required-answer checks before submission."}</p>
    {Number(coverage.refreshedSources ?? 0) > 0 ? <p className="mt-2 text-sm">{Number(coverage.refreshedSources)} stale sources queued for refresh; matching will rerun after import.</p> : null}
    <div className="mt-3 flex flex-wrap items-center gap-4"><AutomationControls action="refresh_all" label="Refresh vacancy sources" /><Link href="/dashboard/admin/job-desk/vacancies" className="text-sm font-bold text-brand-blue">Manage sources</Link></div>
  </section>;
}
