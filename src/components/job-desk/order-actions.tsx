"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function JobDeskOrderActions({ orderId, canProcess, canApprove, currentStatus }: { orderId: string; canProcess: boolean; canApprove: boolean; currentStatus: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"process" | "approve" | "status" | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(currentStatus);

  async function run(action: "process" | "approve") {
    setBusy(action);
    setMessage("");
    try {
      const response = await fetch(
        action === "process" ? `/api/admin/job-desk/orders/${orderId}/process` : `/api/admin/job-desk/orders/${orderId}`,
        action === "process"
          ? { method: "POST" }
          : { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve_cv" }) }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The action could not be completed.");
      setMessage(action === "process" ? (body.reused ? "Existing verified processing result reused." : "CV processed and ready for review.") : "CV approved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The action could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  async function updateStatus() {
    setBusy("status");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/job-desk/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_status", status })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to update the order status.");
      setMessage("Order status updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the order status.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => run("process")} disabled={!canProcess || busy !== null}>
        {busy === "process" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Prepare CV and profile
      </Button>
      <Button variant="secondary" onClick={() => run("approve")} disabled={!canApprove || busy !== null}>
        {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Approve CV
      </Button>
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm font-semibold dark:border-white/15 dark:bg-white/10">
        <option value="intake">Intake</option><option value="awaiting_information">Awaiting information</option><option value="cv_review">CV review</option><option value="approved">Approved</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="failed">Failed</option>
      </select>
      <Button variant="ghost" onClick={updateStatus} disabled={busy !== null || status === currentStatus}>
        {busy === "status" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Update status
      </Button>
      {message ? <p className="basis-full text-sm font-semibold text-black/65 dark:text-white/65">{message}</p> : null}
    </div>
  );
}
