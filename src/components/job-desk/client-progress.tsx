import { applicationProgress, type ProgressMatch } from "@/lib/job-desk/application-progress";

export function ClientProgress({ matches, shortlist = [] }: { matches: ProgressMatch[]; shortlist?: { id: string }[] }) {
  const progress = applicationProgress(matches, shortlist);
  return <section aria-label="Client application progress" className="border-y border-black/10 py-5 dark:border-white/10">
    <h2 className="text-lg font-black">Application progress</h2>
    <p role="status" className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-sm font-bold">
      <span>{progress.suitable} suitable openings</span><span aria-hidden="true">→</span>
      <span>{progress.ready} ready</span><span aria-hidden="true">→</span>
      <span>{progress.delivered} email deliveries</span><span aria-hidden="true">→</span>
      <span>{progress.confirmed} confirmed portal submissions</span><span aria-hidden="true">→</span>
      <span>{progress.blocked} blocked</span>
    </p>
    <p className="mt-2 text-xs text-black/60 dark:text-white/60">{progress.accepted} emails accepted, awaiting delivery evidence · {progress.processing} preparing or awaiting confirmation. Prepared materials are not submitted applications.</p>
    {!progress.delivered && !progress.confirmed ? <p className="mt-2 text-sm font-semibold text-brand-blue">First successful application priority</p> : null}
  </section>;
}
