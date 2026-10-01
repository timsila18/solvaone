"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ApplicantDetails } from "@/lib/job-desk/applicant-details";

const inputClass = "mt-1 h-10 w-full border border-black/20 bg-white px-2 text-sm text-black";

export function ApplicantDetailsForm({ orderId, details }: { orderId: string; details: ApplicantDetails | null }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  return <details className="border-t border-black/10 pt-3 dark:border-white/10">
    <summary className="cursor-pointer text-sm font-bold text-brand-blue">Edit application answers</summary>
    <form className="mt-3 space-y-3" onSubmit={async (event) => {
      event.preventDefault();
      setBusy(true); setMessage("");
      const form = new FormData(event.currentTarget);
      const values = Object.fromEntries(form.entries());
      try {
        const response = await fetch(`/api/admin/job-desk/orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save_applicant_details", details: values }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not save application details.");
        setMessage("Application answers saved.");
        router.refresh();
      } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not save application details."); }
      finally { setBusy(false); }
    }}>
      <label className="block text-xs font-bold">Current city<input name="currentCity" defaultValue={details?.currentCity ?? ""} maxLength={120} className={inputClass} /></label>
      <label className="block text-xs font-bold">Current country<input name="currentCountry" defaultValue={details?.currentCountry ?? ""} maxLength={120} className={inputClass} /></label>
      <label className="block text-xs font-bold">Eligible to work in Kenya<select name="kenyaWorkEligibility" defaultValue={details?.kenyaWorkEligibility ?? "not_provided"} className={inputClass}><option value="not_provided">Not confirmed</option><option value="yes">Yes</option><option value="no">No</option><option value="unsure">Unsure</option></select></label>
      <label className="block text-xs font-bold">Needs employer visa sponsorship<select name="sponsorshipNeeded" defaultValue={details?.sponsorshipNeeded ?? "not_provided"} className={inputClass}><option value="not_provided">Not confirmed</option><option value="yes">Yes</option><option value="no">No</option><option value="unsure">Unsure</option></select></label>
      <label className="block text-xs font-bold">Notice period<input name="noticePeriod" defaultValue={details?.noticePeriod ?? ""} maxLength={120} className={inputClass} /></label>
      <label className="block text-xs font-bold">LinkedIn profile<input name="applicantLinkedinUrl" type="url" defaultValue={details?.applicantLinkedinUrl ?? ""} maxLength={500} className={inputClass} /></label>
      <label className="block text-xs font-bold">Portfolio URL<input name="portfolioUrl" type="url" defaultValue={details?.portfolioUrl ?? ""} maxLength={500} className={inputClass} /></label>
      <label className="block text-xs font-bold">Admin application answers<textarea name="portalAnswers" defaultValue={details?.portalAnswers ?? ""} maxLength={20000} rows={8} placeholder={'One question and answer per line:\nQuestion = Verified answer'} className="mt-1 w-full border border-black/20 bg-white p-2 text-sm text-black" /></label>
      <p className="text-xs">Record answers from the CV, WhatsApp instructions or information you have verified. No separate client form is required. Leave unknown facts unanswered.</p>
      <button disabled={busy} className="h-10 bg-brand-blue px-3 text-sm font-bold text-white disabled:opacity-50">Save answers</button>
      {message ? <p role="status" className="text-xs">{message}</p> : null}
    </form>
  </details>;
}
