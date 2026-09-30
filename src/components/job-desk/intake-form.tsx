"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Loader2, ScanText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

const selectClass = "h-11 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 dark:border-white/15 dark:bg-white/10";

export function JobDeskIntakeForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [previewMessage, setPreviewMessage] = useState("");
  const [error, setError] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("paid");
  const needsPaymentProof = paymentStatus === "paid" || paymentStatus === "partially_paid";

  async function prefill() {
    if (!formRef.current) return;
    setReading(true); setError(""); setPreviewMessage("");
    try {
      const response = await fetch("/api/admin/job-desk/intake-preview", { method: "POST", body: new FormData(formRef.current) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not read the CV.");
      for (const [name, raw] of Object.entries(body.fields as Record<string, unknown>)) {
        const control = formRef.current?.elements.namedItem(name);
        if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) continue;
        if (name === "remotePreference") { if (control.value === "flexible" && raw !== "flexible") control.value = String(raw); }
        else if (!control.value.trim() && raw) control.value = Array.isArray(raw) ? raw.join(", ") : String(raw);
      }
      setPreviewMessage("CV details filled where available. Check every field, then confirm payment and client consent.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the CV."); }
    finally { setReading(false); }
  }

  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/job-desk/orders", { method: "POST", body: formData });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to create the order.");
      router.push(`/dashboard/admin/job-desk/${body.orderId}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create the order.");
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} action={submit} className="space-y-7">
      <section>
        <div className="flex items-center gap-3 border-b border-black/10 pb-4 dark:border-white/10">
          <BriefcaseBusiness className="h-5 w-5 text-brand-blue" />
          <div>
            <h2 className="text-lg font-black">Client and service</h2>
            <p className="text-sm text-black/55 dark:text-white/55">Record exactly what the client shared on WhatsApp.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Full name"><Input name="fullName" required /></Field>
          <Field label="WhatsApp number"><Input name="whatsappPhone" required placeholder="+254 7XX XXX XXX" /></Field>
          <Field label="Email"><Input name="email" type="email" /></Field>
          <Field label="Lead source">
            <select name="source" defaultValue="whatsapp" className={selectClass}>
              <option value="whatsapp">WhatsApp</option><option value="tiktok">TikTok</option><option value="website">Website</option><option value="referral">Referral</option><option value="other">Other</option>
            </select>
          </Field>
          <Field label="Service">
            <select name="serviceType" defaultValue="job_search_full" className={selectClass}>
              <option value="job_search_full">Job Desk full service</option><option value="cv_revamp">CV revamp only</option><option value="cv_build">CV build from source information</option>
            </select>
          </Field>
          <Field label="Experience level"><Input name="experienceLevel" placeholder="Graduate, mid-level, senior..." /></Field>
        </div>
      </section>

      <section>
        <h2 className="border-b border-black/10 pb-4 text-lg font-black dark:border-white/10">Job preferences</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Target job titles"><Textarea name="targetJobTitles" placeholder="One per line or comma-separated" /></Field>
          <Field label="Preferred industries"><Textarea name="preferredIndustries" placeholder="NGO, banking, technology..." /></Field>
          <Field label="Preferred locations"><Input name="preferredLocations" placeholder="Nairobi, Mombasa, remote..." /></Field>
          <Field label="Employment types"><Input name="employmentTypes" placeholder="Full-time, contract, internship..." /></Field>
          <Field label="Work arrangement">
            <select name="remotePreference" defaultValue="flexible" className={selectClass}>
              <option value="flexible">Flexible</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option>
            </select>
          </Field>
          <Field label="Salary expectation"><Input name="salaryExpectation" placeholder="Optional" /></Field>
        </div>
        <div className="mt-4"><Field label="Client instructions"><Textarea name="instructions" className="min-h-32" placeholder="Role priorities, industries to avoid, deadlines, tone, or other instructions" /></Field></div>
      </section>

      <section>
        <div className="flex items-center gap-3 border-b border-black/10 pb-4 dark:border-white/10">
          <Upload className="h-5 w-5 text-brand-blue" />
          <div><h2 className="text-lg font-black">CV intake</h2><p className="text-sm text-black/55 dark:text-white/55">PDF, DOCX, DOC, or TXT up to 10MB.</p></div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Original CV"><Input name="cvFile" type="file" required accept=".pdf,.doc,.docx,.txt" className="py-2" /></Field>
          <Field label="Pasted CV text (recommended for scanned PDF or DOC)"><Textarea name="pastedCvText" placeholder="Paste only when the uploaded file may not contain selectable text." /></Field>
        </div>
        <button type="button" onClick={prefill} disabled={reading || busy} className="mt-4 inline-flex items-center gap-2 rounded border border-brand-blue px-4 py-2 text-sm font-bold text-brand-blue disabled:opacity-50">{reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}{reading ? "Reading CV..." : "Read CV and fill details"}</button>
        {previewMessage ? <p role="status" className="mt-2 text-sm text-brand-blue">{previewMessage}</p> : null}
      </section>

      <section>
        <h2 className="border-b border-black/10 pb-4 text-lg font-black dark:border-white/10">Manual payment record</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Payment status"><select name="paymentStatus" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)} className={selectClass}><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="partially_paid">Partially paid</option><option value="waived">Waived</option></select></Field>
          <Field label="Method"><select name="paymentMethod" defaultValue="mpesa" className={selectClass}><option value="mpesa">M-Pesa</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="manual">Manual</option><option value="other">Other</option></select></Field>
          <Field label="Amount (KES)"><Input name="amount" type="number" min={needsPaymentProof ? "0.01" : "0"} step="0.01" placeholder="Amount received" required /></Field>
          <Field label="Payment reference"><Input name="paymentReference" required={needsPaymentProof} minLength={needsPaymentProof ? 3 : undefined} placeholder="M-Pesa receipt or note" /></Field>
        </div>
      </section>

      <label className="flex items-start gap-3 rounded-lg border border-brand-blue/25 bg-brand-blue/5 p-4 text-sm font-semibold">
        <input name="consentToProcess" value="true" type="checkbox" required className="mt-0.5 h-4 w-4 accent-brand-blue" />
        <span>I confirm the client authorized SolvaOne to process their CV and personal information for this service.</span>
      </label>

      {error ? <p role="alert" className="rounded-lg border border-black bg-black p-3 text-sm font-semibold text-white dark:border-white dark:bg-white dark:text-black">{error}</p> : null}
      <Button type="submit" disabled={busy} className="h-12 px-6">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BriefcaseBusiness className="h-4 w-4" />}
        {busy ? "Creating intake..." : "Create Job Desk order"}
      </Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-bold"><span>{label}</span>{children}</label>;
}
