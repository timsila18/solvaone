"use client";

import { useState } from "react";
import { Copy, Link2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AnswerLinkControl({ orderId, count }: { orderId: string; count: number }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  async function request(action: "create" | "revoke") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/job-desk/orders/${orderId}/answer-link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update the answer link.");
      setUrl(action === "create" ? result.url : "");
      setMessage(action === "create" ? "Link expires in 48 hours. Share privately with this client, or record their verified WhatsApp answers through it. A new link replaces the previous one." : "Answer link revoked.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not update the answer link."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3 border-b border-black/10 pb-5 dark:border-white/10">
    <h2 className="text-lg font-bold">Missing application answers</h2>
    <div className="flex flex-wrap gap-2"><Button variant="secondary" type="button" disabled={busy || count === 0} onClick={() => request("create")}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}Create private answer link</Button><Button variant="secondary" type="button" disabled={busy} onClick={() => request("revoke")}><X className="h-4 w-4" />Revoke answer link</Button></div>
    {url ? <div className="flex gap-2"><input aria-label="Private client answer link" readOnly value={url} onFocus={event => event.target.select()} className="h-10 min-w-0 flex-1 border border-black/20 bg-white px-3 text-xs text-black" /><Button variant="secondary" type="button" title="Copy private answer link" aria-label="Copy private answer link" onClick={async () => { try { await navigator.clipboard.writeText(url); setMessage("Private link copied. Share it only with this client."); } catch { setMessage("Select and copy the link manually."); } }}><Copy className="h-4 w-4" /></Button><a href={url} target="_blank" rel="noopener noreferrer" className="self-center text-sm font-bold text-brand-blue underline">Open questions</a></div> : null}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
  </div>;
}
