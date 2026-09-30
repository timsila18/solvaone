"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VacancyReviewControls({ vacancyId, duplicate, rejected = false }: { vacancyId: string; duplicate: boolean; rejected?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/job-desk/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review_vacancy", vacancyId, decision }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Review failed.");
      router.refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Review failed."); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-wrap items-center gap-2">
    {!duplicate ? <button type="button" disabled={busy} onClick={() => decide("approve")} className="h-9 border border-brand-blue px-3 text-xs font-bold text-brand-blue disabled:opacity-50">Approve</button> : null}
    {!rejected ? <button type="button" disabled={busy} onClick={() => decide("reject")} className="h-9 border border-black/20 px-3 text-xs font-bold dark:border-white/20 disabled:opacity-50">Reject</button> : null}
    {message ? <span role="alert" className="text-xs">{message}</span> : null}
  </div>;
}
