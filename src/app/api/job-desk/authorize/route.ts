import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { hashToken, enqueueTask } from "@/lib/job-desk/automation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clientIpFromHeaders } from "@/lib/security";
import { hasVerifiedJobDeskPayment } from "@/lib/job-desk/payment";
import { runJobDeskWorker } from "@/lib/job-desk/worker";
import { expiredDeadline } from "@/lib/job-desk/matching";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{40,60}$/), authorized: z.literal(true) });
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Explicit authorization is required." }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { data: match } = await db.from("job_desk_matches").select("id,order_id,status,cover_letter,reasons,authorization_expires_at,vacancy:job_desk_vacancies(status,review_status,duplicate_of,last_seen_at,description)").eq("authorization_token_hash", hashToken(parsed.data.token)).single();
  const vacancy = Array.isArray(match?.vacancy) ? match.vacancy[0] : match?.vacancy;
  if (!match || match.status !== "ready" || !match.cover_letter || vacancy?.status !== "open" || vacancy?.review_status !== "approved" || vacancy?.duplicate_of || expiredDeadline(vacancy.description) || !(match.reasons as string[]).some((reason) => reason.startsWith("Suitability review:")) || Date.now() - new Date(vacancy.last_seen_at).getTime() > 72 * 3600000 || !match.authorization_expires_at || new Date(match.authorization_expires_at) < new Date()) return NextResponse.json({ error: "Authorization link is invalid, expired or the job is no longer verified." }, { status: 409 });
  const { data: order } = await db.from("job_desk_orders").select("payment_status,amount,payment_reference,client:job_desk_clients(consent_to_process)").eq("id", match.order_id).single();
  const client = Array.isArray(order?.client) ? order.client[0] : order?.client;
  const { data: cv } = await db.from("job_desk_documents").select("id,status").eq("order_id", match.order_id).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle();
  if (!hasVerifiedJobDeskPayment(order) || !client?.consent_to_process || cv?.status !== "approved") return NextResponse.json({ error: "Verified payment, processing consent and the latest approved CV are required." }, { status: 409 });
  const { data, error } = await db.from("job_desk_matches").update({ status: "authorized", authorized_at: new Date().toISOString(), authorized_ip_hash: createHash("sha256").update(clientIpFromHeaders(request.headers)).digest("hex"), authorization_token_hash: null }).eq("id", match.id).eq("status", "ready").select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Authorization was already processed." }, { status: 409 });
  await enqueueTask("submit", `submit:${match.id}`, match.order_id, { matchId: match.id });
  after(async () => { try { await runJobDeskWorker({ maxTasks: 10, maxRunMs: 45000 }); } catch { /* Scheduled worker retries queued tasks. */ } });
  return NextResponse.json({ ok: true });
}
