"use client";

import { useState } from "react";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { site } from "@/lib/marketing";

const selectClass = "h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 dark:border-white/20 dark:bg-black dark:text-white";

export function PublicJobDeskIntakeForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [needsReadableCv, setNeedsReadableCv] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/job-desk/intake", { method: "POST", body: formData });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.reference) throw new Error(result.error ?? "Your submission could not be received.");
      setReference(result.reference);
      setNeedsReadableCv(Boolean(result.needsReadableCv));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your submission could not be received.");
    } finally {
      setBusy(false);
    }
  }

  if (reference) return (
    <div className="border-t-4 border-brand-blue bg-white py-10 text-black dark:bg-black dark:text-white" role="status">
      <CheckCircle2 className="h-10 w-10 text-brand-blue" />
      <h2 className="mt-5 text-2xl font-black">Documents received</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-black/65 dark:text-white/65">Your reference is <strong className="text-black dark:text-white">{reference}</strong>. Our team will review your CV and preferences, then contact you on WhatsApp about the next steps and payment. No job applications will be sent without your authorization.</p>
      {needsReadableCv ? <p className="mt-3 text-sm font-semibold">Your DOC file may need a readable DOCX or PDF copy. Our team will contact you if necessary.</p> : null}
      <a className="mt-7 inline-flex h-11 items-center rounded-lg bg-brand-blue px-5 text-sm font-bold text-white" href={site.supportWhatsAppUrl}>Contact us on WhatsApp</a>
    </div>
  );

  return (
    <form action={submit} className="space-y-9">
      <div className="absolute -left-[10000px]" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <section>
        <h2 className="border-b border-black/10 pb-3 text-lg font-black dark:border-white/10">Your details</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field label="Full name" required><Input name="fullName" autoComplete="name" required maxLength={160} /></Field>
          <Field label="WhatsApp number" required><Input name="whatsappPhone" type="tel" autoComplete="tel" placeholder="07XX XXX XXX" required /></Field>
          <Field label="Email address"><Input name="email" type="email" autoComplete="email" /></Field>
          <Field label="Experience level"><Input name="experienceLevel" placeholder="Graduate, mid-level, senior" maxLength={120} /></Field>
        </div>
      </section>
      <section>
        <h2 className="border-b border-black/10 pb-3 text-lg font-black dark:border-white/10">Jobs you want</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field label="Target job titles" required><Input name="targetJobTitles" placeholder="e.g. Accountant, Finance Officer" required maxLength={1000} /></Field>
          <Field label="Preferred locations"><Input name="preferredLocations" placeholder="Nairobi, Mombasa, remote" maxLength={1000} /></Field>
          <Field label="Industries"><Input name="preferredIndustries" placeholder="e.g. Banking, NGO, technology" maxLength={1000} /></Field>
          <Field label="Employment type"><Input name="employmentTypes" placeholder="Full-time, contract, internship" maxLength={500} /></Field>
          <Field label="Work arrangement"><select name="remotePreference" defaultValue="flexible" className={selectClass}><option value="flexible">Flexible</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></Field>
          <Field label="Salary expectation"><Input name="salaryExpectation" placeholder="Optional" maxLength={160} /></Field>
        </div>
        <div className="mt-5"><Field label="Other instructions"><Textarea name="instructions" maxLength={8000} placeholder="Tell us about your goals, deadlines, preferred employers or roles to avoid." /></Field></div>
      </section>
      <section>
        <div className="flex items-center gap-2 border-b border-black/10 pb-3 dark:border-white/10"><FileUp className="h-5 w-5 text-brand-blue" /><h2 className="text-lg font-black">Your documents</h2></div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field label="Current CV" required><Input name="cvFile" type="file" accept=".pdf,.docx,.doc,.txt" required className="py-2" /><span className="text-xs font-normal text-black/55 dark:text-white/55">PDF, Word or TXT, up to 10MB.</span></Field>
          <Field label="Supporting files"><Input name="supportingFiles" type="file" accept=".pdf,.docx,.doc,.txt" multiple className="py-2" /><span className="text-xs font-normal text-black/55 dark:text-white/55">Optional: up to two files such as certificates or a job advert. 20MB total.</span></Field>
        </div>
        <div className="mt-5"><Field label="CV text (optional for scanned PDF or old DOC)"><Textarea name="pastedCvText" maxLength={50000} placeholder="Paste the text from your CV if the file is a scan or old Word document." /></Field></div>
      </section>
      <label className="flex items-start gap-3 border-t border-black/10 pt-5 text-sm leading-6 dark:border-white/10">
        <input type="checkbox" name="consentToProcess" value="true" required className="mt-1.5 h-4 w-4 accent-brand-blue" />
        <span>I authorize SolvaOne to securely review and process my CV and personal details for Job Desk services. I understand that submitting this form does not authorize SolvaOne to apply for jobs on my behalf.</span>
      </label>
      {error ? <p role="alert" className="border-l-4 border-brand-blue bg-black px-4 py-3 text-sm font-semibold text-white">{error}</p> : null}
      <Button type="submit" disabled={busy} className="h-12 w-full px-6 sm:w-auto">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}{busy ? "Submitting documents..." : "Submit to Job Desk"}</Button>
    </form>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return <label className="grid min-w-0 gap-2 text-sm font-bold"><span>{label}{required ? " *" : ""}</span>{children}</label>;
}
