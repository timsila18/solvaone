"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RefreshCw, Sparkles } from "lucide-react";
import type { AnswerDraftPacket } from "@/lib/job-desk/answer-drafts";

type Item = { id: string; title: string; company: string };
type Run = { status: string; input_payload?: { matchId?: string; cvId?: string }; output_payload?: AnswerDraftPacket; error_message?: string };
export function AnswerDraftReview({ orderId, cvId, items }: { orderId: string; cvId: string; items: Item[] }) {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const endpoint = `/api/admin/job-desk/orders/${orderId}/answer-drafts`;
  useEffect(() => {
    let active = true;
    setRuns([]); setEdits({}); setConfirmed({});
    fetch(endpoint, { cache: "no-store" }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (active) setRuns(data.runs); }).catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [endpoint, cvId]);
  async function refresh() {
    setBusy(true); setConfirmed({});
    try { const response = await fetch(endpoint, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setRuns(data.runs); setMessage("Draft status refreshed."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not refresh drafts."); }
    finally { setBusy(false); }
  }
  async function act(item: Item, packet?: AnswerDraftPacket) {
    setBusy(true); setMessage("");
    try {
      const answers = packet ? Object.fromEntries(packet.answers.map(answer => [answer.question, edits[item.id]?.[answer.question] ?? answer.answer]).filter(([, answer]) => answer.trim())) : undefined;
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(packet ? { action: "approve", matchId: item.id, fingerprint: packet.fingerprint, factual: confirmed[item.id], answers } : { action: "draft", matchId: item.id }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setMessage(data.message); if (packet) { setConfirmed(value => ({ ...value, [item.id]: false })); router.refresh(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not process answers."); }
    finally { setBusy(false); }
  }
  if (!items.length) return null;
  return <section className="border-b border-black/10 pb-6 dark:border-white/10">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Answer drafts awaiting your review</h2><button type="button" onClick={refresh} disabled={busy} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm"><RefreshCw size={16} />Refresh drafts</button></div>
    <p className="mt-2 text-sm">Check each answer against the approved CV or verified client information. Blank answers need facts; official employer steps remain separate.</p>
    {items.map(item => {
      const run = runs.find(value => value.input_payload?.matchId === item.id && value.input_payload?.cvId === cvId);
      const packet = run?.status === "succeeded" ? run.output_payload : undefined;
      return <div key={item.id} className="mt-5 border-t border-black/10 pt-4 dark:border-white/10"><h3 className="font-bold">{item.title}</h3><p className="text-sm">{item.company}</p>
        {!packet ? <><p className="mt-2 text-sm">{run?.status === "running" ? "Drafting in progress. Refresh shortly." : "No current drafts yet."}</p><button type="button" disabled={busy || run?.status === "running"} onClick={() => act(item)} className="mt-3 inline-flex items-center gap-2 rounded border border-brand-blue px-3 py-2 text-sm font-bold text-brand-blue"><Sparkles size={16} />Prepare answer drafts</button></> : <>
          {packet.answers.map((answer, index) => <div key={answer.question} className="mt-4"><label htmlFor={`draft-${item.id}-${index}`} className="block text-sm font-semibold">{answer.question}</label><textarea id={`draft-${item.id}-${index}`} maxLength={2000} rows={4} value={edits[item.id]?.[answer.question] ?? answer.answer} onChange={event => { const value = event.target.value; setEdits(previous => ({ ...previous, [item.id]: { ...previous[item.id], [answer.question]: value } })); setConfirmed(previous => ({ ...previous, [item.id]: false })); }} className="mt-2 w-full rounded border border-black/20 bg-transparent p-3 text-sm dark:border-white/20" />
            {answer.missing ? <p className="mt-1 text-sm font-semibold">Fact needed: {answer.missing}</p> : null}
            {answer.evidence.length ? <details className="mt-1 text-sm"><summary className="cursor-pointer">Supporting CV facts</summary>{answer.evidence.map((quote, i) => <blockquote key={i} className="mt-2 border-l-2 border-brand-blue pl-3">{quote}</blockquote>)}</details> : null}
          </div>)}
          <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed[item.id] ?? false} onChange={event => setConfirmed(previous => ({ ...previous, [item.id]: event.target.checked }))} />I verified every nonempty answer and approve its use for this application.</label>
          <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={busy || !confirmed[item.id]} onClick={() => act(item, packet)} className="inline-flex items-center gap-2 rounded bg-brand-blue px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Check size={16} />Approve answers and continue</button><button type="button" disabled={busy} onClick={() => act(item)} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm"><Sparkles size={16} />Prepare fresh drafts</button></div>
        </>}
        {run?.error_message ? <p className="mt-2 text-sm" role="alert">{run.error_message}</p> : null}
      </div>;
    })}
    <p role="status" aria-live="polite" className="mt-3 text-sm">{busy ? "Processing..." : message}</p>
  </section>;
}
