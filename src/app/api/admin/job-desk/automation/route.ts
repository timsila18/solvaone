import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction, logSystemEvent } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAuthorizationToken, enqueueTask } from "@/lib/job-desk/automation";
import { hasVerifiedJobDeskPayment } from "@/lib/job-desk/payment";
import { runJobDeskWorker } from "@/lib/job-desk/worker";
import { expiredDeadline } from "@/lib/job-desk/matching";
import { queueClientUpdate } from "@/lib/job-desk/client-updates";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add_source"), provider: z.enum(["greenhouse", "lever", "ashby", "smartrecruiters"]), siteToken: z.string().regex(/^[a-zA-Z0-9_-]{2,80}$/), companyName: z.string().min(2).max(120) }),
  z.object({ action: z.literal("discover"), sourceId: z.string().uuid() }),
  z.object({ action: z.literal("match"), orderId: z.string().uuid() }),
  z.object({ action: z.literal("prepare"), matchId: z.string().uuid() }),
  z.object({ action: z.literal("authorize_link"), matchId: z.string().uuid() }),
  z.object({ action: z.literal("record_submission"), matchId: z.string().uuid(), confirmation: z.string().trim().min(5).max(300), personallySubmitted: z.literal(true) }),
  z.object({ action: z.literal("run_queue") }),
  z.object({ action: z.literal("refresh_all") }),
  z.object({ action: z.literal("review_vacancy"), vacancyId: z.string().uuid(), decision: z.enum(["approve", "reject"]) }),
  z.object({ action: z.literal("add_vacancy"), companyName: z.string().min(2).max(150), title: z.string().min(3).max(250), location: z.string().max(200), description: z.string().min(100).max(18000), applyUrl: z.string().url().max(1000), applicationMethod: z.enum(["portal", "email"]), applicationEmail: z.string().email().optional(), emailVerified: z.boolean().default(false) })
]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action or input." }, { status: 400 });
  const input = parsed.data;
  const db = createSupabaseAdminClient();
  try {
    let result: Record<string, unknown> = {};
    let queued = false;
    if (input.action === "add_source") {
      const { data, error } = await db.from("job_desk_sources").upsert({ provider: input.provider, site_token: input.siteToken, company_name: input.companyName, active: true }, { onConflict: "provider,site_token" }).select("id").single();
      if (error) throw new Error(error.message);
      await enqueueTask("discover", `discover:${data.id}:${new Date().toISOString().slice(0, 10)}`, null, { sourceId: data.id });
      result = { sourceId: data.id };
      queued = true;
    } else if (input.action === "discover") {
      const { data } = await db.from("job_desk_sources").select("id").eq("id", input.sourceId).eq("active", true).single();
      if (!data) return NextResponse.json({ error: "Active source not found." }, { status: 404 });
      await enqueueTask("discover", `discover:${data.id}:${Date.now()}`, null, { sourceId: data.id });
      queued = true;
    } else if (input.action === "add_vacancy") {
      if (input.applicationMethod === "email" && (!input.applicationEmail || !input.emailVerified)) return NextResponse.json({ error: "Verify the application address against the original advert and confirm it." }, { status: 400 });
      const { data, error } = await db.from("job_desk_vacancies").insert({ provider: "manual", external_id: crypto.randomUUID(), company_name: input.companyName, title: input.title, location: input.location, description: input.description, apply_url: input.applyUrl, application_method: input.applicationMethod, application_email: input.applicationEmail ?? null, email_verified: input.applicationMethod === "email" && input.emailVerified }).select("id").single();
      if (error) throw new Error(error.message);
      result = { vacancyId: data.id };
    } else if (input.action === "match") {
      const { data: order } = await db.from("job_desk_orders").select("id,payment_status,amount,payment_reference").eq("id", input.orderId).single();
      if (!hasVerifiedJobDeskPayment(order)) return NextResponse.json({ error: "Verify the payment record before matching jobs." }, { status: 409 });
      const { data: latestCv, error: cvError } = await db.from("job_desk_documents").select("status").eq("order_id", input.orderId).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle();
      if (cvError) throw new Error(cvError.message);
      if (latestCv?.status !== "approved") return NextResponse.json({ error: latestCv ? "Review and approve the latest CV before matching jobs." : "Prepare the CV and profile, then approve the CV before matching jobs." }, { status: 409 });
      await enqueueTask("match", `match:${input.orderId}:${Date.now()}`, input.orderId);
      queued = true;
    } else if (input.action === "prepare") {
      const { data: match } = await db.from("job_desk_matches").select("id,order_id,status").eq("id", input.matchId).single();
      if (!match || match.status !== "suggested") return NextResponse.json({ error: "Suggested match not found." }, { status: 409 });
      await enqueueTask("prepare", `prepare:${match.id}:${Date.now()}`, match.order_id, { matchId: match.id });
      queued = true;
    } else if (input.action === "run_queue") {
      result = { processed: await runJobDeskWorker({ maxTasks: 10, maxRunMs: 45000 }) };
    } else if (input.action === "refresh_all") {
      const { data: sources, error } = await db.from("job_desk_sources").select("id").eq("active", true).limit(100);
      if (error) throw new Error(error.message);
      for (const source of sources ?? []) await enqueueTask("discover", `discover:${source.id}:${Date.now()}`, null, { sourceId: source.id });
      result = { queued: sources?.length ?? 0 };
      queued = true;
    } else if (input.action === "review_vacancy") {
      const { data: vacancy } = await db.from("job_desk_vacancies").select("id,status,duplicate_of,apply_url").eq("id", input.vacancyId).single();
      if (!vacancy || vacancy.status !== "open") return NextResponse.json({ error: "Open vacancy not found." }, { status: 404 });
      if (input.decision === "approve" && vacancy.duplicate_of) return NextResponse.json({ error: "Duplicate listings cannot be approved. Review the original listing." }, { status: 409 });
      const { error } = await db.from("job_desk_vacancies").update({ review_status: input.decision === "approve" ? "approved" : "rejected" }).eq("id", vacancy.id);
      if (error) throw new Error(error.message);
    } else if (input.action === "record_submission") {
      const { data: match } = await db.from("job_desk_matches").select("id,order_id,status,authorized_at,vacancy:job_desk_vacancies(application_method,application_email,email_verified,status,review_status,duplicate_of,last_seen_at,description)").eq("id", input.matchId).single();
      const vacancy = Array.isArray(match?.vacancy) ? match.vacancy[0] : match?.vacancy;
      if (!match || match.status !== "needs_human" || !match.authorized_at || !["portal", "email"].includes(vacancy?.application_method ?? "")) return NextResponse.json({ error: "A client-authorized application awaiting human submission is required." }, { status: 409 });
      if (vacancy?.status !== "open" || vacancy.review_status !== "approved" || vacancy.duplicate_of || expiredDeadline(vacancy.description) || Date.now() - new Date(vacancy.last_seen_at).getTime() > 72 * 3600000) return NextResponse.json({ error: "Refresh the vacancy before recording an application." }, { status: 409 });
      if (vacancy?.application_method === "email" && (!vacancy.email_verified || !vacancy.application_email)) return NextResponse.json({ error: "Verify the employer email address before recording a sent application." }, { status: 409 });
      const [{ data: order }, { data: cv }] = await Promise.all([
        db.from("job_desk_orders").select("payment_status,amount,payment_reference").eq("id", match.order_id).single(),
        db.from("job_desk_documents").select("id,status").eq("order_id", match.order_id).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle()
      ]);
      if (!hasVerifiedJobDeskPayment(order) || cv?.status !== "approved") return NextResponse.json({ error: "Verified payment and latest approved CV required." }, { status: 409 });
      const now = new Date().toISOString();
      const { error } = await db.from("job_desk_applications").upsert({ match_id: match.id, order_id: match.order_id, method: vacancy!.application_method, status: "submitted", recipient: vacancy!.application_email ?? null, provider_response: { confirmation: input.confirmation, recorded_by: user.id, verification_type: vacancy!.application_method === "email" ? "gmail_message_id" : "employer_reference" }, submitted_at: now, error_message: null }, { onConflict: "match_id" });
      if (error) throw new Error(error.message);
      await db.from("job_desk_matches").update({ status: "submitted", submitted_at: now }).eq("id", match.id);
      try { await queueClientUpdate(match.order_id, "application_submitted", match.id); }
      catch (cause) { await logSystemEvent({ category: "job_desk.client_email", level: "error", message: cause instanceof Error ? cause.message : "Could not queue submission update", metadata: { orderId: match.order_id, matchId: match.id } }); }
      result = { confirmation: input.confirmation };
    } else {
      const { data: match } = await db.from("job_desk_matches").select("id,order_id,status,cover_letter,reasons,vacancy:job_desk_vacancies(status,review_status,duplicate_of,last_seen_at,description)").eq("id", input.matchId).single();
      if (!match || match.status !== "ready" || !match.cover_letter) return NextResponse.json({ error: "Prepare the application before requesting consent." }, { status: 409 });
      const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
      if (!vacancy || vacancy.status !== "open" || vacancy.review_status !== "approved" || vacancy.duplicate_of || expiredDeadline(vacancy.description) || !(match.reasons as string[]).some((reason) => reason.startsWith("Suitability review:")) || Date.now() - new Date(vacancy.last_seen_at).getTime() > 72 * 3600000) return NextResponse.json({ error: "Refresh and review the vacancy before requesting client consent." }, { status: 409 });
      const { data: latestCv } = await db.from("job_desk_documents").select("status").eq("order_id", match.order_id).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle();
      if (latestCv?.status !== "approved") return NextResponse.json({ error: "Approve the latest CV before requesting consent." }, { status: 409 });
      const { token, hash } = createAuthorizationToken();
      const { error } = await db.from("job_desk_matches").update({ authorization_token_hash: hash, authorization_expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }).eq("id", match.id);
      if (error) throw new Error(error.message);
      result = { authorizationUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://solvaone.co.ke"}/job-desk/authorize/${token}` };
    }
    await logAdminAction({ adminId: user.id, action: `job_desk.${input.action}`, targetType: "job_desk", targetId: "orderId" in input ? input.orderId : "matchId" in input ? input.matchId : "sourceId" in input ? input.sourceId : "vacancyId" in input ? input.vacancyId : user.id, details: { action: input.action, ...("decision" in input ? { decision: input.decision } : {}) } });
    if (queued) after(async () => {
      try { await runJobDeskWorker({ maxTasks: 10, maxRunMs: 45000 }); }
      catch (cause) { await logSystemEvent({ category: "job_desk.worker", level: "error", message: cause instanceof Error ? cause.message : "Queue processing failed" }); }
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Job Desk action failed" }, { status: 500 }); }
}
