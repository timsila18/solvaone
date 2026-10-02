import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, checkRateLimit, rateLimitResponse, logAdminAction } from "@/lib/security";
import { hasVerifiedJobDeskPayment } from "@/lib/job-desk/payment";
import { batchVacancyIsCurrent } from "@/lib/job-desk/batch-authorization";
import { createAnswerToken, makeAssistedQuestion, readAnswerRequest } from "@/lib/job-desk/assisted-answers";
import { canRetrySubmission } from "@/lib/job-desk/submission-preflight";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limited = checkRateLimit(`answer-link:${user.id}`, 20, 3600000);
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);
  const { orderId } = await params;
  const db = createSupabaseAdminClient();
  const { data: order, error } = await db.from("job_desk_orders").select("service_type,status,service_details,updated_at,payment_status,amount,payment_reference,application_authorized").eq("id", orderId).single();
  if (error || !order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const input = await request.json().catch(() => ({}));
  if (input.action === "revoke") {
    const snapshot = readAnswerRequest(order.service_details);
    if (snapshot) {
      const { error: revokeError } = await db.from("job_desk_authorization_batches").update({ consumed_at: new Date().toISOString() }).eq("id", snapshot.batchId).eq("order_id", orderId).is("consumed_at", null);
      if (revokeError) return NextResponse.json({ error: "Could not revoke the link." }, { status: 500 });
    }
    await logAdminAction({ adminId: user.id, action: "job_desk.answer_link_revoked", targetType: "job_desk_order", targetId: orderId });
    return NextResponse.json({ ok: true });
  }
  if (order.service_type !== "job_search_full" || !["approved", "active"].includes(order.status) || !hasVerifiedJobDeskPayment(order) || !order.application_authorized) return NextResponse.json({ error: "An active paid order with recorded authorization is required." }, { status: 409 });
  const { data: cv } = await db.from("job_desk_documents").select("id,status").eq("order_id", orderId).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle();
  if (cv?.status !== "approved") return NextResponse.json({ error: "Approve the latest CV first." }, { status: 409 });
  const { data: matches, error: matchError } = await db.from("job_desk_matches").select("id,reasons,vacancy:job_desk_vacancies(title,company_name,apply_url,status,review_status,duplicate_of,last_seen_at,description),application:job_desk_applications(status,provider_response)").eq("order_id", orderId).eq("status", "needs_human").order("score", { ascending: false }).limit(50);
  if (matchError) return NextResponse.json({ error: "Could not load application questions." }, { status: 500 });
  const eligible = (matches ?? []).filter(match => {
    const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
    const application = Array.isArray(match.application) ? match.application[0] : match.application;
    const evidence = application?.provider_response as { preflight?: { blockers?: unknown[] } } | null;
    return batchVacancyIsCurrent(vacancy) && canRetrySubmission(application) && Array.isArray(evidence?.preflight?.blockers) && evidence.preflight.blockers.length && (match.reasons as string[]).some(reason => reason.startsWith("Suitability review:"));
  }).slice(0, 10);
  const questions = eligible.flatMap(match => {
    const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
    const application = Array.isArray(match.application) ? match.application[0] : match.application;
    const evidence = application?.provider_response as { preflight?: { blockers?: string[] } } | null;
    return [...new Set(evidence?.preflight?.blockers ?? [])].filter(label => typeof label === "string" && label.length <= 4000).map(label => makeAssistedQuestion(match.id, label, vacancy));
  }).slice(0, 80);
  if (!questions.length) return NextResponse.json({ error: "No current, safely retryable application questions are available." }, { status: 409 });
  const { token, hash } = createAnswerToken();
  const expiresAt = new Date(Date.now() + 48 * 3600000).toISOString();
  const { data: batch, error: batchError } = await db.from("job_desk_authorization_batches").insert({ order_id: orderId, token_hash: hash, match_ids: [...new Set(questions.map(question => question.matchId))], expires_at: expiresAt, created_by: user.id }).select("id").single();
  if (batchError || !batch) return NextResponse.json({ error: "Could not create the answer link." }, { status: 500 });
  const { data: saved, error: saveError } = await db.from("job_desk_orders").update({ service_details: { ...(order.service_details ?? {}), answerRequest: { batchId: batch.id, cvId: cv.id, questions, expiresAt } } }).eq("id", orderId).eq("updated_at", order.updated_at).select("id").maybeSingle();
  if (saveError || !saved) {
    await db.from("job_desk_authorization_batches").update({ consumed_at: new Date().toISOString() }).eq("id", batch.id);
    return NextResponse.json({ error: "The order changed. Refresh and create a new link." }, { status: 409 });
  }
  await logAdminAction({ adminId: user.id, action: "job_desk.answer_link_created", targetType: "job_desk_order", targetId: orderId, details: { count: questions.length, batchId: batch.id } });
  return NextResponse.json({ url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://solvaone.co.ke"}/job-desk/answers/${token}`, count: questions.length, expiresAt }, { headers: { "Cache-Control": "no-store" } });
}
