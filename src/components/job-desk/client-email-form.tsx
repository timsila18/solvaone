"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ClientEmailForm({ orderId, email }: { orderId: string; email: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  return <form className="space-y-2" onSubmit={async (event) => {
    event.preventDefault();
    setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/job-desk/orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_client_email", email: data.get("email") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save email.");
      setMessage("Client email saved for future application updates.");
      router.refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not save email."); }
    finally { setBusy(false); }
  }}>
    <label className="block text-xs font-bold uppercase" htmlFor="job-desk-client-email">Client email for updates</label>
    <div className="flex gap-2"><input id="job-desk-client-email" name="email" type="email" required defaultValue={email} className="h-10 min-w-0 flex-1 border border-black/20 bg-white px-2 text-sm text-black" /><button disabled={busy} className="h-10 bg-brand-blue px-3 text-sm font-bold text-white disabled:opacity-50">Save</button></div>
    {message ? <p role="status" className="text-xs">{message}</p> : null}
  </form>;
}
