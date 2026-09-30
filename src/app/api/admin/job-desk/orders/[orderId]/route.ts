import { NextResponse } from "next/server";
import { z } from "zod";
import { logAdminAction, requireAdmin } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { enqueueTask } from "@/lib/job-desk/automation";
import { hasVerifiedJobDeskPayment } from "@/lib/job-desk/payment";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve_cv") }),
  z.object({ action: z.literal("record_payment"), amount: z.number().positive().max(1000000), method: z.enum(["mpesa", "cash", "bank", "manual", "other"]), reference: z.string().trim().min(3).max(160) }),
  z.object({ action: z.literal("set_status"), status: z.enum(["intake", "awaiting_information", "cv_review", "approved", "active", "paused", "completed", "cancelled", "failed"]) })
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireAdmin(user);
  if (!access.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid Job Desk action." }, { status: 400 });
  const { orderId } = await params;
  const db = createSupabaseAdminClient();

  if (parsed.data.action === "approve_cv") {
    const { data: document, error: findError } = await db
      .from("job_desk_documents")
      .select("id")
      .eq("order_id", orderId)
      .eq("document_type", "revamped_cv")
      .eq("status", "review")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError || !document) return NextResponse.json({ error: findError?.message ?? "No CV is ready for approval." }, { status: 409 });
    const { error } = await db
      .from("job_desk_documents")
      .update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() })
      .eq("id", document.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await db.from("job_desk_orders").update({ status: "approved" }).eq("id", orderId);
    const { data: paidOrder } = await db.from("job_desk_orders").select("payment_status,amount,payment_reference").eq("id", orderId).single();
    if (hasVerifiedJobDeskPayment(paidOrder)) await enqueueTask("match", `match:${orderId}:approval`, orderId);
  } else if (parsed.data.action === "record_payment") {
    const { data: order, error: findError } = await db.from("job_desk_orders").select("id,payment_status,payment_reference,amount").eq("id", orderId).single();
    if (findError || !order) return NextResponse.json({ error: "Job Desk order was not found." }, { status: 404 });
    if (order.payment_status === "paid" && Number(order.amount) > 0 && order.payment_reference && order.payment_reference !== parsed.data.reference) {
      return NextResponse.json({ error: "This order is already paid. Review its payment before changing the receipt." }, { status: 409 });
    }
    const { error } = await db.from("job_desk_orders").update({
      payment_status: "paid",
      payment_method: parsed.data.method,
      amount: parsed.data.amount,
      payment_reference: parsed.data.reference,
      paid_at: new Date().toISOString()
    }).eq("id", orderId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { data: cv } = await db.from("job_desk_documents").select("id").eq("order_id", orderId).eq("document_type", "revamped_cv").eq("status", "approved").limit(1).maybeSingle();
    if (cv) await enqueueTask("match", `match:${orderId}:payment`, orderId);
  } else {
    const { error } = await db.from("job_desk_orders").update({ status: parsed.data.status }).eq("id", orderId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction({ adminId: user.id, action: `job_desk.${parsed.data.action}`, targetType: "job_desk_order", targetId: orderId, details: parsed.data });
  return NextResponse.json({ ok: true });
}
