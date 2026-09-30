"use client";
import { useState } from "react";
export function AuthorizationForm({ token }: { token: string }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <form className="mt-8 border-t border-black/15 pt-6" onSubmit={async (event) => { event.preventDefault(); setBusy(true); const response = await fetch("/api/job-desk/authorize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, authorized: checked }) }); const body = await response.json().catch(() => ({})); setMessage(response.ok ? "Authorization recorded. The Job Desk will process this application." : body.error ?? "Authorization could not be recorded."); setBusy(false); }}><label className="flex gap-3 text-sm leading-6"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} required className="mt-1" /><span>I authorize SolvaOne Job Desk to use my approved CV and this cover letter for this specific vacancy only. I understand an external portal may require my participation.</span></label><button type="submit" disabled={!checked || busy} className="mt-5 h-11 rounded bg-brand-blue px-5 font-bold text-white disabled:opacity-50">{busy ? "Recording..." : "Authorize this application"}</button>{message ? <p role="status" className="mt-3 text-sm font-semibold">{message}</p> : null}</form>;
}
