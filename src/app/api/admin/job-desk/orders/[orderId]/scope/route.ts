import { NextResponse } from "next/server";
import { z } from "zod";
import { applicationScopeHold, createApplicationScope } from "@/lib/job-desk/application-scope";
import { enqueueTask } from "@/lib/job-desk/automation";
import { scoreVacancy } from "@/lib/job-desk/matching";
import { hasVerifiedJobDeskPayment } from "@/lib/job-desk/payment";
import { logAdminAction, requireAdmin } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

const schema = z.object({
  targetRoles: z.string().trim().min(2).max(1000),
  preferredLocations: z.string().trim().max(1000),
  remotePreference: z.enum(["onsite", "hybrid", "remote", "flexible"]),
  excludedEmployers: z.string().trim().max(1000),
  excludedRoles: z.string().trim().max(1000),
  excludedKeywords: z.string().trim().max(1000),
  evidence: z.string().trim().min(8).max(1000)
});

async function admin() {
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) return null;
  return user;
}

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const user = await admin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Record the client's target roles, exclusions and explicit WhatsApp authorization." }, { status: 400 });
  const { orderId } = await params;
  const db = createSupabaseAdminClient();
  const { data: order } = await db.from("job_desk_orders").select("id,client_id,service_type,service_details,application_authorized,payment_status,amount,payment_reference,status,client:job_desk_clients(consent_to_process)").eq("id", orderId).maybeSingle();
  if (!order || order.service_type !== "job_search_full") return NextResponse.json({ error: "Job search order not found." }, { status: 404 });
  if (order.application_authorized) return NextResponse.json({ error: "Authorization is already recorded. Revoke it before requesting a new scope from the client." }, { status: 409 });
  const client = Array.isArray(order.client) ? order.client[0] : order.client;
  if (!client?.consent_to_process) return NextResponse.json({ error: "Client processing consent is missing." }, { status: 409 });
  const scope = createApplicationScope({ ...parsed.data, channel: "admin_recorded", evidence: parsed.data.evidence });
  const details = order.service_details && typeof order.service_details === "object" ? order.service_details as Record<string, unknown> : {};
  const { data: updated, error } = await db.from("job_desk_orders")
    .update({ application_authorized: true, service_details: { ...details, applicationScope: scope } })
    .eq("id", orderId).eq("application_authorized", false).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Authorization changed. Refresh the order." }, { status: 409 });
  await logAdminAction({ adminId: user.id, action: "job_desk.scope_authorized", targetType: "job_desk_order", targetId: orderId, details: { authorizedAt: scope.authorizedAt, channel: scope.channel, targetRoles: scope.targetRoles } });

  let queued = 0;
  if (hasVerifiedJobDeskPayment(order) && ["approved", "active"].includes(order.status)) {
    const [{ data: profile }, { data: cv }, { data: matches }] = await Promise.all([
      db.from("job_desk_candidate_profiles").select("*").eq("client_id", order.client_id).maybeSingle(),
      db.from("job_desk_documents").select("status").eq("order_id", orderId).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle(),
      db.from("job_desk_matches").select("id,reasons,cover_letter,vacancy:job_desk_vacancies(*)").eq("order_id", orderId).eq("status", "ready").limit(50)
    ]);
    if (profile && cv?.status === "approved") for (const match of matches ?? []) {
      const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
      if (!vacancy || vacancy.status !== "open" || vacancy.review_status !== "approved" || vacancy.duplicate_of ||
          Date.now() - new Date(vacancy.last_seen_at).getTime() > 72 * 3600000 ||
          !match.cover_letter || !(match.reasons as string[]).some((reason) => reason.startsWith("Suitability review:")) ||
          applicationScopeHold(scope, vacancy) || scoreVacancy(vacancy, profile).score < 50) continue;
      const { data: authorized } = await db.from("job_desk_matches")
        .update({ status: "authorized", authorized_at: new Date().toISOString(), authorized_ip_hash: null })
        .eq("id", match.id).eq("status", "ready").select("id").maybeSingle();
      if (authorized) {
        await enqueueTask("submit", `submit:${match.id}`, orderId, { matchId: match.id });
        queued += 1;
      }
    }
  }
  return NextResponse.json({ ok: true, queued });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const user = await admin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { orderId } = await params;
  const db = createSupabaseAdminClient();
  const { data: updated, error } = await db.from("job_desk_orders")
    .update({ application_authorized: false })
    .eq("id", orderId).eq("service_type", "job_search_full").select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Job search order not found." }, { status: 404 });
  await logAdminAction({ adminId: user.id, action: "job_desk.scope_revoked", targetType: "job_desk_order", targetId: orderId, details: {} });
  return NextResponse.json({ ok: true });
}
