"use client";

import { useState } from "react";
import { Copy, ExternalLink, FileDown } from "lucide-react";
import type { ApplicantDetails } from "@/lib/job-desk/applicant-details";
import { blockerAction } from "@/lib/job-desk/application-progress";

type PacketProps = {
  matchId: string;
  url: string;
  title: string;
  company: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  details: ApplicantDetails | null;
  letter: string;
  reason?: string | null;
};

export function PortalApplicationPacket({ matchId, url, title, company, name, email, phone, location, details, letter, reason }: PacketProps) {
  const [status, setStatus] = useState("");
  const guidance = blockerAction(reason);
  const confirmed = (value: string | undefined) => value && value !== "not_provided" && value !== "unsure" ? value : "Not confirmed";
  const answers = [
    ["Full name", name], ["Email", email], ["Phone", phone],
    ["Current location", [details?.currentCity, details?.currentCountry].filter(Boolean).join(", ") || location],
    ["Kenya work eligibility (client-declared)", confirmed(details?.kenyaWorkEligibility)],
    ["Employer sponsorship needed (client-declared)", confirmed(details?.sponsorshipNeeded)],
    ["Notice period", details?.noticePeriod || "Not provided"],
    ["LinkedIn", details?.applicantLinkedinUrl || "Not provided"],
    ["Portfolio", details?.portfolioUrl || "Not provided"]
  ];
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setStatus(`${label} copied.`); }
    catch { setStatus("Clipboard unavailable. Select the text manually."); }
  }

  return <section className="mt-4 border-l-2 border-brand-blue pl-4 text-sm" aria-label={`Application packet for ${title} at ${company}`}>
    <h3 className="font-bold">Application needs review: {title} at {company}</h3>
    <p role="alert" className="mt-2 font-semibold">{guidance.blocker}: application packet ready. Submission is not confirmed.</p>
    <p className="mt-2 text-sm">Next action: {guidance.action}</p>
    {reason ? <details className="mt-2 text-xs"><summary>Original blocker details</summary><p className="mt-1 whitespace-pre-wrap">{reason}</p></details> : null}
    <p className="mt-1 text-xs text-black/60 dark:text-white/60">Open the official job page, use the verified details below, attach the approved CV, and record the employer's confirmation after submission. Leave unconfirmed answers for the client.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 bg-brand-blue px-3 text-xs font-bold text-white"><ExternalLink className="h-4 w-4" />Open application</a>
      <a href={`/api/admin/job-desk/matches/${matchId}/download?kind=cv`} className="inline-flex h-9 items-center gap-2 border border-black/20 px-3 text-xs font-bold dark:border-white/20"><FileDown className="h-4 w-4" />Approved CV</a>
      <a href={`/api/admin/job-desk/matches/${matchId}/download?kind=letter`} className="inline-flex h-9 items-center gap-2 border border-black/20 px-3 text-xs font-bold dark:border-white/20"><FileDown className="h-4 w-4" />Tailored letter</a>
      <button type="button" onClick={() => copy(answers.map(([label, value]) => `${label}: ${value}`).join("\n"), "Application answers")} className="inline-flex h-9 items-center gap-2 border border-black/20 px-3 text-xs font-bold dark:border-white/20"><Copy className="h-4 w-4" />Copy answers</button>
      <button type="button" onClick={() => copy(letter, "Cover letter")} className="inline-flex h-9 items-center gap-2 border border-black/20 px-3 text-xs font-bold dark:border-white/20"><Copy className="h-4 w-4" />Copy letter</button>
    </div>
    <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">{answers.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-bold text-black/50 dark:text-white/50">{label}</dt><dd className="break-words">{value || "Not provided"}</dd></div>)}</dl>
    {status ? <p role="status" className="mt-2 text-xs">{status}</p> : null}
  </section>;
}
