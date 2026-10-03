import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createOpenAIClient } from "@/lib/openai";
import { estimateCost, extractTokenUsage } from "@/lib/solva-intelligence/costs";
import { hasVerifiedJobDeskPayment } from "./payment";
import { applicationScopeHold, readApplicationScope } from "./application-scope";
import { batchVacancyIsCurrent } from "./batch-authorization";
import { canRetrySubmission } from "./submission-preflight";
import { enqueueTask, plainText } from "./automation";
import { answersForMatch, type SavedAssistedAnswers } from "./assisted-answers";
import { readApplicantDetails } from "./applicant-details";
import { ANSWER_DRAFT_OPERATION, ANSWER_DRAFT_PURPOSE, ANSWER_DRAFT_PROMPT, automaticFactualAnswers, draftableQuestions, draftFingerprint, parseAnswerDrafts, prohibitsAnswerDrafting, type AnswerDraftPacket } from "./answer-drafts";

async function advanceFactualAnswers(orderId: string, matchId: string, packet: AnswerDraftPacket) {
  const context = await loadDraftContext(orderId, matchId);
  if (context.cv.id !== packet.cvId || context.fingerprint !== packet.fingerprint) return;
  const safe = automaticFactualAnswers(packet.answers, context.facts);
  if (!safe.length) return;
  const details = context.order.service_details ?? {};
  const existing = (details.assistedAnswers ?? {}) as Record<string, SavedAssistedAnswers>;
  const previous = existing[matchId]?.cvId === packet.cvId ? existing[matchId].answers : [];
  const added = safe.filter(item => !previous.some(saved => saved.question === item.question));
  if (!added.length) return;
  const answers = [...previous, ...added.map(({ question, answer }) => ({ question: question.replace(/\s+/g, " ").trim(), answer }))];
  const { data, error } = await context.db.from("job_desk_orders").update({ service_details: { ...details, assistedAnswers: { ...existing, [matchId]: { cvId: packet.cvId, savedAt: new Date().toISOString(), batchId: packet.fingerprint, answers } } } }).eq("id", orderId).eq("updated_at", context.order.updated_at).select("id").maybeSingle();
  if (error || !data) throw new Error("Order changed while saving factual answers; retry with current facts.");
  await enqueueTask("resume_assisted", `automatic-facts:${matchId}:${packet.fingerprint}`, orderId, { matchId });
}

export async function loadDraftContext(orderId: string, matchId: string) {
  const db = createSupabaseAdminClient();
  const { data: order, error: orderError } = await db.from("job_desk_orders").select("*,client:job_desk_clients(*)").eq("id", orderId).single();
  const { data: cv, error: cvError } = await db.from("job_desk_documents").select("id,status,html").eq("order_id", orderId).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle();
  const { data: match, error: matchError } = await db.from("job_desk_matches").select("*,vacancy:job_desk_vacancies(*),application:job_desk_applications(status,provider_response)").eq("id", matchId).eq("order_id", orderId).maybeSingle();
  if (orderError || cvError || matchError) throw new Error("Could not load application review context.");
  const client = Array.isArray(order?.client) ? order.client[0] : order?.client;
  const vacancy = Array.isArray(match?.vacancy) ? match.vacancy[0] : match?.vacancy;
  const application = Array.isArray(match?.application) ? match.application[0] : match?.application;
  const scope = order?.application_authorized ? readApplicationScope(order.service_details) : null;
  if (!order || order.service_type !== "job_search_full" || !["approved", "active"].includes(order.status) || !hasVerifiedJobDeskPayment(order) || !client?.consent_to_process || cv?.status !== "approved" || !cv.html || !scope || !match || match.status !== "needs_human" || !batchVacancyIsCurrent(vacancy) || applicationScopeHold(scope, vacancy) || !canRetrySubmission(application) || !(match.reasons as string[]).some(reason => reason.startsWith("Suitability review:"))) throw new Error("Only current, authorized, safely retryable applications with an approved CV can be reviewed.");
  const blockers = application?.provider_response?.preflight?.blockers;
  if (!Array.isArray(blockers) || blockers.some(item => typeof item !== "string") || prohibitsAnswerDrafting(blockers.join(" "))) throw new Error("This application requires an official personal step, not agent-written answers.");
  const questions = draftableQuestions(blockers);
  if (!questions.length) throw new Error("No factual application questions are available for drafting.");
  const details = readApplicantDetails(order.service_details);
  const facts = `${plainText(cv.html).slice(0, 24000)}\nSaved factual answers:\n${answersForMatch(order.service_details, matchId, details?.portalAnswers ?? "", cv.id).slice(0, 12000)}`;
  const advert = `${vacancy.title} at ${vacancy.company_name}\n${vacancy.description ?? ""}`.slice(0, 10000);
  const fingerprint = draftFingerprint(cv.id, matchId, facts, questions, advert);
  return { db, order, cv, match, questions, facts, advert, fingerprint };
}

export async function processAnswerDrafts(orderId: string, matchId: string) {
  const context = await loadDraftContext(orderId, matchId);
  const { db, cv, fingerprint, questions, facts, advert } = context;
  const { data: previous, error: previousError } = await db.from("job_desk_ai_runs").select("id,status,started_at,token_input,token_output,output_payload").eq("order_id", orderId).eq("operation", ANSWER_DRAFT_OPERATION).eq("input_payload->>purpose", ANSWER_DRAFT_PURPOSE).eq("input_fingerprint", fingerprint).maybeSingle();
  if (previousError) throw new Error(previousError.message);
  if (previous?.status === "succeeded") {
    await advanceFactualAnswers(orderId, matchId, previous.output_payload as AnswerDraftPacket);
    return { cached: true, matchId };
  }
  if (previous?.status === "running" && Date.now() - Date.parse(previous.started_at) < 6 * 60000) return { alreadyRunning: true, matchId };
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const values = { order_id: orderId, operation: ANSWER_DRAFT_OPERATION, input_fingerprint: fingerprint, model_used: model, status: "running", input_payload: { purpose: ANSWER_DRAFT_PURPOSE, matchId, cvId: cv.id }, started_at: new Date().toISOString() };
  const claim = previous ? db.from("job_desk_ai_runs").update(values).eq("id", previous.id).eq("status", previous.status).eq("started_at", previous.started_at) : db.from("job_desk_ai_runs").upsert(values, { onConflict: "order_id,operation,input_fingerprint", ignoreDuplicates: true });
  const { data: run, error } = await claim.select("id").maybeSingle();
  if (error) throw new Error("Could not track answer drafting.");
  if (!run) return { alreadyRunning: true, matchId };
  let inputTokens = previous?.token_input ?? 0, outputTokens = previous?.token_output ?? 0;
  try {
    let issue = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await createOpenAIClient().responses.create({ model, input: [{ role: "system", content: ANSWER_DRAFT_PROMPT }, { role: "user", content: JSON.stringify({ questions, facts, advert, previousValidationIssue: issue }) }], text: { format: { type: "json_object" } }, max_output_tokens: 6000, temperature: 0.2 });
      const usage = extractTokenUsage(response); inputTokens += usage.inputTokens; outputTokens += usage.outputTokens;
      try {
        const answers = parseAnswerDrafts(response.output_text ?? "", questions, facts);
        const packet: AnswerDraftPacket = { cvId: cv.id, matchId, fingerprint, answers };
        const { error: saveError } = await db.from("job_desk_ai_runs").update({ status: "succeeded", output_payload: packet, token_input: inputTokens, token_output: outputTokens, total_tokens: inputTokens + outputTokens, estimated_cost: estimateCost(model, inputTokens, outputTokens), completed_at: new Date().toISOString(), error_message: null }).eq("id", run.id);
        if (saveError) throw new Error(saveError.message);
        await advanceFactualAnswers(orderId, matchId, packet);
        return { drafted: answers.filter(answer => answer.answer).length, missing: answers.filter(answer => !answer.answer).length, matchId };
      } catch (cause) { issue = cause instanceof Error ? cause.message : "Draft validation failed"; }
    }
    throw new Error(issue);
  } catch (cause) {
    await db.from("job_desk_ai_runs").update({ status: "failed", error_message: cause instanceof Error ? cause.message : "Drafting failed", token_input: inputTokens, token_output: outputTokens, total_tokens: inputTokens + outputTokens, estimated_cost: estimateCost(model, inputTokens, outputTokens), completed_at: new Date().toISOString() }).eq("id", run.id);
    throw cause;
  }
}
