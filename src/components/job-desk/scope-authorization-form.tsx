"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  orderId: string;
  authorized: boolean;
  targetRoles: string;
  preferredLocations: string;
  remotePreference: "onsite" | "hybrid" | "remote" | "flexible";
};

const fieldClass = "w-full rounded border border-black/20 bg-white p-2 text-sm text-black dark:border-white/20";

export function ScopeAuthorizationForm(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function record(formData: FormData) {
    setBusy(true); setMessage("");
    const body = Object.fromEntries(formData.entries());
    try {
      const response = await fetch(`/api/admin/job-desk/orders/${props.orderId}/scope`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not record authorization.");
      setMessage(`Authorization recorded. ${result.queued} prepared applications queued.`);
      router.refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not record authorization."); }
    finally { setBusy(false); }
  }

  async function revoke() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/job-desk/orders/${props.orderId}/scope`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not stop automatic applications.");
      setMessage("Automatic application authorization stopped. Applications already sent cannot be recalled.");
      router.refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not stop automatic applications."); }
    finally { setBusy(false); }
  }

  return props.authorized ? <div className="space-y-2">
    <p className="text-xs leading-5">Jobs inside this recorded scope can advance automatically after CV approval. Portal steps still pause for a person.</p>
    <button type="button" onClick={revoke} disabled={busy} className="text-xs font-bold text-brand-blue disabled:opacity-50">Stop automatic applications</button>
    {message ? <p role="status" className="text-xs">{message}</p> : null}
  </div> : <form action={record} className="space-y-3">
    <p className="text-xs leading-5">For an existing order, first ask the client once whether SolvaOne may apply within this exact scope. A CV sent on WhatsApp is not enough by itself.</p>
    <label className="grid gap-1 text-xs font-bold">Authorized target roles<input name="targetRoles" defaultValue={props.targetRoles} required maxLength={1000} className={fieldClass} /></label>
    <label className="grid gap-1 text-xs font-bold">Preferred locations<input name="preferredLocations" defaultValue={props.preferredLocations} maxLength={1000} className={fieldClass} /></label>
    <label className="grid gap-1 text-xs font-bold">Work arrangement<select name="remotePreference" defaultValue={props.remotePreference} className={fieldClass}><option value="flexible">Flexible</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></label>
    <label className="grid gap-1 text-xs font-bold">Employers to exclude<input name="excludedEmployers" maxLength={1000} className={fieldClass} /></label>
    <label className="grid gap-1 text-xs font-bold">Roles to exclude<input name="excludedRoles" maxLength={1000} className={fieldClass} /></label>
    <label className="grid gap-1 text-xs font-bold">Other exclusions<input name="excludedKeywords" maxLength={1000} className={fieldClass} /></label>
    <label className="grid gap-1 text-xs font-bold">WhatsApp authorization date and excerpt<input name="evidence" required minLength={8} maxLength={1000} className={fieldClass} /></label>
    <button type="submit" disabled={busy} className="rounded bg-brand-blue px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Record one-time authorization</button>
    {message ? <p role="status" className="text-xs">{message}</p> : null}
  </form>;
}
