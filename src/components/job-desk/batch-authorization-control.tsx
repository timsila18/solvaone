"use client";

import { useState } from "react";
import { Copy, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BatchAuthorizationControl({ orderId, readyCount }: { orderId: string; readyCount: number }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  async function create() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/job-desk/orders/${orderId}/batch-authorization`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not create the link.");
      setUrl(result.url); setMessage(`${result.count} applications are ready for client review.`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not create the link."); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage("Client approval link copied."); }
    catch { setMessage("Select and copy the link below."); }
  }
  return <div className="mt-4 space-y-2"><Button type="button" variant="secondary" onClick={create} disabled={busy || readyCount === 0}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}Create one client approval link ({readyCount})</Button>{url ? <div className="flex gap-2"><input aria-label="Client approval link" readOnly value={url} onFocus={(event) => event.target.select()} className="block h-10 min-w-0 flex-1 rounded border border-black/20 bg-white px-3 text-xs text-black" /><Button type="button" variant="secondary" onClick={copy} aria-label="Copy client approval link" title="Copy client approval link"><Copy className="h-4 w-4" /></Button></div> : null}{message ? <p role="status" className="text-sm">{message}</p> : null}</div>;
}
