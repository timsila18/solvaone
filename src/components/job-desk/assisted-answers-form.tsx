"use client";

import { useState } from "react";
import type { AssistedQuestion } from "@/lib/job-desk/assisted-answers";

export function AssistedAnswersForm({ token, questions }: { token: string; questions: AssistedQuestion[] }) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  if (saved) return <div role="status" className="mt-8 border-l-4 border-brand-blue p-4"><h2 className="font-bold">Answers saved</h2><p className="mt-2">{message}</p></div>;
  const factual = questions.filter(question => !question.officialStep);
  return <form className="mt-8 space-y-6" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const answers = Object.fromEntries(factual.map(question => [question.id, String(form.get(question.id) ?? "").trim()]).filter(([, answer]) => answer));
    try {
      const response = await fetch("/api/job-desk/answers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, answers, factual: form.get("factual") === "on" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save answers.");
      setSaved(true); setMessage(result.queued ? "The agent will recheck the affected applications. Any remaining official checks stay paused; saving answers is not submission confirmation." : "Your answers are saved. Job Desk needs to requeue the affected applications; no new payment is required.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not save answers."); }
    finally { setBusy(false); }
  }}>
    {questions.map(question => <section key={question.id} className="border-t border-black/15 pt-4"><h2 className="text-sm font-bold">{question.title} · {question.company}</h2>{question.officialStep ? <><p className="mt-2 whitespace-pre-wrap text-sm">{question.label}</p><p className="mt-2 text-sm">Complete this step through the employer or contact Job Desk. This form cannot complete it for you.</p>{question.url.startsWith("https://") ? <a href={question.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold text-brand-blue underline">Open official application</a> : null}</> : <label className="mt-3 block text-sm font-semibold">{question.label}<textarea name={question.id} maxLength={2000} rows={4} className="mt-2 w-full rounded border border-black/25 bg-white p-3 text-black" /></label>}</section>)}
    {factual.length ? <><p className="text-sm">Leave unknown facts blank. Do not include passwords, ID numbers or financial information.</p><label className="flex items-start gap-3 text-sm"><input type="checkbox" name="factual" required className="mt-1" />These answers are factual and have been confirmed by the applicant. I am the applicant or their authorized administrator.</label><button type="submit" disabled={busy} className="rounded bg-brand-blue px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? "Saving answers..." : "Save answers and recheck"}</button></> : null}
    {message ? <p role="alert" className="text-sm">{message}</p> : null}
  </form>;
}
