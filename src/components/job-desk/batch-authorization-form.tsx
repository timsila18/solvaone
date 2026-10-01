"use client";

import { useState } from "react";

type Option = { id: string; title: string; company: string; location: string; url: string; method: string; letter: string };

export function BatchAuthorizationForm({ token, options }: { token: string; options: Option[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/job-desk/authorize-batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, matchIds: selected, authorized: confirmed }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not record approval.");
      setMessage(`${body.count} selected applications authorized. SolvaOne will process supported submissions and flag any that need your participation.${body.needsReview ? " Some selections need a new approval link from Job Desk." : ""}`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not record approval."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-8 space-y-5">{options.map((option) => <section key={option.id} className="border-t border-black/15 py-5"><label className="flex gap-3"><input type="checkbox" checked={selected.includes(option.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id))} className="mt-1 h-4 w-4 accent-blue-600" /><span><strong>{option.title}</strong><span className="block text-sm">{option.company} · {option.location}</span></span></label><p className="mt-2 text-xs">{option.method === "email" ? "Verified employer email" : "Employer portal; additional participation may be needed"}</p><a href={option.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-bold text-blue-600">View original vacancy</a><details className="mt-3 text-sm"><summary className="cursor-pointer font-bold">Prepared cover letter</summary><pre className="mt-2 whitespace-pre-wrap font-sans leading-6">{option.letter}</pre></details></section>)}<label className="flex gap-3 border-t border-black/15 pt-5 text-sm leading-6"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} required className="mt-1 h-4 w-4 accent-blue-600" /><span>I authorize SolvaOne to use my approved CV and tailored letters only for the selected vacancies. I understand that some employer portals require my participation.</span></label><button type="submit" disabled={!confirmed || !selected.length || busy} className="h-11 rounded bg-blue-600 px-5 font-bold text-white disabled:opacity-50">{busy ? "Recording approval..." : `Authorize ${selected.length} selected applications`}</button>{message ? <p role="status" className="text-sm font-semibold">{message}</p> : null}</form>;
}
