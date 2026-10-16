"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Loader2, ScanText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { BroaderRoleFields } from "./broader-role-fields";

const selectClass = "h-11 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 dark:border-white/15 dark:bg-white/10";

export function JobDeskIntakeForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [previewMessage, setPreviewMessage] = useState("");
  const [cvSourceText, setCvSourceText] = useState("");
  const [prefilledFields, setPrefilledFields] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("paid");
  const [serviceType, setServiceType] = useState("job_search_full");
  const [kenyaEligibility, setKenyaEligibility] = useState("yes");
  const submitting = useRef(false);
  const needsPaymentProof = paymentStatus === "paid" || paymentStatus === "partially_paid";

  async function prefill() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    const selectedFile = formData.get("cvFile");
    if (!(selectedFile instanceof File) || !selectedFile.size) {
      setError("Select a CV before filling the form.");
      return;
    }
    setReading(true); setError(""); setPreviewMessage(""); setPrefilledFields([]); setCvSourceText("");
    try {
      const response = await fetch("/api/admin/job-desk/intake-preview", { method: "POST", body: formData });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not read the CV.");
      if (!body.fields || typeof body.fields !== "object") throw new Error("The CV reader returned no details. Please try again.");
      setCvSourceText(typeof body.sourceText === "string" ? body.sourceText : "");
      const filled: string[] = [];
      for (const [name, raw] of Object.entries(body.fields as Record<string, unknown>)) {
        const control = formRef.current?.elements.namedItem(name);
        if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) continue;
        if ((name === "applicantLinkedinUrl" || name === "portfolioUrl") && raw && (typeof raw !== "string" || !raw.startsWith("https://"))) continue;
        if (name === "remotePreference") {
          if (control.value === "flexible" && raw !== "flexible") { control.value = String(raw); filled.push(name); }
        } else if (!control.value.trim() && raw && (!Array.isArray(raw) || raw.length > 0)) { control.value = Array.isArray(raw) ? raw.join(", ") : String(raw); filled.push(name); }
      }
      setPrefilledFields(filled);
      setPreviewMessage(filled.length ? `CV filled ${filled.length} field${filled.length === 1 ? "" : "s"}.` : "No additional explicit details were found in the CV.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read the CV."); }
    finally { setReading(false); }
  }

  async function submit(formData: FormData) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/job-desk/orders", { method: "POST", body: formData });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to create the order. Your entries are still here.");
      if (!body.orderId) throw new Error("The server did not return an order reference. Contact support before retrying; your entries are still here.");
      router.push(`/dashboard/admin/job-desk/${body.orderId}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create the order.");
      setBusy(false);
    } finally { submitting.current = false; }
  }

  return (
    <form ref={formRef} onSubmit={(event) => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }} className="space-y-7">
      <section>
        <div className="flex items-center gap-3 border-b border-black/10 pb-4 dark:border-white/10">
          <Upload className="h-5 w-5 text-brand-blue" />
          <div><h2 className="text-lg font-black">Start with the CV</h2><p className="text-sm text-black/55 dark:text-white/55">Upload first and the verified CV details fill the intake below.</p></div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Original CV"><Input name="cvFile" type="file" required accept=".pdf,.doc,.docx,.txt" className="py-2" disabled={busy} onChange={(event) => { if (event.target.files?.length) void prefill(); }} /></Field>
        </div>
        <details className="mt-3"><summary className="cursor-pointer text-sm font-bold text-brand-blue">Scanned CV? Add its text</summary><div className="mt-3"><Field label="CV text"><Textarea name="pastedCvText" placeholder="Only needed if the CV cannot be read." /></Field></div></details>
        <button type="button" onClick={prefill} disabled={reading || busy} className="mt-4 inline-flex items-center gap-2 rounded border border-brand-blue px-4 py-2 text-sm font-bold text-brand-blue disabled:opacity-50">{reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}{reading ? "Reading CV..." : "Fill from CV"}</button>
        {previewMessage ? <p role="status" className="mt-2 text-sm text-brand-blue">{previewMessage}</p> : null}
        {cvSourceText ? <details className="mt-3"><summary className="cursor-pointer text-sm font-bold">Read CV text</summary><pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm">{cvSourceText}</pre></details> : null}
        {prefilledFields.length ? <p className="mt-1 text-xs text-black/55 dark:text-white/55">Filled from CV: {prefilledFields.map((field) => ({ fullName: "name", email: "email", whatsappPhone: "phone", targetJobTitles: "target roles", preferredIndustries: "industries", preferredLocations: "location", experienceLevel: "experience", remotePreference: "work arrangement", currentCity: "city", currentCountry: "country", noticePeriod: "availability", applicantLinkedinUrl: "LinkedIn", portfolioUrl: "portfolio" }[field] ?? field)).join(", ")}.</p> : null}
      </section>
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
          <Field label="Client email"><Input name="email" type="email" required={serviceType === "job_search_full"} /></Field>
          <Field label="Service">
            <select name="serviceType" value={serviceType} onChange={(event) => setServiceType(event.target.value)} className={selectClass}>
              <option value="job_search_full">Job Desk full service</option><option value="cv_revamp">CV revamp only</option><option value="cv_build">CV build from source information</option>
            </select>
          </Field>
        </div>
        <details className="mt-4 border-t border-black/10 pt-4 dark:border-white/10"><summary className="cursor-pointer text-sm font-bold text-brand-blue">Additional client details</summary><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Lead source"><select name="source" defaultValue="whatsapp" className={selectClass}><option value="whatsapp">WhatsApp</option><option value="tiktok">TikTok</option><option value="website">Website</option><option value="referral">Referral</option><option value="other">Other</option></select></Field><Field label="Experience level"><Input name="experienceLevel" placeholder="Graduate, mid-level, senior..." /></Field></div></details>
      </section>

      <section>
        <h2 className="border-b border-black/10 pb-4 text-lg font-black dark:border-white/10">Job preferences</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Target job titles"><Textarea name="targetJobTitles" placeholder="One per line or comma-separated" /></Field>
          <Field label="Preferred locations"><Input name="preferredLocations" placeholder="Nairobi, Mombasa, remote..." /></Field>
          <Field label="Work arrangement">
            <select name="remotePreference" defaultValue="flexible" className={selectClass}>
              <option value="flexible">Flexible</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option>
            </select>
          </Field>
          {serviceType === "job_search_full" ? <>
            <Field label="LinkedIn profile"><Input name="applicantLinkedinUrl" type="text" inputMode="url" autoCapitalize="none" spellCheck={false} maxLength={4000} placeholder="https://www.linkedin.com/in/..." /></Field>
            <Field label="Eligible to work in Kenya"><select name="kenyaWorkEligibility" value={kenyaEligibility} onChange={(event) => setKenyaEligibility(event.target.value)} className={selectClass}><option value="yes">Yes, confirmed by client</option><option value="not_provided">Not confirmed</option><option value="no">No</option><option value="unsure">Unsure</option></select></Field>
          </> : null}
        </div>
        {serviceType === "job_search_full" && kenyaEligibility === "yes" ? <label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" name="kenyaEligibilityConfirmed" value="true" required className="mt-1" />I confirm the client has explicitly stated they are eligible to work in Kenya.</label> : null}
        <details className="mt-4 border-t border-black/10 pt-4 dark:border-white/10"><summary className="cursor-pointer text-sm font-bold text-brand-blue">Additional job preferences</summary><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Preferred industries"><Textarea name="preferredIndustries" placeholder="NGO, banking, technology..." /></Field><Field label="Employment types"><Input name="employmentTypes" placeholder="Full-time, contract, internship..." /></Field><Field label="Salary expectation"><Input name="salaryExpectation" placeholder="Optional" /></Field><Field label="Employers to exclude"><Textarea name="excludedEmployers" placeholder="One name per line or comma-separated" /></Field><Field label="Roles to exclude"><Textarea name="excludedRoles" placeholder="One title per line or comma-separated" /></Field><Field label="Other exclusions"><Textarea name="excludedKeywords" placeholder="Sectors or conditions the client ruled out" /></Field></div><div className="mt-4"><Field label="Client instructions"><Textarea name="instructions" className="min-h-32" placeholder="Role priorities, industries to avoid, deadlines, tone, or other instructions" /></Field></div></details>
      </section>

      {serviceType === "job_search_full" ? <details className="border-t border-black/10 pt-4 dark:border-white/10"><summary className="cursor-pointer text-sm font-bold text-brand-blue">Broader job preferences</summary><div className="mt-4"><BroaderRoleFields /></div></details> : null}
      {serviceType === "job_search_full" ? <details className="border-t border-black/10 pt-4 dark:border-white/10"><summary className="cursor-pointer text-sm font-bold text-brand-blue">More application details</summary><section className="mt-4">
        <h2 className="border-b border-black/10 pb-4 text-lg font-black dark:border-white/10">Reusable application details</h2>
        <p className="mt-3 text-sm">Ask the client to confirm these answers once. Do not guess eligibility or upload identity documents here.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Current city"><Input name="currentCity" maxLength={120} placeholder="e.g. Nairobi" /></Field>
          <Field label="Notice period or earliest start"><Input name="noticePeriod" maxLength={120} placeholder="e.g. Immediately, 30 days" /></Field>
          <Field label="Portfolio or professional site"><Input name="portfolioUrl" type="url" maxLength={500} placeholder="https://..." /></Field>
        </div>
        <details className="mt-4 border-t border-black/10 pt-4 dark:border-white/10"><summary className="cursor-pointer text-sm font-bold text-brand-blue">Legal and eligibility details</summary><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Current country"><Input name="currentCountry" maxLength={120} placeholder="e.g. Kenya" /></Field><Field label="Needs employer visa sponsorship"><select name="sponsorshipNeeded" defaultValue="not_provided" className={selectClass}><option value="not_provided">Not confirmed</option><option value="yes">Yes</option><option value="no">No</option><option value="unsure">Unsure</option></select></Field></div></details>
      </section></details> : null}

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

      {serviceType === "job_search_full" ? <section className="space-y-4 border-t border-black/10 pt-5 dark:border-white/10">
        <h2 className="text-lg font-black">One-time application authorization</h2>
        <p className="text-sm leading-6">Confirm the client explicitly agreed that SolvaOne may submit their approved CV and tailored letters to genuine jobs matching the roles, locations, work arrangement and exclusions recorded above. Sending a CV alone is not this authorization. Assessments, identity checks and out-of-scope roles still require the client.</p>
        <Field label="Where the client authorized this"><Input name="authorizationEvidence" required minLength={8} maxLength={1000} placeholder="WhatsApp message date and short excerpt" /></Field>
        <label className="flex items-start gap-3 text-sm font-semibold"><input name="applicationAuthorization" value="true" type="checkbox" required className="mt-1 h-4 w-4 accent-brand-blue" /><span>I have recorded the client's explicit permission for applications within this scope.</span></label>
      </section> : <><input name="excludedEmployers" type="hidden" value="" /><input name="excludedRoles" type="hidden" value="" /><input name="excludedKeywords" type="hidden" value="" /><input name="authorizationEvidence" type="hidden" value="" /></>}

      {error ? <p role="alert" className="rounded-lg border border-black bg-black p-3 text-sm font-semibold text-white dark:border-white dark:bg-white dark:text-black">{error}</p> : null}
      <Button type="submit" disabled={busy || reading} className="h-12 px-6">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BriefcaseBusiness className="h-4 w-4" />}
        {busy ? "Creating intake..." : "Create Job Desk order"}
      </Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-bold"><span>{label}</span>{children}</label>;
}
