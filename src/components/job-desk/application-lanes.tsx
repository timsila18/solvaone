"use client";

import { useState } from "react";
import { applicationLane, type ApplicationLane } from "@/lib/job-desk/application-lane";

type Item = { id: string; title: string; company: string; status: string; outcome: string; reason?: string | null; application?: { status?: string; provider_response?: unknown } | null };
const labels: Record<ApplicationLane, string> = { automatic: "Automatic processing", review: "Admin answer review", assisted: "Human-only exceptions", confirmation: "Submission outcomes" };

export function ApplicationLanes({ items }: { items: Item[] }) {
  const [lane, setLane] = useState<ApplicationLane>("automatic");
  const selected = items.filter(item => applicationLane(item) === lane);
  return <section className="border-b border-black/10 pb-6 dark:border-white/10">
    <h2 className="text-xl font-black">Application pipeline</h2>
    <div role="tablist" aria-label="Application lanes" className="mt-4 flex flex-wrap gap-2">
      {(Object.keys(labels) as ApplicationLane[]).map(key => <button key={key} id={`lane-${key}`} type="button" role="tab" aria-selected={lane === key} aria-controls="application-lane-panel" onClick={() => setLane(key)} className={`rounded border px-3 py-2 text-sm font-semibold ${lane === key ? "border-brand-blue bg-brand-blue text-white" : "border-black/20 dark:border-white/20"}`}>{labels[key]} ({items.filter(item => applicationLane(item) === key).length})</button>)}
    </div>
    <div id="application-lane-panel" role="tabpanel" aria-labelledby={`lane-${lane}`} className="mt-4">
      <p className="text-sm text-black/60 dark:text-white/60">{lane === "automatic" ? "Ready processing takes priority, subject to payment, CV approval, recorded scope and current requirements." : lane === "review" ? "Review evidence-backed drafts below. Approve factual answers to restart automatic checks; official steps can still remain." : lane === "assisted" ? "Complete the employer's personal steps or verify an uncertain outcome. Ready applications continue independently." : "Check the recorded outcome before retrying. Provider acceptance is not confirmation that an employer reviewed the application."}</p>
      <div className="mt-3 divide-y divide-black/10 dark:divide-white/10">{selected.map(item => <div key={item.id} className="py-3"><span className="font-bold">{item.title}</span><p className="text-sm">{item.company} · {item.outcome}</p>{item.reason ? <p className="mt-1 whitespace-pre-wrap text-xs">{item.reason}</p> : null}</div>)}</div>
      {!selected.length ? <p className="mt-4 text-sm">No applications in this lane.</p> : null}
    </div>
  </section>;
}
