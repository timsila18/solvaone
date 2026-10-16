"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ManualCvForm({ orderId, sourceText }: { orderId: string; sourceText: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(form: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/job-desk/orders/${orderId}/manual-cv`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: form.get("summary"), skills: form.get("skills"), experience: form.get("experience"), education: form.get("education"), checked: form.get("checked") === "on" })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save CV.");
      setMessage("CV saved for review. Review the document below, then approve it.");
      router.refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not save CV."); }
    finally { setBusy(false); }
  }
  return <details className="my-5 border-y border-black/10 py-4 dark:border-white/10">
    <summary className="cursor-pointer font-bold">Prepare CV manually</summary>
    {sourceText ? <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Uploaded CV text</summary><pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm">{sourceText}</pre></details> : null}
    <form onSubmit={(event) => { event.preventDefault(); if (!busy) void save(new FormData(event.currentTarget)); }} className="mt-4 grid gap-4 md:grid-cols-2">
      {([ ["summary", "Professional summary"], ["skills", "Skills"], ["experience", "Experience and achievements"], ["education", "Education and certifications"] ] as const).map(([name, label]) => <label key={name} className="min-w-0 text-sm font-semibold">{label}<textarea name={name} required minLength={20} maxLength={name === "experience" ? 30000 : 10000} rows={6} className="mt-1 w-full rounded border border-black/20 bg-transparent p-3 font-normal dark:border-white/20" /></label>)}
      <label className="flex items-start gap-2 text-sm md:col-span-2"><input type="checkbox" name="checked" required className="mt-1" />I checked these facts against the client's CV and verified answers.</label>
      <div className="md:col-span-2"><Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save CV for review</Button></div>
      {message ? <p role="status" className="text-sm md:col-span-2">{message}</p> : null}
    </form>
  </details>;
}
