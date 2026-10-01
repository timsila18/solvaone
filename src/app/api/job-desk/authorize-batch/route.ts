import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { batchVacancyIsCurrent, hashBatchToken } from "@/lib/job-desk/batch-authorization";
import { hasVerifiedJobDeskPayment } from "@/lib/job-desk/payment";
import { enqueueTask } from "@/lib/job-desk/automation";
import { runJobDeskWorker } from "@/lib/job-desk/worker";
import { checkRateLimit, clientIpFromHeaders, rateLimitResponse } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60;
const schema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{40,60}$/), matchIds: z.array(z.string().uuid()).min(1).max(10), authorized: z.literal(true) });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && (!host || new URL(origin).host !== host)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const limited = checkRateLimit(`job-desk-batch-auth:${clientIpFromHeaders(request.headers)}`, 10, 60 * 60 * 1000);
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || new Set(parsed.data.matchIds).size !== parsed.data.matchIds.length) return NextResponse.json({ error: "Select valid applications to authorize." }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { data: batch } = await db.from("job_desk_authorization_batches").select("id,order_id,match_ids,expires_at,consumed_at").eq("token_hash", hashBatchToken(parsed.data.token)).maybeSingle();
  if (!batch || batch.consumed_at || new Date(batch.expires_at) < new Date() || parsed.data.matchIds.some((id) => !batch.match_ids.includes(id))) return NextResponse.json({ error: "Approval link is invalid or expired." }, { status: 409 });
  const [{ data: order }, { data: cv }, { data: matches }] = await Promise.all([
    db.from("job_desk_orders").select("payment_status,amount,payment_reference,client:job_desk_clients(consent_to_process)").eq("id", batch.order_id).single(),
    db.from("job_desk_documents").select("status").eq("order_id", batch.order_id).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle(),
    db.from("job_desk_matches").select("id,status,cover_letter,reasons,vacancy:job_desk_vacancies(status,review_status,duplicate_of,last_seen_at,description,application_method)").eq("order_id", batch.order_id).in("id", parsed.data.matchIds)
  ]);
  const client = Array.isArray(order?.client) ? order.client[0] : order?.client;
  if (!hasVerifiedJobDeskPayment(order) || !client?.consent_to_process || cv?.status !== "approved" || matches?.length !== parsed.data.matchIds.length) return NextResponse.json({ error: "Payment, consent or approved CV needs review." }, { status: 409 });
  if (matches.some((match) => {
    const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
    return match.status !== "ready" || !match.cover_letter || !batchVacancyIsCurrent(vacancy) || !(match.reasons as string[]).some((reason) => reason.startsWith("Suitability review:"));
  })) return NextResponse.json({ error: "One or more vacancies need refreshing. Ask Job Desk for a new approval link." }, { status: 409 });
  const authorizedIpHash = createHash("sha256").update(clientIpFromHeaders(request.headers)).digest("hex");
  let count = 0;
  let needsReview = false;
  for (const match of matches) {
    const { data, error } = await db.from("job_desk_matches").update({ status: "authorized", authorized_at: new Date().toISOString(), authorized_ip_hash: authorizedIpHash, authorization_token_hash: null }).eq("id", match.id).eq("status", "ready").select("id").maybeSingle();
    if (error || !data) continue;
    count += 1;
    try { await enqueueTask("submit", `submit:${match.id}`, batch.order_id, { matchId: match.id }); }
    catch {
      needsReview = true;
      const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
      await db.from("job_desk_matches").update({ status: "needs_human" }).eq("id", match.id);
      await db.from("job_desk_applications").upsert({ match_id: match.id, order_id: batch.order_id, method: vacancy?.application_method ?? "portal", status: "needs_human", error_message: "Submission could not be queued; admin must review this authorized application." }, { onConflict: "match_id" });
    }
  }
  if (!count) return NextResponse.json({ error: "These applications were already processed. Contact Job Desk if the status is unclear." }, { status: 409 });
  await db.from("job_desk_authorization_batches").update({ consumed_at: new Date().toISOString() }).eq("id", batch.id).is("consumed_at", null);
  after(async () => { try { await runJobDeskWorker({ maxTasks: 10, maxRunMs: 45000 }); } catch { /* The scheduled worker retains queued tasks. */ } });
  return NextResponse.json({ ok: true, count, needsReview: needsReview || count !== parsed.data.matchIds.length });
}
