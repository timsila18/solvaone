"use client";

import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";

const intakeUrl = "https://solvaone.co.ke/job-desk";
const message = `Please submit your CV and job preferences through SolvaOne Job Desk: ${intakeUrl}`;

export function ShareIntakeLink() {
  const [status, setStatus] = useState("");
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" title="Copy client intake link" onClick={async () => {
      try { await navigator.clipboard.writeText(message); setStatus("Message copied. Paste it into your client's WhatsApp chat."); }
      catch { setStatus("Clipboard unavailable. Use the WhatsApp link instead."); }
    }} className="inline-flex h-10 items-center gap-2 border border-brand-blue px-3 text-sm font-bold text-brand-blue"><Copy className="h-4 w-4" />Copy message</button>
    <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 border border-black/20 px-3 text-sm font-bold dark:border-white/20"><MessageCircle className="h-4 w-4" />Share via WhatsApp</a>
    {status ? <span role="status" className="basis-full text-xs">{status}</span> : null}
  </div>;
}
