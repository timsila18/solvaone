"use client";
import { useState } from "react";
import { Mail } from "lucide-react";

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
  return <div className="border-b border-black/10 py-4 dark:border-white/10"><button type="button" disabled={busy} onClick={test} className="inline-flex items-center gap-2 text-sm font-bold text-brand-blue"><Mail size={18} />{busy ? "Testing sender..." : "Test application email sender"}</button><p role="status" className="mt-2 text-sm">{message}</p></div>;
}
