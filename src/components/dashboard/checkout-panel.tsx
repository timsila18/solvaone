"use client";

import { ArrowRight, CheckCircle2, Loader2, Phone, RefreshCw } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trackEvent } from "@/lib/analytics";
import { pricingProducts, type ProductId } from "@/lib/pricing";
import { formatKes } from "@/lib/utils";

type CheckoutPanelProps = {
  projectId: string;
  productId: ProductId;
  initialPaymentId?: string | null;
  initialStatus?: Status;
  initialMessage?: string | null;
};

type Status = "pending" | "processing" | "successful" | "failed" | "cancelled" | "timed_out" | "paid";

export function CheckoutPanel({ projectId, productId, initialPaymentId = null, initialStatus = "pending", initialMessage = null }: CheckoutPanelProps) {
  const product = pricingProducts[productId];
  const generationProduct = productId === "cv_cover_bundle" ? "cv_builder" : productId;
  const [phone, setPhone] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(initialPaymentId);
  const [status, setStatus] = useState<Status>(initialStatus);
  const [message, setMessage] = useState(
    initialStatus === "successful" || initialStatus === "paid"
      ? "Payment confirmed. You can generate, edit, and download your document."
      : initialMessage ?? "Enter your Safaricom number to receive the M-Pesa STK prompt."
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    trackEvent("start_checkout", { projectId, productId });
  }, [projectId, productId]);

  function initiatePayment() {
    startTransition(async () => {
      setStatus("processing");
      setMessage("Sending STK Push. Check your phone and enter your M-Pesa PIN.");
      const response = await fetch("/api/mpesa/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, productId, phone })
      });
      const payload = await response.json();
      if (!response.ok) {
        setStatus("failed");
        setMessage(payload.error ?? "Payment failed. Confirm the phone number and try again.");
        trackEvent("payment_failed", { projectId, productId, reason: payload.error });
        return;
      }
      setPaymentId(payload.paymentId);
      trackEvent("payment_initiated", { projectId, productId, paymentId: payload.paymentId });
      setMessage("Payment request sent. M-Pesa callbacks can take a few seconds to update.");
    });
  }

  useEffect(() => {
    if (!paymentId || status !== "processing") return;
    const startedAt = Date.now();
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/payments/status?paymentId=${paymentId}`);
      const payload = await response.json();
      const nextStatus = payload.payment?.status as Status | undefined;
      if (nextStatus === "successful" || nextStatus === "paid" || nextStatus === "failed" || nextStatus === "cancelled" || nextStatus === "timed_out") {
        setStatus(nextStatus);
        setMessage(
          nextStatus === "successful" || nextStatus === "paid"
            ? "Payment confirmed. You can generate and download your document."
            : payload.payment?.result_description ?? "Payment was not completed. You can retry."
        );
        trackEvent(nextStatus === "successful" || nextStatus === "paid" ? "payment_successful" : "payment_failed", { projectId, productId, paymentId, status: nextStatus });
        window.clearInterval(interval);
      }
      if (Date.now() - startedAt > 120000) {
        setStatus("timed_out");
        setMessage("The payment confirmation is delayed. You can retry or refresh status from your dashboard.");
        window.clearInterval(interval);
      }
    }, 4000);
    return () => window.clearInterval(interval);
  }, [paymentId, status]);

  return (
    <section className="rounded-lg border border-black/10 p-5 dark:border-white/10">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-3xl font-black">Checkout</h1>
          <p className="mt-2 text-sm text-black/55 dark:text-white/55">SolvaOne secure M-Pesa checkout.</p>
        </div>
        <div className="rounded-lg bg-brand-blue px-4 py-3 text-right text-white">
          <p className="text-xs font-bold uppercase">Amount</p>
          <p className="text-2xl font-black">{formatKes(product.price)}</p>
        </div>
      </div>
      <div className="mt-6 rounded-lg bg-black p-5 text-white">
        <h2 className="text-xl font-black">{product.productName}</h2>
        <p className="mt-2 text-sm leading-6 text-white/65">{product.description}</p>
        <ul className="mt-4 grid gap-2 text-sm md:grid-cols-2">
          {product.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-brand-blue" />
              {feature}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto]">
        <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="2547XXXXXXXX or 07XXXXXXXX" />
        <Button onClick={initiatePayment} disabled={isPending || status === "processing" || !phone}>
          {isPending || status === "processing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
          Pay with M-Pesa
        </Button>
      </div>
      <div className="mt-5 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <p className="text-sm font-black capitalize">Status: {status.replace("_", " ")}</p>
        <p className="mt-2 text-sm leading-6 text-black/55 dark:text-white/55">{message}</p>
        {(status === "failed" || status === "cancelled" || status === "timed_out") && (
          <Button className="mt-4" variant="secondary" onClick={initiatePayment}>
            <RefreshCw className="h-4 w-4" /> Retry payment
          </Button>
        )}
        {(status === "successful" || status === "paid") && (
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href={`/dashboard/projects/new?product=${generationProduct}&projectId=${projectId}`}>
              Continue to Generate & Download <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/dashboard/documents" variant="secondary">
              Open My Documents
            </ButtonLink>
          </div>
        )}
      </div>
    </section>
  );
}
