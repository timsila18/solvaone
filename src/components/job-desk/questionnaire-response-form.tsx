"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { mergeQuestionDrafts, type QuestionDraft } from "@/lib/job-desk/questionnaire-drafts";

type Question = { id: string; category: string; question: string; reason: string; required?: boolean };

export function QuestionnaireResponseForm({ orderId, questions, responses, drafts = {} }: { orderId: string; questions: Question[]; responses: Record<string, string>; drafts?: Record<string,QuestionDraft> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [answers, setAnswers] = useState(() => mergeQuestionDrafts(questions,responses,drafts));

  async function saveAndProcess(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const answers = Object.fromEntries(questions.map((question) => [question.id, String(formData.get(question.id) ?? "").trim()]));
      if (!questions.some((question) => answers[question.id] && answers[question.id] !== (responses[question.id] ?? "").trim())) {
        throw new Error("Add at least one new client answer before updating the CV.");
      }
      const saved = await fetch(`/api/admin/job-desk/orders/${orderId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_answers", answers })
      });
      const saveResult = await saved.json().catch(() => ({}));
      if (!saved.ok) throw new Error(saveResult.error ?? "Could not save the client's answers.");
      const processed = await fetch(`/api/admin/job-desk/orders/${orderId}/process`, { method: "POST" });
      const processResult = await processed.json().catch(() => ({}));
      if (!processed.ok) throw new Error(`Answers were saved, but the CV could not be updated: ${processResult.error ?? "Please retry."}`);
      setMessage(processResult.reused ? "Answers saved. The existing CV remains ready for review." : "Answers saved. Updated CV ready for review.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the CV.");
    } finally {
      setBusy(false);
    }
  }

  return <form action={saveAndProcess} className="mt-4 space-y-5">
    <p className="text-sm">Answers below use the saved CV profile. Review them before saving. Missing details have not been invented.</p>
    <Button type="button" variant="secondary" disabled={busy} onClick={() => {
      setAnswers(current => mergeQuestionDrafts(questions,current,drafts));
      setMessage("Empty answers filled from the saved CV profile. Existing answers kept.");
    }}>Fill empty answers from CV</Button>
    {questions.map((item, index) => <label key={item.id} className="grid gap-2 border-t border-black/10 pt-4 text-sm dark:border-white/10">
      <span className="font-bold"><span className="mr-2 text-brand-blue">{index + 1}. {item.category}</span>{item.question}</span>
      <span className="text-xs text-black/50 dark:text-white/50">{item.reason}</span>
      {drafts[item.id] && !responses[item.id]?.trim() && <span className="text-xs font-semibold text-brand-blue">{drafts[item.id].missing ? "Missing details marked; review needed" : "Draft from saved CV profile"}</span>}
      <textarea name={item.id} value={answers[item.id] ?? ""} onChange={event => setAnswers(current => ({...current,[item.id]:event.target.value}))} disabled={busy} maxLength={4000} rows={3} placeholder="Client's answer" className="w-full rounded border border-black/20 bg-white p-3 text-sm text-black dark:border-white/20" />
    </label>)}
    <Button type="submit" disabled={busy}>{busy ? "Updating CV..." : "Save answers and update CV"}</Button>
    {message ? <p role="status" className="text-sm font-semibold">{message}</p> : null}
  </form>;
}
