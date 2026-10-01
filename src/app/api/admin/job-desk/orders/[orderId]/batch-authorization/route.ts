import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction } from "@/lib/security";
import { hasVerifiedJobDeskPayment } from "@/lib/job-desk/payment";
import { createBatchToken, batchVacancyIsCurrent } from "@/lib/job-desk/batch-authorization";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && (!host || new URL(origin).host !== host)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { orderId } = await params;
  const db = createSupabaseAdminClient();
  const { data: order } = await db.from("job_desk_orders").select("id,service_type,payment_status,amount,payment_reference").eq("id", orderId).single();
  if (!order || order.service_type !== "job_search_full" || !hasVerifiedJobDeskPayment(order)) return NextResponse.json({ error: "Paid job hunting order required." }, { status: 409 });
  const { data: cv } = await db.from("job_desk_documents").select("status").eq("order_id", orderId).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle();
  if (cv?.status !== "approved") return NextResponse.json({ error: "Approve the latest CV first." }, { status: 409 });
  const { data: matches, error } = await db.from("job_desk_matches").select("id,cover_letter,reasons,vacancy:job_desk_vacancies(status,review_status,duplicate_of,last_seen_at,description)").eq("order_id", orderId).eq("status", "ready").order("score", { ascending: false }).limit(10);
  if (error) return NextResponse.json({ error: "Could not load prepared applications." }, { status: 500 });
  const eligible = (matches ?? []).filter((match) => {
    const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
    return match.cover_letter && batchVacancyIsCurrent(vacancy) && (match.reasons as string[]).some((reason) => reason.startsWith("Suitability review:"));
  });
  if (!eligible.length) return NextResponse.json({ error: "No prepared, current applications are ready for client authorization." }, { status: 409 });
  const { token, hash } = createBatchToken();
  const { error: insertError } = await db.from("job_desk_authorization_batches").insert({ order_id: orderId, token_hash: hash, match_ids: eligible.map((match) => match.id), expires_at: new Date(Date.now() + 48 * 3600000).toISOString(), created_by: user.id });
  if (insertError) return NextResponse.json({ error: "Could not create the authorization link." }, { status: 500 });
  await logAdminAction({ adminId: user.id, action: "job_desk.batch_authorization_created", targetType: "job_desk_order", targetId: orderId, details: { count: eligible.length } });
  return NextResponse.json({ url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://solvaone.co.ke"}/job-desk/authorize-batch/${token}`, count: eligible.length });
}
