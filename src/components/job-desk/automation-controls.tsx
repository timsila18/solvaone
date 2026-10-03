"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FeedProvider } from "@/lib/job-desk/vacancy-feeds";

export function AutomationControls({ action, id = "", label, provider, siteToken, companyName }: { action: "add_source" | "discover" | "match" | "send_report" | "prepare" | "retry_application" | "authorize_link" | "run_queue" | "refresh_all" | "connect_catalogue"; id?: string; label: string; provider?: FeedProvider; siteToken?: string; companyName?: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function run() {
    setBusy(true); setMessage("");
    try {
      const key = action === "discover" ? "sourceId" : action === "match" || action === "send_report" ? "orderId" : "matchId";
      const payload = action === "add_source" ? { action, provider, siteToken, companyName } : action === "run_queue" || action === "refresh_all" || action === "connect_catalogue" ? { action } : { action, [key]: id };
      const response = await fetch("/api/admin/job-desk/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Action failed.");
      setMessage(body.authorizationUrl ?? (action === "run_queue" ? `${body.processed ?? 0} tasks attempted.` : action === "refresh_all" || action === "connect_catalogue" ? `${body.queued ?? 0} sources queued for refresh.` : action === "add_source" ? "Connected. First refresh queued." : "Queued. Refresh to see progress."));
      router.refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Action failed."); }
    finally { setBusy(false); }
  }
  return <div><button type="button" onClick={run} disabled={busy} className="rounded border border-brand-blue px-3 py-2 text-xs font-bold text-brand-blue disabled:opacity-50">{busy ? "Working..." : label}</button>{message ? <p role="status" className="mt-2 break-all text-xs">{message.startsWith("http") ? <a href={message} className="text-brand-blue underline" target="_blank" rel="noopener noreferrer">{message}</a> : message}</p> : null}</div>;
}
