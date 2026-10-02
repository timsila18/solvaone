import { after, NextResponse } from "next/server";
import { z } from "zod";
import { loadAnswerRequest } from "@/lib/job-desk/answer-request";
import { validatedAnswers, type SavedAssistedAnswers } from "@/lib/job-desk/assisted-answers";
import { checkRateLimit, clientIpFromHeaders, rateLimitResponse, logSystemEvent } from "@/lib/security";
import { enqueueTask } from "@/lib/job-desk/automation";
import { runJobDeskWorker } from "@/lib/job-desk/worker";

export const runtime = "nodejs";
export const maxDuration = 300;
const schema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), answers: z.record(z.string().max(2000)), factual: z.literal(true) });
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const limited = checkRateLimit(`assisted-answers:${clientIpFromHeaders(request.headers)}`, 20, 3600000);
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);
  const body = await request.text();
  if (body.length > 65000) return NextResponse.json({ error: "Answers exceed the size limit." }, { status: 413 });
  let parsed;
  try { parsed = schema.safeParse(JSON.parse(body)); } catch { return NextResponse.json({ error: "Invalid answers." }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: "Confirm the facts and provide valid answers." }, { status: 400 });
  const loaded = await loadAnswerRequest(parsed.data.token);
  if (!loaded) return NextResponse.json({ error: "This link expired, was used, or the order changed. Ask Job Desk for a new link." }, { status: 409 });
  const { db, batch, order, snapshot } = loaded;
  let answers;
  try { answers = validatedAnswers(snapshot.questions, parsed.data.answers); }
  catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Invalid answer." }, { status: 400 }); }
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await db.from("job_desk_authorization_batches").update({ consumed_at: now }).eq("id", batch.id).is("consumed_at", null).gt("expires_at", now).select("id").maybeSingle();
  if (claimError || !claimed) return NextResponse.json({ error: "This request is already being processed. Do not submit again." }, { status: 409 });
  const details = (order.service_details ?? {}) as Record<string, unknown>;
  const existing = (details.assistedAnswers ?? {}) as Record<string, SavedAssistedAnswers>;
  const merged = { ...existing };
  for (const answer of answers) {
    const previous = merged[answer.matchId]?.cvId === snapshot.cvId ? merged[answer.matchId].answers : [];
    merged[answer.matchId] = { cvId: snapshot.cvId, savedAt: now, batchId: batch.id, answers: [...previous.filter(item => item.question !== answer.question), { question: answer.question, answer: answer.answer }] };
  }
  const { data: saved, error: saveError } = await db.from("job_desk_orders").update({ service_details: { ...details, assistedAnswers: merged, answerRequest: { ...snapshot, savedAt: now } } }).eq("id", order.id).eq("updated_at", order.updated_at).select("id").maybeSingle();
  if (saveError || !saved) return NextResponse.json({ error: "The order changed; answers were not saved. Ask Job Desk for a new link." }, { status: 409 });
  let queued = true;
  for (const matchId of new Set(answers.map(answer => answer.matchId))) {
    try { await enqueueTask("resume_assisted", `resume-assisted:${batch.id}:${matchId}`, order.id, { matchId }); }
    catch {
      queued = false;
      await logSystemEvent({ category: "job_desk.assisted_answers", level: "error", message: "Answers saved but retry queue needs administrator attention.", metadata: { orderId: order.id, matchId } });
    }
  }
  after(async () => { try { await runJobDeskWorker({ maxTasks: 10, maxRunMs: 45000 }); } catch { /* Scheduled worker retains durable tasks. */ } });
  return NextResponse.json({ ok: true, queued }, { headers: { "Cache-Control": "no-store" } });
}
