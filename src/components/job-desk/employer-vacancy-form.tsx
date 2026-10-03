"use client";
import { useState, type FormEvent } from "react";

export function EmployerVacancyForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch("/api/job-desk/employers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, authorized: values.authorized === "on", noFees: values.noFees === "on" }) });
      const result = await response.json();
      setMessage(result.error ?? result.message);
      if (response.ok) form.reset();
    } catch { setMessage("Connection failed. Your vacancy has not been saved. Please retry."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
    {[["company", "Company name"], ["contactName", "Contact name"], ["email", "Contact email"], ["phone", "Contact phone"], ["title", "Job title"], ["location", "Work location and arrangement"], ["applicationEmail", "Verified recruitment email"], ["advertUrl", "Official public advert link"], ["closingDate", "Application closing date"]].map(([name, label]) => <label key={name} className="grid gap-2 text-sm font-bold">{label}<input name={name} required maxLength={name === "advertUrl" ? 1000 : 254} type={name.includes("Email") || name === "email" ? "email" : name === "closingDate" ? "date" : name === "advertUrl" ? "url" : "text"} className="min-w-0 rounded border border-black/20 bg-transparent p-3 dark:border-white/20" /></label>)}
    <label className="grid gap-2 text-sm font-bold sm:col-span-2">Responsibilities, required education, experience and salary<textarea name="requirements" required minLength={2} maxLength={6000} rows={7} className="rounded border border-black/20 bg-transparent p-3 dark:border-white/20" /></label>
    <label className="flex gap-3 text-sm sm:col-span-2"><input type="checkbox" name="authorized" required />I represent this employer and authorize applications for this real, currently open vacancy.</label>
    <label className="flex gap-3 text-sm sm:col-span-2"><input type="checkbox" name="noFees" required />Applicants will not be charged recruitment or application fees.</label>
    <div className="sm:col-span-2"><button disabled={busy} className="rounded bg-brand-blue px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? "Sending..." : "Submit vacancy for verification"}</button><p role="status" className="mt-3 text-sm">{message}</p></div>
  </form>;
}
