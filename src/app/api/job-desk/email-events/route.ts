import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { nextDeliveryState, type DeliveryState } from "@/lib/job-desk/delivery-events";
import { queueClientUpdate } from "@/lib/job-desk/client-updates";

export const runtime = "nodejs";
const eventSchema = z.object({ type: z.string(), created_at: z.string().datetime(), data: z.object({ email_id: z.string().uuid() }) });

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  if (Number(request.headers.get("content-length") ?? 0) > 65536) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 65536) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let payload: unknown;
  try {
    new Webhook(secret).verify(raw, { "svix-id": request.headers.get("svix-id") ?? "", "svix-timestamp": request.headers.get("svix-timestamp") ?? "", "svix-signature": request.headers.get("svix-signature") ?? "" });
  } catch { return NextResponse.json({ error: "Invalid signature" }, { status: 401 }); }
  try { payload = JSON.parse(raw); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  const event = parsed.data;
  const incoming: DeliveryState = { event: event.type, at: event.created_at, eventId: request.headers.get("svix-id")! };
  if (!nextDeliveryState(undefined, incoming)) return NextResponse.json({ ignored: true });
  const db = createSupabaseAdminClient();
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data: application, error } = await db.from("job_desk_applications").select("id,order_id,match_id,provider_response").eq("provider_message_id", event.data.email_id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!application) {
        const { data: notification, error: notificationError } = await db.from("job_desk_tasks").select("id,result").eq("task_type", "notify_client").contains("result", { providerMessageId: event.data.email_id }).maybeSingle();
        if (notificationError) throw new Error(notificationError.message);
        if (notification) {
          const result = notification.result as Record<string, unknown>;
          const delivery = nextDeliveryState(result.delivery as DeliveryState | undefined, incoming);
          const { data: saved, error: saveError } = await db.from("job_desk_tasks").update({ result: { ...result, delivery } }).eq("id", notification.id).eq("result", JSON.stringify(result)).select("id").maybeSingle();
          if (saveError) throw new Error(saveError.message);
          if (!saved) continue;
          return NextResponse.json({ received: true });
        }
        // Webhook can arrive before the send task records its provider ID. Resend will retry.
        return NextResponse.json({ error: "Message evidence not recorded yet" }, { status: 503 });
      }
      const evidence = (application.provider_response ?? {}) as Record<string, unknown>;
      const next = nextDeliveryState(evidence.delivery as DeliveryState | undefined, incoming);
      if (!next) return NextResponse.json({ ignored: true });
      if (next !== evidence.delivery) {
        const { data: updated, error: updateError } = await db.from("job_desk_applications").update({ provider_response: { ...evidence, delivery: next } }).eq("id", application.id).eq("provider_response", JSON.stringify(application.provider_response)).select("id").maybeSingle();
        if (updateError) throw new Error(updateError.message);
        if (!updated) continue;
      }
      const update = next.event === "email.delivered" ? "application_delivered" : ["email.bounced", "email.failed", "email.complained"].includes(next.event) ? "application_delivery_failed" : null;
      if (update) await queueClientUpdate(application.order_id, update, application.match_id);
      return NextResponse.json({ received: true });
    }
    return NextResponse.json({ error: "Concurrent event; retry" }, { status: 503 });
  } catch { return NextResponse.json({ error: "Could not persist delivery event" }, { status: 503 }); }
}
