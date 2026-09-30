import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hashToken, enqueueTask } from "@/lib/job-desk/automation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clientIpFromHeaders } from "@/lib/security";
import { hasVerifiedJobDeskPayment } from "@/lib/job-desk/payment";

const schema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{40,60}$/), authorized: z.literal(true) });
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Explicit authorization is required." }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { data: match } = await db.from("job_desk_matches").select("id,order_id,status,cover_letter,authorization_expires_at,vacancy:job_desk_vacancies(status)").eq("authorization_token_hash", hashToken(parsed.data.token)).single();
  const vacancy = Array.isArray(match?.vacancy) ? match.vacancy[0] : match?.vacancy;
  if (!match || match.status !== "ready" || !match.cover_letter || vacancy?.status !== "open" || !match.authorization_expires_at || new Date(match.authorization_expires_at) < new Date()) return NextResponse.json({ error: "Authorization link is invalid or expired." }, { status: 409 });
  const { data: order } = await db.from("job_desk_orders").select("payment_status,amount,payment_reference,client:job_desk_clients(consent_to_process)").eq("id", match.order_id).single();
  const client = Array.isArray(order?.client) ? order.client[0] : order?.client;
  const { data: cv } = await db.from("job_desk_documents").select("id").eq("order_id", match.order_id).eq("document_type", "revamped_cv").eq("status", "approved").limit(1).maybeSingle();
  if (!hasVerifiedJobDeskPayment(order) || !client?.consent_to_process || !cv) return NextResponse.json({ error: "Verified payment, processing consent and an approved CV are required." }, { status: 409 });
  const { data, error } = await db.from("job_desk_matches").update({ status: "authorized", authorized_at: new Date().toISOString(), authorized_ip_hash: createHash("sha256").update(clientIpFromHeaders(request.headers)).digest("hex"), authorization_token_hash: null }).eq("id", match.id).eq("status", "ready").select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Authorization was already processed." }, { status: 409 });
  await enqueueTask("submit", `submit:${match.id}`, match.order_id, { matchId: match.id });
  return NextResponse.json({ ok: true });
}
