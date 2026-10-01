import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeSafaricomPhone, requestJobDeskStkPush } from "@/lib/payments";
import { getJobDeskService } from "./services";

export async function reconcileJobDeskPayment(orderId: string) {
  const db = createSupabaseAdminClient();
  const { data: attempt } = await db.from("job_desk_payment_attempts").select("amount,mpesa_receipt_number").eq("order_id", orderId).eq("status", "successful").not("mpesa_receipt_number", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!attempt?.mpesa_receipt_number) return false;
  const { data: order } = await db.from("job_desk_orders").select("amount,status,payment_status,service_type").eq("id", orderId).single();
  if (!order || Number(order.amount) !== Number(attempt.amount)) return false;
  if (order.payment_status !== "paid") {
    const { error } = await db.from("job_desk_orders").update({ payment_status: "paid", payment_method: "mpesa", payment_reference: attempt.mpesa_receipt_number, paid_at: new Date().toISOString(), status: order.status === "awaiting_payment" ? "intake" : order.status }).eq("id", orderId).neq("payment_status", "paid");
    if (error) throw new Error("Payment was received but the order needs reconciliation. Contact support with your M-Pesa receipt.");
  }
  if (order.service_type === "job_search_full" && (order.status === "awaiting_payment" || order.status === "intake")) {
    const { data: cvFile } = await db.from("job_desk_intake_files").select("id").eq("order_id", orderId).eq("document_kind", "cv").eq("extraction_status", "succeeded").limit(1).maybeSingle();
    if (cvFile) {
      const { enqueueTask } = await import("./automation");
      await enqueueTask("process_cv", `process_cv:${orderId}:paid`, orderId);
    }
  }
  return true;
}

export async function startJobDeskPayment(orderId: string) {
  const db = createSupabaseAdminClient();
  const { data: order, error } = await db.from("job_desk_orders").select("id,service_type,payment_status,status,amount,client:job_desk_clients(whatsapp_phone)").eq("id", orderId).single();
  if (error || !order) throw new Error("Request not found.");
  const service = getJobDeskService(order.service_type);
  if (!service || Number(order.amount) !== service.price) throw new Error("Service price could not be verified.");
  if (await reconcileJobDeskPayment(orderId)) return { status: "successful" as const };
  if (order.payment_status === "paid") return { status: "successful" as const };
  if (order.status !== "awaiting_payment") throw new Error("This request is not awaiting payment.");
  const client = Array.isArray(order.client) ? order.client[0] : order.client;
  const phone = normalizeSafaricomPhone(client?.whatsapp_phone ?? "");
  const { data: last } = await db.from("job_desk_payment_attempts").select("id,status").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last && ["initiating", "processing"].includes(last.status)) return { status: last.status as "initiating" | "processing" };
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await db.from("job_desk_payment_attempts").select("id", { count: "exact", head: true }).eq("order_id", orderId).gte("created_at", since);
  if ((count ?? 0) >= 5) throw new Error("Too many payment attempts. Contact support before trying again.");
  const { data: attempt, error: createError } = await db.from("job_desk_payment_attempts").insert({ order_id: orderId, amount: service.price, phone_number: phone, status: "initiating" }).select("id").single();
  if (createError?.code === "23505") return { status: "processing" as const };
  if (createError || !attempt) throw new Error(createError?.message ?? "Could not start checkout.");
  let promptSent = false;
  try {
    const stk = await requestJobDeskStkPush({ phone, amount: service.price, orderId, description: service.name });
    promptSent = true;
    const { error: saveError } = await db.from("job_desk_payment_attempts").update({ status: "processing", checkout_request_id: stk.checkoutRequestId, merchant_request_id: stk.merchantRequestId }).eq("id", attempt.id);
    if (saveError) throw new Error("M-Pesa prompt sent, but its status could not be saved. Contact support before paying again.");
    await db.from("job_desk_payment_events").insert({ attempt_id: attempt.id, event_type: "stk_accepted", details: { checkout_request_id: stk.checkoutRequestId } });
    return { status: "processing" as const };
  } catch (cause) {
    if (!promptSent && cause instanceof Error && /^(M-Pesa rejected|Daraja credentials are not configured|Unable to authenticate with M-Pesa Daraja)/.test(cause.message)) await db.from("job_desk_payment_attempts").update({ status: "failed", result_description: cause.message.slice(0, 300) }).eq("id", attempt.id).eq("status", "initiating");
    await db.from("job_desk_payment_events").insert({ attempt_id: attempt.id, event_type: promptSent ? "stk_tracking_error" : "stk_initiation_error" });
    throw cause;
  }
}
