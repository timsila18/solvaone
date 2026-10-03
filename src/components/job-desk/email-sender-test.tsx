"use client";
import { useState } from "react";
import { Mail, MailCheck } from "lucide-react";

export function EmailSenderTest() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function test() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/job-desk/email-test", { method: "POST" });
      const result = await response.json();
      setMessage(result.message || result.error || "Sender test failed.");
    } catch { setMessage("Could not reach the sender test. Please retry."); }
    finally { setBusy(false); }
  }
  async function delivery() {
    setBusy(true);
    try {
      const response = await fetch("/api/job-desk/delivery-check", { method: "POST" });
      const result = await response.json();
      setMessage(!response.ok ? result.error : result.configurationBlocked ? "Resend retrieval permission is missing. Configure a key with email read access; existing accepted applications will not be resent." : `${result.checked} emails checked. ${result.delivered} verified deliveries; ${result.deliveryFailures} delivery failures in the latest 500 accepted email applications.${result.errors ? ` ${result.errors} checks need review.` : ""}${!result.checked ? " No provider status was checked in this run." : ""}`);
    } catch { setMessage("Delivery check could not complete. No application was resent."); }
    finally { setBusy(false); }
  }
  return <div className="border-b border-black/10 py-4 dark:border-white/10"><div className="flex flex-wrap gap-5"><button type="button" disabled={busy} onClick={test} className="inline-flex items-center gap-2 text-sm font-bold text-brand-blue"><Mail size={18} />Test application email sender</button><button type="button" disabled={busy} onClick={delivery} className="inline-flex items-center gap-2 text-sm font-bold text-brand-blue"><MailCheck size={18} />Check application delivery</button></div><p role="status" aria-live="polite" className="mt-2 text-sm">{busy ? "Checking..." : message}</p></div>;
}
