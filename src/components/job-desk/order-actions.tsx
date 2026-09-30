"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function JobDeskOrderActions({ orderId, canProcess, canApprove, currentStatus, paymentStatus, paymentNeedsReview = false }: { orderId: string; canProcess: boolean; canApprove: boolean; currentStatus: string; paymentStatus: string; paymentNeedsReview?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"process" | "approve" | "status" | "payment" | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(currentStatus);
  const [showPayment, setShowPayment] = useState(false);

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

  async function recordPayment(formData: FormData) {
    setBusy("payment");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/job-desk/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "record_payment", amount: Number(formData.get("amount")), method: formData.get("method"), reference: formData.get("reference") })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Payment could not be recorded.");
      setMessage("Payment marked paid with the reference provided.");
      setShowPayment(false);
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Payment could not be recorded.");
    } finally { setBusy(null); }
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
      {paymentStatus !== "paid" || paymentNeedsReview ? <Button variant="secondary" onClick={() => setShowPayment(!showPayment)} disabled={busy !== null}>{paymentNeedsReview ? "Verify payment record" : "Record payment"}</Button> : null}
      {showPayment ? <form action={recordPayment} className="flex basis-full flex-wrap gap-2 border-t border-black/10 pt-3 dark:border-white/10">
        <input name="amount" type="number" min="1" step="0.01" required placeholder="Amount in KES" aria-label="Amount in KES" className="h-10 w-36 rounded border border-black/20 bg-white px-2 text-sm text-black" />
        <select name="method" aria-label="Payment method" defaultValue="mpesa" className="h-10 rounded border border-black/20 bg-white px-2 text-sm text-black"><option value="mpesa">M-Pesa</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="manual">Manual</option><option value="other">Other</option></select>
        <input name="reference" required minLength={3} maxLength={160} placeholder="Verified receipt/reference" aria-label="Verified receipt or reference" className="h-10 min-w-52 flex-1 rounded border border-black/20 bg-white px-2 text-sm text-black" />
        <Button type="submit" disabled={busy !== null}>Confirm verified payment</Button>
      </form> : null}
      {message ? <p className="basis-full text-sm font-semibold text-black/65 dark:text-white/65">{message}</p> : null}
    </div>
  );
}
