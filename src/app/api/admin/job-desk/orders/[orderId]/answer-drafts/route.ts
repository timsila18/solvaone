import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { getCurrentUser } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, checkRateLimit, rateLimitResponse, logAdminAction } from "@/lib/security";
import { loadDraftContext } from "@/lib/job-desk/answer-draft-service";
import { makeAssistedQuestion, validatedAnswers, type SavedAssistedAnswers } from "@/lib/job-desk/assisted-answers";
import { ANSWER_DRAFT_OPERATION, ANSWER_DRAFT_PURPOSE, type AnswerDraftPacket } from "@/lib/job-desk/answer-drafts";
import { enqueueTask } from "@/lib/job-desk/automation";
import { runJobDeskWorker } from "@/lib/job-desk/worker";

export const runtime = "nodejs";
export const maxDuration = 300;
const schema = z.discriminatedUnion("action", [z.object({ action: z.literal("draft"), matchId: z.string().uuid() }), z.object({ action: z.literal("approve"), matchId: z.string().uuid(), fingerprint: z.string().length(64), factual: z.literal(true), answers: z.record(z.string().max(2000)) })]);
function kickWorker() { after(async () => { try { await runJobDeskWorker({ maxTasks: 10, maxRunMs: 45000 }); } catch { /* Durable scheduled worker retries. */ } }); }
export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { orderId } = await params;
  const { data, error } = await createSupabaseAdminClient().from("job_desk_ai_runs").select("status,input_payload,output_payload,error_message,created_at").eq("order_id", orderId).eq("operation", ANSWER_DRAFT_OPERATION).eq("input_payload->>purpose", ANSWER_DRAFT_PURPOSE).order("created_at", { ascending: false }).limit(30);
  if (error) return NextResponse.json({ error: "Could not load answer drafts." }, { status: 500 });
  return NextResponse.json({ runs: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limit = checkRateLimit(`answer-drafts:${user.id}`, 30, 3600000);
  if (!limit.allowed) return rateLimitResponse(limit.resetAt);
  const body = await request.text();
  if (body.length > 65000) return NextResponse.json({ error: "Answer size limit exceeded." }, { status: 413 });
  let input;
  try { input = schema.parse(JSON.parse(body)); } catch { return NextResponse.json({ error: "Provide valid answers and confirm their facts." }, { status: 400 }); }
  const { orderId } = await params;
  try {
    const context = await loadDraftContext(orderId, input.matchId);
    const { db, order, cv, match, questions, fingerprint } = context;
    if (input.action === "draft") {
      await enqueueTask("draft_answers", `answer-drafts:${match.id}:${fingerprint}`, orderId, { matchId: match.id });
      kickWorker();
      return NextResponse.json({ ok: true, message: "Drafting queued. Refresh drafts shortly; ready applications continue first." });
    }
    if (input.fingerprint !== fingerprint) return NextResponse.json({ error: "The approved CV, questions or saved facts changed. Prepare fresh drafts." }, { status: 409 });
    const { data: run, error } = await db.from("job_desk_ai_runs").select("output_payload").eq("order_id", orderId).eq("operation", ANSWER_DRAFT_OPERATION).eq("input_payload->>purpose", ANSWER_DRAFT_PURPOSE).eq("input_fingerprint", fingerprint).eq("status", "succeeded").maybeSingle();
    const packet = run?.output_payload as AnswerDraftPacket | null;
    if (error || packet?.cvId !== cv.id || packet?.matchId !== match.id) throw new Error("Prepare valid drafts before approving answers.");
    const allowed = questions.map(question => makeAssistedQuestion(match.id, question, { title: "", company_name: "", apply_url: "" }));
    const keyedAnswers: Record<string, string> = {};
    for (const [label, answer] of Object.entries(input.answers)) {
      const question = allowed.find(item => item.label === label);
      if (!question) throw new Error("An answer is not part of the current application questions.");
      keyedAnswers[question.id] = answer;
    }
    const answers = validatedAnswers(allowed, keyedAnswers);
    const details = (order.service_details ?? {}) as Record<string, unknown>;
    const existing = (details.assistedAnswers ?? {}) as Record<string, SavedAssistedAnswers>;
    const previous = existing[match.id]?.cvId === cv.id ? existing[match.id].answers : [];
    const now = new Date().toISOString();
    const merged = [...previous.filter(item => !answers.some(answer => answer.question === item.question)), ...answers.map(({ question, answer }) => ({ question, answer }))];
    const { data: saved, error: saveError } = await db.from("job_desk_orders").update({ service_details: { ...details, assistedAnswers: { ...existing, [match.id]: { cvId: cv.id, savedAt: now, batchId: fingerprint, answers: merged } } } }).eq("id", orderId).eq("updated_at", order.updated_at).select("id").maybeSingle();
    if (saveError || !saved) throw new Error("The order changed. Refresh before approving again.");
    // Answers remain saved even if a queue outage occurs; never ask for payment again.
    let queued = true;
    const answerHash = createHash("sha256").update(JSON.stringify(merged)).digest("hex");
    try { await enqueueTask("resume_assisted", `approved-answers:${match.id}:${fingerprint}:${answerHash}`, orderId, { matchId: match.id }); } catch { queued = false; }
    await logAdminAction({ adminId: user.id, action: "job_desk.answer_drafts_approved", targetType: "job_desk_order", targetId: orderId, details: { matchId: match.id, cvId: cv.id, count: answers.length, queued } });
    kickWorker();
    return NextResponse.json({ ok: true, queued, message: queued ? "Verified answers saved. Automatic preflight and processing queued; this is not a submission confirmation." : "Answers saved. Use Retry application to restart processing; the queue could not be reached." });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Application review failed." }, { status: 409 }); }
}
