import { applicationDeliveryCounts, applicationProgress, type DeliveryApplication, type ProgressMatch } from "@/lib/job-desk/application-progress";
import { APPLICATION_TARGET } from "@/lib/job-desk/match-shortlist";

export function ClientProgress({ matches, shortlist = [], applications }: { matches: ProgressMatch[]; shortlist?: { id: string }[]; applications?: DeliveryApplication[] }) {
  const progress = { ...applicationProgress(matches, shortlist), ...(applications ? applicationDeliveryCounts(applications) : {}) };
  const submitted = progress.accepted + progress.delivered + progress.confirmed;
  return <section aria-label="Client application progress" className="border-y border-black/10 py-5 dark:border-white/10">
    <h2 className="text-lg font-black">Application progress</h2>
    <p className="mt-2 text-xl font-bold text-brand-blue">{submitted}/{APPLICATION_TARGET} submitted applications</p>
    <progress aria-label="Submitted application target" value={Math.min(APPLICATION_TARGET, submitted)} max={APPLICATION_TARGET} className="mt-2 h-2 w-full accent-brand-blue" />
    <p role="status" className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-sm font-bold">
      <span>{progress.suitable} suitable openings</span><span aria-hidden="true">→</span>
      <span>{progress.ready} ready</span><span aria-hidden="true">→</span>
      <span>{progress.accepted} emails sent, delivery unconfirmed</span><span aria-hidden="true">→</span>
      <span>{progress.delivered} email deliveries</span><span aria-hidden="true">→</span>
      <span>{progress.confirmed} confirmed portal submissions</span><span aria-hidden="true">→</span>
      <span>{progress.blocked} blocked</span>
    </p>
    <p className="mt-2 text-xs text-black/60 dark:text-white/60">{progress.processing} preparing or awaiting confirmation. Sent emails count as submitted; delivery and employer review remain separate.</p>
    {!submitted ? <p className="mt-2 text-sm font-semibold text-brand-blue">First submitted application priority</p> : null}
  </section>;
}
