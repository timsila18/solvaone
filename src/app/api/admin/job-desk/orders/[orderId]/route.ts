import { after, NextResponse } from "next/server";
import { z } from "zod";
import { logAdminAction, requireAdmin } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { enqueueTask } from "@/lib/job-desk/automation";
import { hasVerifiedJobDeskPayment } from "@/lib/job-desk/payment";
import { runJobDeskWorker } from "@/lib/job-desk/worker";
import { queueClientUpdate } from "@/lib/job-desk/client-updates";
import { applicantDetailsSchema } from "@/lib/job-desk/applicant-details";

export const runtime = "nodejs";
export const maxDuration = 60;

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve_cv") }),
  z.object({ action: z.literal("record_payment"), amount: z.number().positive().max(1000000), method: z.enum(["mpesa", "cash", "bank", "manual", "other"]), reference: z.string().trim().min(3).max(160) }),
  z.object({ action: z.literal("save_answers"), answers: z.record(z.string().max(4000)) }),
  z.object({ action: z.literal("set_client_email"), email: z.string().trim().email().max(254) }),
  z.object({ action: z.literal("save_applicant_details"), details: applicantDetailsSchema }),
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
  let queued = false;

  if (parsed.data.action === "approve_cv") {
    const { data: document, error: findError } = await db
      .from("job_desk_documents")
      .select("id")
      .eq("order_id", orderId)
      .eq("document_type", "revamped_cv")
      .in("status", ["review", "approved"])
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError || !document) return NextResponse.json({ error: findError?.message ?? "No CV is ready for approval." }, { status: 409 });
    const { error } = await db
      .from("job_desk_documents")
      .update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() })
      .eq("id", document.id)
      .eq("status", "review");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { error: statusError } = await db.from("job_desk_orders").update({ status: "approved" }).eq("id", orderId).in("status", ["cv_review", "approved"]);
    if (statusError) return NextResponse.json({ error: statusError.message }, { status: 500 });
    await queueClientUpdate(orderId, "cv_approved", document.id);
    const { data: paidOrder } = await db.from("job_desk_orders").select("payment_status,amount,payment_reference").eq("id", orderId).single();
    const { data: serviceOrder } = await db.from("job_desk_orders").select("service_type").eq("id", orderId).single();
    if (serviceOrder?.service_type === "job_search_full" && hasVerifiedJobDeskPayment(paidOrder)) {
      const { data: sources, error: sourceError } = await db.from("job_desk_sources").select("id").eq("active", true).limit(100);
      if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
      for (const source of sources ?? []) await enqueueTask("discover", `discover:${source.id}:approval:${document.id}`, null, { sourceId: source.id });
      await enqueueTask("match", `match:${orderId}:approval:${document.id}`, orderId);
      queued = true;
    }
  } else if (parsed.data.action === "record_payment") {
    const { data: order, error: findError } = await db.from("job_desk_orders").select("id,payment_status,payment_reference,amount,source_channel,status,service_type").eq("id", orderId).single();
    if (findError || !order) return NextResponse.json({ error: "Job Desk order was not found." }, { status: 404 });
    if (order.source_channel === "website" && Number(order.amount) !== parsed.data.amount) return NextResponse.json({ error: "Amount must match the service price for website orders." }, { status: 400 });
    if (order.payment_status === "paid" && Number(order.amount) > 0 && order.payment_reference && order.payment_reference !== parsed.data.reference) {
      return NextResponse.json({ error: "This order is already paid. Review its payment before changing the receipt." }, { status: 409 });
    }
    const { error } = await db.from("job_desk_orders").update({
      payment_status: "paid",
      payment_method: parsed.data.method,
      amount: parsed.data.amount,
      payment_reference: parsed.data.reference,
      paid_at: new Date().toISOString(),
      status: order.status === "awaiting_payment" ? "intake" : order.status
    }).eq("id", orderId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { data: cv } = await db.from("job_desk_documents").select("id").eq("order_id", orderId).eq("document_type", "revamped_cv").eq("status", "approved").limit(1).maybeSingle();
    if (cv && order.service_type === "job_search_full") { await enqueueTask("match", `match:${orderId}:payment`, orderId); queued = true; }
    else if (["cv_revamp", "cv_build", "job_search_full"].includes(order.service_type) && ["awaiting_payment", "intake", "failed", "awaiting_information"].includes(order.status)) {
      const { data: intake } = await db.from("job_desk_intake_files").select("id").eq("order_id", orderId).eq("document_kind", "cv").eq("extraction_status", "succeeded").limit(1).maybeSingle();
      if (intake) { await enqueueTask("process_cv", `process_cv:${orderId}:payment`, orderId); queued = true; }
    }
  } else if (parsed.data.action === "set_client_email") {
    const { data: order, error: findError } = await db.from("job_desk_orders").select("client_id").eq("id", orderId).single();
    if (findError || !order) return NextResponse.json({ error: "Job Desk order was not found." }, { status: 404 });
    const { error } = await db.from("job_desk_clients").update({ email: parsed.data.email }).eq("id", order.client_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (parsed.data.action === "save_applicant_details") {
    const { data: order, error: findError } = await db.from("job_desk_orders").select("service_type,service_details").eq("id", orderId).single();
    if (findError || !order) return NextResponse.json({ error: "Job Desk order was not found." }, { status: 404 });
    if (order.service_type !== "job_search_full") return NextResponse.json({ error: "Application details are only used for job-search orders." }, { status: 400 });
    const { error } = await db.from("job_desk_orders").update({ service_details: { ...(order.service_details ?? {}), applicantDetails: parsed.data.details } }).eq("id", orderId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (parsed.data.action === "save_answers") {
    const { data: questionnaire, error: findError } = await db.from("job_desk_questionnaires").select("id,questions,responses").eq("order_id", orderId).maybeSingle();
    if (findError || !questionnaire) return NextResponse.json({ error: "Process the CV before recording answers." }, { status: 409 });
    const questions = (questionnaire.questions ?? []) as Array<{ id: string; required?: boolean }>;
    const allowed = new Set(questions.map((question) => question.id));
    const answers = { ...(questionnaire.responses as Record<string, string> ?? {}) };
    for (const [id, answer] of Object.entries(parsed.data.answers)) {
      if (!allowed.has(id)) return NextResponse.json({ error: "A questionnaire item was not recognized." }, { status: 400 });
      answers[id] = answer.trim();
    }
    const complete = questions.every((question) => question.required === false || Boolean(answers[question.id]?.trim()));
    const { error } = await db.from("job_desk_questionnaires").update({ responses: answers, status: complete ? "answered" : "open" }).eq("id", questionnaire.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data: order } = await db.from("job_desk_orders").select("payment_status,amount,payment_reference,source_channel").eq("id", orderId).single();
    if (!order) return NextResponse.json({ error: "Job Desk order was not found." }, { status: 404 });
    if (order.source_channel === "website" && !hasVerifiedJobDeskPayment(order) && parsed.data.status !== "cancelled") return NextResponse.json({ error: "Confirm payment before advancing this website request." }, { status: 409 });
    const { error } = await db.from("job_desk_orders").update({ status: parsed.data.status }).eq("id", orderId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction({ adminId: user.id, action: `job_desk.${parsed.data.action}`, targetType: "job_desk_order", targetId: orderId, details: parsed.data.action === "save_answers" ? { answerCount: Object.keys(parsed.data.answers).length } : parsed.data.action === "save_applicant_details" ? { updatedFields: Object.keys(parsed.data.details) } : parsed.data });
  if (queued) after(async () => { try { await runJobDeskWorker({ maxTasks: 10, maxRunMs: 45000 }); } catch { /* The scheduled worker retains queued tasks. */ } });
  return NextResponse.json({ ok: true });
}
