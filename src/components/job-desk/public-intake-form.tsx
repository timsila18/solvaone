"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { jobDeskServices, type PublicJobDeskService } from "@/lib/job-desk/services";
import { BroaderRoleFields } from "./broader-role-fields";

type PaymentState = "initiating" | "processing" | "successful" | "failed" | "cancelled" | "timed_out" | "needs_review";
const supportUrl = "https://wa.me/254721537597";
const selectClass = "h-11 w-full rounded border border-black/15 bg-white px-3 text-sm text-black dark:border-white/20 dark:bg-black dark:text-white";

export function PublicJobDeskIntakeForm() {
  const [service, setService] = useState<PublicJobDeskService>("job_search_full");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState<PaymentState>("initiating");
  const [needsReadableCv, setNeedsReadableCv] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("solva-job-desk-checkout") ?? "null");
      if (typeof saved?.token === "string" && typeof saved?.reference === "string") { setToken(saved.token); setReference(saved.reference); }
    } catch { sessionStorage.removeItem("solva-job-desk-checkout"); }
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch("/api/job-desk/payment-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), cache: "no-store" });
        const result = await response.json();
        if (active && response.ok) { setStatus(result.paymentStatus); if (result.message) setError(result.message); }
      } catch { /* Retry on next poll. */ }
    };
    void poll();
    const interval = setInterval(poll, 4000);
    return () => { active = false; clearInterval(interval); };
  }, [token]);

  async function submit(formData: FormData) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/job-desk/intake", { method: "POST", body: formData });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.accessToken) throw new Error(result.error ?? "Your request could not be started.");
      sessionStorage.setItem("solva-job-desk-checkout", JSON.stringify({ token: result.accessToken, reference: result.reference }));
      setToken(result.accessToken); setReference(result.reference); setStatus(result.paymentStatus);
      setNeedsReadableCv(Boolean(result.needsReadableCv));
      if (result.paymentError) setError(result.paymentError);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your request could not be started."); }
    finally { setBusy(false); }
  }

  async function retry() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/job-desk/payment-retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not resend the M-Pesa prompt.");
      setStatus(result.status);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resend the M-Pesa prompt."); }
    finally { setBusy(false); }
  }

  if (reference) return <section className="border-t-4 border-brand-blue py-10" role="status">
    {status === "successful" ? <CheckCircle2 className="h-10 w-10 text-brand-blue" /> : <CreditCard className="h-10 w-10 text-brand-blue" />}
    <h2 className="mt-5 text-2xl font-black">{status === "successful" ? "Payment confirmed. Request received." : "Complete your M-Pesa payment"}</h2>
    <p className="mt-3 text-sm">Reference: <strong>{reference}</strong></p>
    <p className="mt-2 max-w-xl text-sm leading-6 text-black/65 dark:text-white/65">{status === "successful" ? "Our admin will get back to you within 6 hours. We will work only within the application preferences you authorized." : status === "processing" ? "Check your phone for the STK prompt and enter your M-Pesa PIN. We will confirm payment here automatically." : status === "initiating" ? "We are checking the M-Pesa prompt. Do not pay twice; contact us if it does not arrive." : status === "needs_review" ? "Your payment needs verification. Contact us with your M-Pesa receipt; do not pay again." : "Payment was not confirmed. You can retry the M-Pesa prompt below."}</p>
    {needsReadableCv ? <p className="mt-3 text-sm">Your old DOC file may need a readable DOCX or PDF copy. We will contact you if necessary.</p> : null}
    {error ? <p role="alert" className="mt-4 text-sm font-semibold text-brand-blue">{error}</p> : null}
    <div className="mt-6 flex flex-wrap gap-3">{["failed", "cancelled", "timed_out"].includes(status) ? <Button type="button" onClick={retry} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}Retry M-Pesa</Button> : null}<a className="inline-flex h-11 items-center rounded border border-brand-blue px-5 text-sm font-bold text-brand-blue" href={supportUrl} target="_blank" rel="noreferrer">WhatsApp 0721537597</a></div>
  </section>;

  return <form action={submit} className="space-y-9">
    <div className="absolute -left-[10000px]" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <section><h2 className="border-b border-black/10 pb-3 text-lg font-black dark:border-white/10">Choose a service</h2><div className="mt-5 grid gap-2 sm:grid-cols-3">{(Object.entries(jobDeskServices) as [PublicJobDeskService, typeof jobDeskServices[PublicJobDeskService]][]).map(([id, item]) => <label key={id} className={`cursor-pointer border p-4 ${service === id ? "border-brand-blue" : "border-black/15 dark:border-white/20"}`}><input type="radio" name="serviceType" value={id} checked={service === id} onChange={() => setService(id)} className="accent-brand-blue" /><span className="ml-2 font-bold">{item.name}</span><span className="mt-2 block text-sm font-bold text-brand-blue">KSh {item.price.toLocaleString()}</span><span className="mt-1 block text-xs text-black/55 dark:text-white/55">{item.description}</span></label>)}</div></section>
    <section><h2 className="border-b border-black/10 pb-3 text-lg font-black dark:border-white/10">Your details</h2><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label="Full name" required><Input name="fullName" autoComplete="name" required maxLength={160} /></Field><Field label="Safaricom WhatsApp number" required><Input name="whatsappPhone" type="tel" autoComplete="tel" placeholder="07XX XXX XXX" required /></Field><Field label="Email address" required={service === "job_search_full"}><Input name="email" type="email" autoComplete="email" required={service === "job_search_full"} /></Field><Field label="Experience level"><Input name="experienceLevel" maxLength={120} /></Field></div>{service === "job_search_full" ? <p className="mt-2 text-sm text-black/60 dark:text-white/60">Application updates will be sent to this email address.</p> : null}</section>
    {service === "job_search_full" ? <section><h2 className="border-b border-black/10 pb-3 text-lg font-black dark:border-white/10">Jobs you want</h2><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label="Target job titles" required><Input name="targetJobTitles" required maxLength={1000} /></Field><Field label="Preferred locations"><Input name="preferredLocations" maxLength={1000} /></Field><Field label="Industries"><Input name="preferredIndustries" maxLength={1000} /></Field><Field label="Employment type"><Input name="employmentTypes" maxLength={500} /></Field><Field label="Work arrangement"><select name="remotePreference" defaultValue="flexible" className={selectClass}><option value="flexible">Flexible</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></Field><Field label="Salary expectation"><Input name="salaryExpectation" maxLength={160} /></Field><Field label="Employers to avoid"><Input name="excludedEmployers" maxLength={1000} placeholder="Optional, comma-separated" /></Field><Field label="Roles to avoid"><Input name="excludedRoles" maxLength={1000} placeholder="Optional, comma-separated" /></Field><Field label="Other exclusions"><Input name="excludedKeywords" maxLength={1000} placeholder="Optional sectors or conditions" /></Field></div></section> : <><input type="hidden" name="targetJobTitles" value="" /><input type="hidden" name="preferredLocations" value="" /><input type="hidden" name="preferredIndustries" value="" /><input type="hidden" name="employmentTypes" value="" /><input type="hidden" name="remotePreference" value="flexible" /><input type="hidden" name="salaryExpectation" value="" /><input type="hidden" name="excludedEmployers" value="" /><input type="hidden" name="excludedRoles" value="" /><input type="hidden" name="excludedKeywords" value="" /></>}
    {service === "job_search_full" ? <section><h2 className="border-b border-black/10 pb-3 text-lg font-black dark:border-white/10">Application details</h2><p className="mt-3 text-sm text-black/60 dark:text-white/60">Answer these once so we can prepare common application fields. Leave anything uncertain unconfirmed; a CV cannot establish legal eligibility.</p><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label="Current city"><Input name="currentCity" maxLength={120} /></Field><Field label="Current country"><Input name="currentCountry" maxLength={120} /></Field><Field label="Eligible to work in Kenya"><select name="kenyaWorkEligibility" defaultValue="not_provided" className={selectClass}><option value="not_provided">Not sure / prefer to discuss</option><option value="yes">Yes</option><option value="no">No</option><option value="unsure">Unsure</option></select></Field><Field label="Need employer visa sponsorship"><select name="sponsorshipNeeded" defaultValue="not_provided" className={selectClass}><option value="not_provided">Not sure / prefer to discuss</option><option value="yes">Yes</option><option value="no">No</option><option value="unsure">Unsure</option></select></Field><Field label="Notice period / earliest start"><Input name="noticePeriod" maxLength={120} /></Field><Field label="LinkedIn profile"><Input name="applicantLinkedinUrl" type="url" maxLength={500} placeholder="https://www.linkedin.com/in/..." /></Field><Field label="Portfolio or professional website"><Input name="portfolioUrl" type="url" maxLength={500} placeholder="https://..." /></Field></div><p className="mt-3 text-xs">Do not upload an ID, passport or passwords here. A genuine identity check must be completed by you through the employer's official process.</p></section> : null}
    {service === "interview_coaching" ? <section className="grid gap-5 md:grid-cols-2"><Field label="Position name" required><Input name="positionName" required maxLength={160} /></Field><Field label="Organization" required><Input name="organizationName" required maxLength={160} /></Field></section> : <><input type="hidden" name="positionName" value="" /><input type="hidden" name="organizationName" value="" /></>}
    {service === "linkedin_revamp" ? <section><div className="grid gap-5 md:grid-cols-2"><Field label="LinkedIn profile URL" required><Input name="linkedInUrl" type="url" placeholder="https://www.linkedin.com/in/your-name" required maxLength={500} /></Field><Field label="LinkedIn contact email" required><Input name="linkedInEmail" type="email" required maxLength={254} /></Field></div><p className="mt-3 text-sm font-semibold">Never share your LinkedIn password. We prepare your profile content; you make changes in your own account.</p></section> : <><input type="hidden" name="linkedInUrl" value="" /><input type="hidden" name="linkedInEmail" value="" /></>}
    <section><h2 className="border-b border-black/10 pb-3 text-lg font-black dark:border-white/10">Your documents</h2><div className="mt-5 grid gap-5 md:grid-cols-2"><Field label={service === "interview_coaching" ? "Current CV (optional)" : "Current CV"} required={service !== "interview_coaching"}><Input name="cvFile" type="file" accept=".pdf,.docx,.doc,.txt" required={service !== "interview_coaching"} className="py-2" /><span className="text-xs font-normal">PDF, Word or TXT, up to 10MB.</span></Field><Field label="Supporting files"><Input name="supportingFiles" type="file" accept=".pdf,.docx,.doc,.txt" multiple className="py-2" /><span className="text-xs font-normal">Optional: up to two files, 20MB total.</span></Field></div><div className="mt-5"><Field label="CV text (optional for scanned files)"><Textarea name="pastedCvText" maxLength={50000} /></Field></div><div className="mt-5"><Field label="Other instructions"><Textarea name="instructions" maxLength={8000} placeholder="Share your goals. Do not include passwords." /></Field></div></section>
    <label className="flex items-start gap-3 border-t border-black/10 pt-5 text-sm leading-6 dark:border-white/10"><input type="checkbox" name="consentToProcess" value="true" required className="mt-1.5 h-4 w-4 accent-brand-blue" /><span>I authorize SolvaOne to review my documents and contact me about this service.</span></label>
    {service === "job_search_full" ? <><BroaderRoleFields /><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" name="applicationAuthorization" value="true" required className="mt-1.5 h-4 w-4 accent-brand-blue" /><span>I authorize SolvaOne to submit my approved CV, contact details and tailored letters to genuine open jobs matching the career roles and any broader roles I selected, locations and work arrangement above, excluding the employers, roles and conditions I listed. Applications needing unique answers or personal checks are held for review.</span></label></> : null}
    {error ? <p role="alert" className="border-l-4 border-brand-blue p-4 text-sm font-semibold">{error}</p> : null}
    <Button type="submit" disabled={busy} className="h-12 w-full px-6 sm:w-auto">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}{busy ? "Starting M-Pesa..." : `Pay KSh ${jobDeskServices[service].price.toLocaleString()} with M-Pesa`}</Button>
  </form>;
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) { return <label className="grid min-w-0 gap-2 text-sm font-bold"><span>{label}{required ? " *" : ""}</span>{children}</label>; }
