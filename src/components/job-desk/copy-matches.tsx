"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

export function CopyMatches({ jobs }: { jobs: Array<{ title: string; company: string; location: string; url: string }> }) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(jobs.map((job, index) => `${index + 1}. ${job.title} | ${job.company} | ${job.location}\n${job.url}`).join("\n\n"));
      setStatus(`${jobs.length} current application links copied.`);
    } catch { setStatus("Clipboard access was blocked by the browser. Open the links individually below."); }
  }
  return <div className="flex items-center gap-2"><button type="button" onClick={copy} disabled={!jobs.length} className="inline-flex items-center gap-2 rounded border border-brand-blue px-3 py-2 text-xs font-bold text-brand-blue disabled:opacity-50"><Copy className="h-4 w-4" />Copy all matches</button><span role="status" className="text-xs">{status}</span></div>;
}

export function CopyCandidateDetails({ details }: { details: string }) {
  const [status, setStatus] = useState("");
  return <div className="flex items-center gap-2"><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(details); setStatus("Verified CV details copied."); } catch { setStatus("Clipboard unavailable."); } }} className="inline-flex items-center gap-2 rounded border border-brand-blue px-3 py-2 text-xs font-bold text-brand-blue"><Copy className="h-4 w-4" />Copy application details</button><span role="status" className="text-xs">{status}</span></div>;
}
