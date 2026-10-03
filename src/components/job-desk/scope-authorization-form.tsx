"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BroaderRoleFields } from "./broader-role-fields";
import type { ApplicationScope } from "@/lib/job-desk/application-scope";
import { searchLanePlan } from "@/lib/job-desk/search-lanes";

type Props = {
  orderId: string;
  authorized: boolean;
  scope?: ApplicationScope | null;
  targetRoles: string;
  preferredLocations: string;
  remotePreference: "onsite" | "hybrid" | "remote" | "flexible";
};

const fieldClass = "w-full rounded border border-black/20 bg-white p-2 text-sm text-black dark:border-white/20";

export function ScopeAuthorizationForm(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);

  async function record(formData: FormData) {
    setBusy(true); setMessage("");
    const body = Object.fromEntries(formData.entries());
    try {
      const response = await fetch(`/api/admin/job-desk/orders/${props.orderId}/scope`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not record authorization.");
      setMessage(`Search scope saved. ${result.queued} processing tasks queued.`);
      setEditing(false);
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

  return props.authorized && !editing ? <div className="space-y-2">
    {props.scope && <ul className="space-y-2 text-xs">{searchLanePlan(props.scope).map(lane => <li key={lane.id}><strong>{lane.label}:</strong> {lane.titles.join(", ")}</li>)}</ul>}
    <p className="text-xs leading-5">Jobs inside this recorded scope can advance automatically after CV approval. Portal steps still pause for a person.</p>
    <button type="button" onClick={revoke} disabled={busy} className="text-xs font-bold text-brand-blue disabled:opacity-50">Stop automatic applications</button>
    <button type="button" onClick={() => setEditing(true)} className="block text-xs font-bold text-brand-blue">Update accepted roles and general-job choices</button>
    {message ? <p role="status" className="text-xs">{message}</p> : null}
  </div> : <form action={record} className="space-y-3">
    <p className="text-xs leading-5">Record the client's agreement to these roles and locations, including any broader choices. Existing sent applications cannot be recalled.</p>
    <input type="hidden" name="previousAuthorizedAt" value={props.scope?.authorizedAt ?? ""} />
    <label className="grid gap-1 text-xs font-bold">Authorized target roles<input name="targetRoles" defaultValue={props.scope?.targetRoles.join(", ") ?? props.targetRoles} required maxLength={1000} className={fieldClass} /></label>
    <label className="grid gap-1 text-xs font-bold">Preferred locations<input name="preferredLocations" defaultValue={props.scope?.preferredLocations.join(", ") ?? props.preferredLocations} maxLength={1000} className={fieldClass} /></label>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="includeUnspecifiedKenyaLocations" value="true" defaultChecked={props.scope?.includeUnspecifiedKenyaLocations} className="mt-1 h-4 w-4 accent-brand-blue" /><span>Include Kenya-wide adverts with no city specified</span></label>
    <label className="grid gap-1 text-xs font-bold">Work arrangement<select name="remotePreference" defaultValue={props.scope?.remotePreference ?? props.remotePreference} className={fieldClass}><option value="flexible">Flexible</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></label>
    <label className="grid gap-1 text-xs font-bold">Employers to exclude<input name="excludedEmployers" defaultValue={props.scope?.excludedEmployers.join(", ")} maxLength={1000} className={fieldClass} /></label>
    <label className="grid gap-1 text-xs font-bold">Roles to exclude<input name="excludedRoles" defaultValue={props.scope?.excludedRoles.join(", ")} maxLength={1000} className={fieldClass} /></label>
    <label className="grid gap-1 text-xs font-bold">Other exclusions<input name="excludedKeywords" defaultValue={props.scope?.excludedKeywords.join(", ")} maxLength={1000} className={fieldClass} /></label>
    <BroaderRoleFields initial={props.scope} />
    <label className="grid gap-1 text-xs font-bold">WhatsApp authorization date and excerpt<input name="evidence" required minLength={8} maxLength={1000} className={fieldClass} /></label>
    <button type="submit" disabled={busy} className="rounded bg-brand-blue px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{props.authorized ? "Save agreed search scope" : "Record one-time authorization"}</button>
    {editing ? <button type="button" onClick={() => setEditing(false)} className="ml-3 text-xs font-bold">Cancel</button> : null}
    {message ? <p role="status" className="text-xs">{message}</p> : null}
  </form>;
}
