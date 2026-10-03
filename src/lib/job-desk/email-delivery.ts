import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queueClientUpdate } from "./client-updates";
import { observedDelivery, terminalDeliveryEvents as terminal } from "./email-delivery-state";

// Read-only reconciliation: never retries an employer submission.
export async function reconcileEmailDeliveries({ force = false }: { force?: boolean } = {}) {
  const summary = { checked: 0, updated: 0, errors: 0, configurationBlocked: false, acceptedApplications: 0, delivered: 0, deliveryFailures: 0 };
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ...summary, configurationBlocked: true };
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("job_desk_applications")
    .select("id,order_id,match_id,provider_message_id,provider_response")
    .eq("status", "submitted").eq("method", "email").not("provider_message_id", "is", null)
    .order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  summary.acceptedApplications = data?.length ?? 0;
  summary.delivered = (data ?? []).filter((row: any) => row.provider_response?.delivery?.event === "email.delivered").length;
  summary.deliveryFailures = (data ?? []).filter((row: any) => terminal.has(row.provider_response?.delivery?.event) && row.provider_response?.delivery?.event !== "email.delivered").length;
  const due = (data ?? []).filter((row: any) => (force || !terminal.has(row.provider_response?.delivery?.event))
    && /^[a-f0-9-]{36}$/i.test(row.provider_message_id)
    && (force || !(Date.now() - Date.parse(row.provider_response?.deliveryPoll?.checkedAt ?? "") < 3600000)))
    .sort((a: any, b: any) => (Date.parse(a.provider_response?.deliveryPoll?.checkedAt ?? "") || 0) - (Date.parse(b.provider_response?.deliveryPoll?.checkedAt ?? "") || 0));
  // Repair notification enqueue failures independently of provider polling.
  for (const row of data ?? []) {
    const event = row.provider_response?.delivery?.event;
    if (!terminal.has(event)) continue;
    try { await queueClientUpdate(row.order_id, event === "email.delivered" ? "application_delivered" : "application_delivery_failed", row.match_id); }
    catch { summary.errors += 1; }
  }
  for (const row of due.slice(0, 5)) {
    try {
      const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(row.provider_message_id)}`, {
        headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(8000)
      });
      summary.checked += 1;
      if ([401, 403].includes(response.status)) { summary.configurationBlocked = true; break; }
      if (response.status === 429) { summary.errors += 1; break; }
      if (!response.ok) { summary.errors += 1; continue; }
      const now = new Date().toISOString();
      const previous = row.provider_response ?? {};
      const delivery = observedDelivery(await response.json(), row.provider_message_id, previous.delivery, now);
      if (!delivery) { summary.errors += 1; continue; }
      let update = db.from("job_desk_applications").update({ provider_response: {
        ...previous, delivery, deliveryPoll: { checkedAt: now }
      } }).eq("id", row.id).eq("status", "submitted").eq("provider_message_id", row.provider_message_id);
      update = row.provider_response === null ? update.is("provider_response", null) : update.eq("provider_response", JSON.stringify(row.provider_response));
      const { data: saved, error: saveError } = await update.select("id").maybeSingle();
      if (saveError) throw new Error(saveError.message);
      if (!saved) continue;
      summary.updated += 1;
      if (delivery.event === "email.delivered" && previous.delivery?.event !== delivery.event) summary.delivered += 1;
      if (terminal.has(delivery.event) && delivery.event !== "email.delivered" && !terminal.has(previous.delivery?.event)) summary.deliveryFailures += 1;
      if (terminal.has(delivery.event)) await queueClientUpdate(row.order_id, delivery.event === "email.delivered" ? "application_delivered" : "application_delivery_failed", row.match_id);
    } catch { summary.errors += 1; }
  }
  return summary;
}
