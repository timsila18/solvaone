import { createHash } from "node:crypto";
import { createOpenAIClient } from "@/lib/openai";
import { estimateCost, extractTokenUsage } from "@/lib/solva-intelligence/costs";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logSystemEvent } from "@/lib/security";
import { discoverEmailVacancies, discoverVacancies, enqueueTask, matchOrder, plainText, verifyVacancyStillOpen, reviewDeferredMatches } from "./automation";
import { scoreVacancy, submissionHoldReason } from "./matching";
import { hasVerifiedJobDeskPayment } from "./payment";
import { createJobDeskCvDocx } from "./cv-docx";
import { processJobDeskOrder } from "./service";
import { queueClientUpdate, sendClientUpdate, type ClientUpdate } from "./client-updates";
import { applicationScopeHold, readApplicationScope } from "./application-scope";
import { readApplicantDetails } from "./applicant-details";
import { buildApplicantKnown } from "./applicant-known";
import { canAutomatePortal, runPortalApplication } from "./portal-browser";
import { submissionPreflight, canRetrySubmission } from "./submission-preflight";
import { answersForMatch } from "./assisted-answers";
import { draftableQuestions, prohibitsAnswerDrafting } from "./answer-drafts";
import { processAnswerDrafts } from "./answer-draft-service";
import { claimPrioritizedTask } from "./task-priority";
import { ApplicationEmailError, sendApplicationEmail } from "./email-transport";
import { claimApplication } from "./submission-lock";
import { LETTER_PROMPT_VERSION, LETTER_WRITER_PROMPT, LETTER_REVIEW_PROMPT, letterDate, formatApplicationLetter, validateLetterBody, parseLetterReview } from "./letter-quality";

type Task = { id: string; order_id: string | null; task_type: string; attempts: number; max_attempts: number; payload: Record<string, string> };

async function checkSubmissionRequirements(matchId: string, order: any, client: any, vacancy: any) {
  const db = createSupabaseAdminClient();
  const { data: source, error } = vacancy.source_id ? await db.from("job_desk_sources").select("provider,site_token,active").eq("id", vacancy.source_id).maybeSingle() : { data: null, error: null };
  if (error) throw new Error(error.message);
  const details = readApplicantDetails(order.service_details);
  const { data: approvedCv, error: cvError } = await db.from("job_desk_documents").select("id,html,status").eq("order_id", order.id).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle();
  if (cvError) throw new Error(cvError.message);
  if (approvedCv?.status !== "approved") return null;
  const preflight = await submissionPreflight({ method: vacancy.application_method, emailVerified: vacancy.email_verified, applicationEmail: vacancy.application_email, provider: source?.active ? source.provider : undefined, siteToken: source?.site_token, url: vacancy.apply_url, answers: answersForMatch(order.service_details, matchId, details?.portalAnswers ?? "", approvedCv.id), known: buildApplicantKnown(client, details, approvedCv.html ?? "") });
  if (!preflight.ready) {
    const { data: existing, error: readError } = await db.from("job_desk_applications").select("status,provider_response").eq("match_id", matchId).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (["sending", "submitted"].includes(existing?.status ?? "")) return null;
    if (existing?.status === "needs_human" && !canRetrySubmission(existing)) return null;
    const { error: saveError } = await db.from("job_desk_applications").upsert({ match_id: matchId, order_id: order.id, method: vacancy.application_method, status: "needs_human", error_message: `Preflight: ${preflight.blockers.join("; ")}`.slice(0, 4000), provider_response: { clicked: false, preflight } }, { onConflict: "match_id" });
    if (saveError) throw new Error(saveError.message);
    const { error: matchError } = await db.from("job_desk_matches").update({ status: "needs_human" }).eq("id", matchId).in("status", ["suggested", "preparing", "authorized"]);
    if (matchError) throw new Error(matchError.message);
    if (draftableQuestions(preflight.blockers).length && !prohibitsAnswerDrafting(preflight.blockers.join(" "))) {
      await enqueueTask("draft_answers", `answer-drafts:${matchId}:${approvedCv.id}`, order.id, { matchId });
    }
    await queueUpdateWithoutChangingSubmission(order.id, "application_needs_action", matchId);
  }
  return preflight.ready ? preflight : null;
}

async function queueUpdateWithoutChangingSubmission(orderId: string, event: ClientUpdate, matchId: string) {
  try { await queueClientUpdate(orderId, event, matchId); }
  catch (cause) {
    await logSystemEvent({ category: "job_desk.client_email", level: "error", message: cause instanceof Error ? cause.message : "Could not queue client update", metadata: { orderId, matchId, event } });
  }
}

async function prepareMatch(matchId: string) {
  const db = createSupabaseAdminClient();
  const { data: match } = await db.from("job_desk_matches").select("*,vacancy:job_desk_vacancies(*)").eq("id", matchId).single();
  if (!match) return;
  if (match.status === "authorized" && match.authorized_at && !match.authorized_ip_hash) {
    await enqueueTask("submit", `submit:${matchId}:${createHash("sha256").update(match.cover_letter ?? "").digest("hex").slice(0, 16)}`, match.order_id, { matchId });
    return;
  }
  if (!["suggested", "preparing"].includes(match.status)) return;
  const { data: order, error: orderError } = await db.from("job_desk_orders").select("*,client:job_desk_clients(*)").eq("id", match.order_id).single();
  if (orderError) throw new Error(orderError.message);
  const { data: latestCv } = await db.from("job_desk_documents").select("id,status").eq("order_id", match.order_id).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle();
  if (latestCv?.status !== "approved") throw new Error("Approve the latest CV before preparing applications.");
  const { data: cv } = await db.from("job_desk_documents").select("html").eq("order_id", match.order_id).eq("document_type", "revamped_cv").eq("status", "approved").order("version", { ascending: false }).limit(1).maybeSingle();
  if (!order || !cv || !hasVerifiedJobDeskPayment(order)) throw new Error("Verified payment and approved CV required.");
  const { data: profile, error: profileError } = await db.from("job_desk_candidate_profiles").select("*").eq("client_id", order.client_id).maybeSingle();
  if (profileError || !profile) throw new Error(profileError?.message ?? "Candidate profile is missing.");
  const client = Array.isArray(order.client) ? order.client[0] : order.client;
  const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
  if (!vacancy || vacancy.status !== "open" || vacancy.review_status !== "approved" || vacancy.duplicate_of || Date.now() - new Date(vacancy.last_seen_at).getTime() > 72 * 3600000) throw new Error("Vacancy is closed, unreviewed, duplicated or stale.");
  if (scoreVacancy(vacancy, profile, order.application_authorized ? readApplicationScope(order.service_details) : null).score < 25 || !(match.reasons as string[]).some((reason) => reason.startsWith("Suitability review:"))) throw new Error("Vacancy needs a fresh CV-based suitability review before preparation.");
  if (!(await verifyVacancyStillOpen(vacancy))) throw new Error("Vacancy is no longer listed by its official source.");
  if (!(await checkSubmissionRequirements(matchId, order, client, vacancy))) return;
  const prompt = JSON.stringify({ version: LETTER_PROMPT_VERSION, cvId: latestCv.id, date: letterDate(), cv: plainText(cv.html).slice(0, 24000), clientName: client.full_name, role: vacancy.title, company: vacancy.company_name, description: vacancy.description.slice(0, 10000) });
  const fingerprint = createHash("sha256").update(prompt).digest("hex");
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const { data: previous } = await db.from("job_desk_ai_runs").select("output_payload").eq("order_id", order.id).eq("operation", "match_cover_letter").eq("input_fingerprint", fingerprint).eq("status", "succeeded").maybeSingle();
  let letter = (previous?.output_payload as { letter?: string } | null)?.letter;
  if (!letter) {
    const { data: run, error } = await db.from("job_desk_ai_runs").upsert({ order_id: order.id, initiated_by: null, operation: "match_cover_letter", input_fingerprint: fingerprint, model_used: model, status: "running", input_payload: { matchId, vacancyId: vacancy.id }, started_at: new Date().toISOString() }, { onConflict: "order_id,operation,input_fingerprint" }).select("id").single();
    if (error || !run) throw new Error(error?.message ?? "Could not record AI run.");
    try {
      let issues: string[] = [];
      let inputTokens = 0;
      let outputTokens = 0;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await createOpenAIClient().responses.create({ model, input: [
          { role: "system", content: LETTER_WRITER_PROMPT },
          { role: "user", content: `${prompt}\nPrevious review issues to correct: ${JSON.stringify(issues)}` }
        ], max_output_tokens: 1100, temperature: 0.2 } as any);
        const usage = extractTokenUsage(response);
        inputTokens += usage.inputTokens; outputTokens += usage.outputTokens;
        const body = response.output_text?.trim() ?? "";
        validateLetterBody(body);
        const reviewResponse = await createOpenAIClient().responses.create({ model, input: [
          { role: "system", content: LETTER_REVIEW_PROMPT },
          { role: "user", content: JSON.stringify({ cv: plainText(cv.html), letter: body }) }
        ], max_output_tokens: 1000, temperature: 0 } as any);
        const reviewUsage = extractTokenUsage(reviewResponse);
        inputTokens += reviewUsage.inputTokens; outputTokens += reviewUsage.outputTokens;
        const review = parseLetterReview(reviewResponse.output_text ?? "");
        issues = review.issues;
        const { error: usageError } = await db.from("job_desk_ai_runs").update({ token_input: inputTokens, token_output: outputTokens, total_tokens: inputTokens + outputTokens, estimated_cost: estimateCost(model, inputTokens, outputTokens) }).eq("id", run.id);
        if (usageError) throw new Error(usageError.message);
        if (review.supported) { letter = formatApplicationLetter(body, client.full_name, vacancy.title); break; }
      }
      if (!letter) throw new Error(`Factual review needs administrator attention: ${issues.join("; ")}`);
      const { error: completedError } = await db.from("job_desk_ai_runs").update({ status: "succeeded", output_payload: { letter, factualReview: "passed", cvId: latestCv.id, promptVersion: LETTER_PROMPT_VERSION }, completed_at: new Date().toISOString() }).eq("id", run.id);
      if (completedError) throw new Error(completedError.message);
    } catch (cause) {
      await db.from("job_desk_ai_runs").update({ status: "failed", error_message: cause instanceof Error ? cause.message : "AI failed", completed_at: new Date().toISOString() }).eq("id", run.id);
      throw cause;
    }
  }
  const { data: ready, error: updateError } = await db.from("job_desk_matches").update({ cover_letter: letter, status: "ready" }).eq("id", matchId).in("status", ["suggested", "preparing"]).select("id").maybeSingle();
  if (updateError) throw new Error(updateError.message);
  if (!ready || !order.application_authorized || !["approved", "active"].includes(order.status)) return;
  const scope = readApplicationScope(order.service_details);
  if (!scope || applicationScopeHold(scope, vacancy) || scoreVacancy(vacancy, profile, scope).score < 25 || !Array.isArray(match.reasons) || !match.reasons.some((reason: string) => reason.startsWith("Suitability review:"))) return;
  const { data: authorized, error: authorizationError } = await db.from("job_desk_matches")
    .update({ status: "authorized", authorized_at: new Date().toISOString(), authorized_ip_hash: null })
    .eq("id", matchId).eq("status", "ready").select("id").maybeSingle();
  if (authorizationError) throw new Error(authorizationError.message);
  if (authorized) await enqueueTask("submit", `submit:${matchId}:${createHash("sha256").update(letter!).digest("hex").slice(0, 16)}`, order.id, { matchId });
}

async function submitMatch(matchId: string) {
  const db = createSupabaseAdminClient();
  const { data: match } = await db.from("job_desk_matches").select("*,vacancy:job_desk_vacancies(*)").eq("id", matchId).single();
  if (!match || match.status !== "authorized" || !match.authorized_at || !match.cover_letter) return;
  const { data: alreadySent, error: sentReadError } = await db.from("job_desk_applications").select("status,provider_message_id").eq("match_id", matchId).maybeSingle();
  if (sentReadError) throw new Error(sentReadError.message);
  if (alreadySent?.provider_message_id || ["sending", "submitted"].includes(alreadySent?.status ?? "")) return;
  const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
  const { data: order } = await db.from("job_desk_orders").select("*,client:job_desk_clients(*)").eq("id", match.order_id).single();
  const { data: latestCv } = await db.from("job_desk_documents").select("id,status").eq("order_id", match.order_id).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle();
  if (latestCv?.status !== "approved") {
    await db.from("job_desk_matches").update({ status: "needs_human" }).eq("id", matchId);
    await db.from("job_desk_applications").upsert({ match_id: matchId, order_id: match.order_id, method: vacancy?.application_method ?? "portal", status: "needs_human", error_message: "A newer CV is awaiting approval. Recheck the application before submission." }, { onConflict: "match_id" });
    await queueUpdateWithoutChangingSubmission(match.order_id, "application_needs_action", matchId);
    return;
  }
  const { data: cv } = await db.from("job_desk_documents").select("html,title,structured_content").eq("order_id", match.order_id).eq("document_type", "revamped_cv").eq("status", "approved").order("version", { ascending: false }).limit(1).maybeSingle();
  const { data: profile } = await db.from("job_desk_candidate_profiles").select("*").eq("client_id", order?.client_id).maybeSingle();
  const client = Array.isArray(order?.client) ? order.client[0] : order?.client;
  if (!order || !cv || !profile || !hasVerifiedJobDeskPayment(order) || !client?.consent_to_process || !["approved", "active"].includes(order.status)) throw new Error("Order, consent, verified payment, candidate profile or approved CV missing or paused.");
  if (!match.authorized_ip_hash) {
    const scope = order.application_authorized ? readApplicationScope(order.service_details) : null;
    const outside = scope && vacancy ? applicationScopeHold(scope, vacancy) : "Scoped application authorization is missing.";
    if (outside || !scope || scoreVacancy(vacancy, profile, scope).score < 25 || !Array.isArray(match.reasons) || !match.reasons.some((reason: string) => reason.startsWith("Suitability review:"))) {
      await db.from("job_desk_matches").update({ status: "needs_human" }).eq("id", matchId);
      await db.from("job_desk_applications").upsert({ match_id: matchId, order_id: order.id, method: vacancy?.application_method ?? "portal", status: "needs_human", error_message: outside || "Vacancy no longer meets the automatic suitability threshold." }, { onConflict: "match_id" });
      await queueUpdateWithoutChangingSubmission(order.id, "application_needs_action", matchId);
      return;
    }
  }
  const cvPlain = plainText(String(cv.html));
  const { data: reviewedLetter, error: reviewError } = await db.from("job_desk_ai_runs").select("output_payload").eq("order_id", order.id).eq("operation", "match_cover_letter").eq("status", "succeeded").contains("output_payload", { letter: match.cover_letter, factualReview: "passed", cvId: latestCv.id, promptVersion: LETTER_PROMPT_VERSION }).limit(1).maybeSingle();
  if (reviewError) throw new Error(reviewError.message);
  if (!reviewedLetter) {
    const { error } = await db.from("job_desk_matches").update({ status: "suggested", cover_letter: null }).eq("id", matchId).eq("status", "authorized");
    if (error) throw new Error(error.message);
    await enqueueTask("prepare", `prepare-reviewed:${matchId}:${latestCv.id}:${LETTER_PROMPT_VERSION}`, order.id, { matchId });
    return;
  }
  const pauseReason = submissionHoldReason(vacancy?.application_method === "portal" ? "" : String(vacancy?.description ?? ""), client.email ?? null, cvPlain.length);
  if (pauseReason) {
    await db.from("job_desk_matches").update({ status: "needs_human" }).eq("id", matchId);
    await db.from("job_desk_applications").upsert({ match_id: matchId, order_id: order.id, method: vacancy?.application_method ?? "portal", status: "needs_human", error_message: pauseReason }, { onConflict: "match_id" });
    await queueUpdateWithoutChangingSubmission(order.id, "application_needs_action", matchId);
    return;
  }
  if (!vacancy || vacancy.status !== "open" || vacancy.review_status !== "approved" || vacancy.duplicate_of || Date.now() - new Date(vacancy.last_seen_at).getTime() > 72 * 3600000 || scoreVacancy(vacancy, profile, order.application_authorized ? readApplicationScope(order.service_details) : null).score < 25 || !(match.reasons as string[]).some((reason) => reason.startsWith("Suitability review:"))) {
    await db.from("job_desk_matches").update({ status: "needs_human" }).eq("id", matchId);
    await db.from("job_desk_applications").upsert({ match_id: matchId, order_id: order.id, method: vacancy?.application_method ?? "portal", status: "needs_human", error_message: "Vacancy is stale or no longer suitable." }, { onConflict: "match_id" });
    await queueUpdateWithoutChangingSubmission(order.id, "application_needs_action", matchId);
    return;
  }
  try {
    if (!(await verifyVacancyStillOpen(vacancy))) throw new Error("Vacancy is no longer listed by its official source.");
  } catch (cause) {
    await db.from("job_desk_matches").update({ status: "needs_human" }).eq("id", matchId);
    await db.from("job_desk_applications").upsert({ match_id: matchId, order_id: order.id, method: vacancy.application_method, status: "needs_human", error_message: cause instanceof Error ? cause.message : "Official vacancy source could not be checked." }, { onConflict: "match_id" });
    await queueUpdateWithoutChangingSubmission(order.id, "application_needs_action", matchId);
    return;
  }
  const { data: existing } = await db.from("job_desk_applications").select("status,provider_message_id").eq("match_id", matchId).maybeSingle();
  if (existing?.status === "submitted") return;
  if (existing?.status === "sending") {
    return;
  }
  const submissionCheck = await checkSubmissionRequirements(matchId, order, client, vacancy);
  if (!submissionCheck) return;
  if (vacancy.application_method === "portal") {
    const { data: source } = vacancy.source_id ? await db.from("job_desk_sources").select("provider,site_token,active").eq("id", vacancy.source_id).maybeSingle() : { data: null };
    const supported = source?.active && canAutomatePortal(source.provider, source.site_token, vacancy.apply_url);
    if (!supported) {
      await db.from("job_desk_applications").upsert({ match_id: matchId, order_id: order.id, method: "portal", status: "needs_human", error_message: "This employer portal does not yet have a tested browser adapter." }, { onConflict: "match_id" });
      await db.from("job_desk_matches").update({ status: "needs_human" }).eq("id", matchId);
      await queueUpdateWithoutChangingSubmission(order.id, "application_needs_action", matchId);
      return;
    }
    const details = readApplicantDetails(order.service_details);
    const names = client.full_name.trim().split(/\s+/);
    const cvFile = await createJobDeskCvDocx({ name: client.full_name, role: String((profile.structured_profile as { targetHeadline?: string } | null)?.targetHeadline ?? ""), contact: [client.email, client.whatsapp_phone].filter(Boolean).join("  |  "), content: cv.structured_content });
    if (!(await claimApplication(matchId, order.id, "portal", vacancy.apply_url))) return;
    let portalConfirmation: { confirmation: string; finalUrl?: string } | undefined;
    try {
      const result = await runPortalApplication({ url: vacancy.apply_url, siteToken: source.site_token, firstName: names[0] ?? "", lastName: names.slice(1).join(" "), email: client.email ?? "", phone: client.whatsapp_phone ?? "", linkedinUrl: details?.applicantLinkedinUrl, portfolioUrl: details?.portfolioUrl, portalAnswers: answersForMatch(order.service_details, matchId, details?.portalAnswers ?? "", latestCv.id), fieldAnswers: submissionCheck.fieldAnswers, fieldSelections: submissionCheck.fieldSelections, city: details?.currentCity, country: details?.currentCountry, coverLetter: match.cover_letter }, cvFile);
      if (result.status === "submitted" && result.confirmation) {
        portalConfirmation = { confirmation: result.confirmation, finalUrl: result.finalUrl };
        const { error: confirmationError } = await db.from("job_desk_applications").update({ status: "submitted", provider_response: { confirmation: result.confirmation, finalUrl: result.finalUrl, clicked: true, verification_type: "portal_confirmation" }, submitted_at: new Date().toISOString(), error_message: null }).eq("match_id", matchId);
        if (confirmationError) throw new Error(confirmationError.message);
        await db.from("job_desk_matches").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", matchId);
        await queueUpdateWithoutChangingSubmission(order.id, "application_submitted", matchId);
        return;
      }
      await db.from("job_desk_applications").update({ status: "needs_human", provider_response: { clicked: result.clicked ?? true, finalUrl: result.finalUrl }, error_message: result.reason ?? "Portal submission needs review." }).eq("match_id", matchId);
    } catch (cause) {
      if (portalConfirmation) {
        const { error: recoveryError } = await db.from("job_desk_applications").update({ status: "submitted", provider_response: { ...portalConfirmation, clicked: true, verification_type: "portal_confirmation" }, submitted_at: new Date().toISOString(), error_message: "Portal confirmed; local confirmation required recovery." }).eq("match_id", matchId);
        if (recoveryError) {
          await logSystemEvent({ category: "job_desk.submission", level: "error", message: "Confirmed portal application could not be persisted. Do not resubmit.", metadata: { matchId, ...portalConfirmation } });
          throw new Error("Portal confirmed application; persistence failed. Do not resubmit.");
        }
        await db.from("job_desk_matches").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", matchId);
        await queueUpdateWithoutChangingSubmission(order.id, "application_submitted", matchId);
        return;
      }
      await db.from("job_desk_applications").update({ status: "needs_human", error_message: cause instanceof Error ? `Browser worker unavailable or outcome uncertain: ${cause.message.slice(0, 350)}` : "Portal outcome uncertain. Check before retrying." }).eq("match_id", matchId);
    }
    await db.from("job_desk_matches").update({ status: "needs_human" }).eq("id", matchId);
    await queueUpdateWithoutChangingSubmission(order.id, "application_needs_action", matchId);
    return;
  }
  if (vacancy.application_method !== "email" || !vacancy.email_verified || !vacancy.application_email || !process.env.RESEND_API_KEY || !(process.env.JOB_DESK_FROM_EMAIL ?? process.env.FROM_EMAIL)) {
    await db.from("job_desk_applications").upsert({ match_id: matchId, order_id: order.id, method: "email", status: "needs_human", error_message: "Verified email provider is not configured." }, { onConflict: "match_id" });
    await db.from("job_desk_matches").update({ status: "needs_human" }).eq("id", matchId);
    await queueUpdateWithoutChangingSubmission(order.id, "application_needs_action", matchId);
    return;
  }
  const candidate = (profile.structured_profile ?? {}) as { targetHeadline?: string; location?: string };
  const attachment = await createJobDeskCvDocx({
    name: client.full_name,
    role: candidate.targetHeadline?.trim() ?? "",
    contact: [client.email, client.whatsapp_phone, candidate.location].filter(Boolean).join("  |  "),
    content: cv.structured_content
  });
  if (!(await claimApplication(matchId, order.id, "email", vacancy.application_email))) return;
  const content = `${match.cover_letter}\n\nApplication submitted with the candidate's express authorization. Candidate contact: ${client.email ?? "Not provided"}; ${client.whatsapp_phone}.`;
  let acceptedId: string | undefined;
  try {
    const result = await sendApplicationEmail({ to: [vacancy.application_email], reply_to: client.email || undefined, subject: `Application: ${vacancy.title} - ${client.full_name}`, text: content, attachments: [{ filename: `${client.full_name.replace(/[^a-z0-9 -]/gi, "").trim() || "Candidate"}-CV.docx`, content: attachment.toString("base64") }] }, `job-desk-${matchId}`);
    acceptedId = result.id;
    const { error: confirmationError } = await db.from("job_desk_applications").update({ status: "submitted", provider_message_id: result.id, provider_response: { id: result.id, verification_type: "email_provider_accepted" }, submitted_at: new Date().toISOString(), error_message: null }).eq("match_id", matchId);
    if (confirmationError) throw new Error(confirmationError.message);
    await db.from("job_desk_matches").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", matchId);
    await queueUpdateWithoutChangingSubmission(order.id, "application_submitted", matchId);
  } catch (cause) {
    if (acceptedId) {
      const { error: recoveryError } = await db.from("job_desk_applications").update({ status: "submitted", provider_message_id: acceptedId, provider_response: { id: acceptedId, verification_type: "email_provider_accepted" }, submitted_at: new Date().toISOString(), error_message: "Provider accepted; local confirmation required recovery." }).eq("match_id", matchId);
      if (recoveryError) {
        await logSystemEvent({ category: "job_desk.submission", level: "error", message: "Accepted application could not be persisted. Do not resend.", metadata: { matchId, providerMessageId: acceptedId } });
        throw new Error("Provider accepted application; database persistence failed. Do not resend.");
      }
      await db.from("job_desk_matches").update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", matchId);
      await queueUpdateWithoutChangingSubmission(order.id, "application_submitted", matchId);
      return;
    }
    // Provider outcome may be uncertain after a timeout. Never retry without review.
    await db.from("job_desk_applications").update({ status: "needs_human", error_message: cause instanceof Error ? cause.message : "Submission outcome unknown", ...(cause instanceof ApplicationEmailError && cause.rejected ? { provider_response: { clicked: false, verification_type: "provider_rejected" } } : {}) }).eq("match_id", matchId);
    await db.from("job_desk_matches").update({ status: "needs_human" }).eq("id", matchId);
    await queueUpdateWithoutChangingSubmission(order.id, "application_needs_action", matchId);
  }
}

async function processTask(task: Task) {
  const db = createSupabaseAdminClient();
  if (task.task_type === "draft_answers" && task.order_id && task.payload.matchId) return processAnswerDrafts(task.order_id, task.payload.matchId);
  if (task.task_type === "review_matches" && task.order_id && task.payload.vacancyIds) {
    const ids = JSON.parse(task.payload.vacancyIds);
    if (!Array.isArray(ids) || ids.some(id => typeof id !== "string")) throw new Error("Invalid review vacancy IDs.");
    return reviewDeferredMatches(task.order_id, ids);
  }
  if (task.task_type === "resume_assisted" && task.order_id && task.payload.matchId) {
    const { data: match, error } = await db.from("job_desk_matches").select("id,status,authorized_at,cover_letter,vacancy:job_desk_vacancies(*)").eq("id", task.payload.matchId).eq("order_id", task.order_id).maybeSingle();
    if (error) throw new Error(error.message);
    const { data: application, error: applicationError } = await db.from("job_desk_applications").select("status,provider_response").eq("match_id", task.payload.matchId).eq("order_id", task.order_id).maybeSingle();
    if (applicationError) throw new Error(applicationError.message);
    if (!match || !["needs_human", "authorized", "suggested"].includes(match.status) || !canRetrySubmission(application)) return { outcome: "held", reason: "Submission evidence must be reviewed before retrying." };
    const { data: order, error: orderError } = await db.from("job_desk_orders").select("*,client:job_desk_clients(*)").eq("id", task.order_id).single();
    if (orderError) throw new Error(orderError.message);
    const client = Array.isArray(order.client) ? order.client[0] : order.client;
    const vacancy = Array.isArray(match.vacancy) ? match.vacancy[0] : match.vacancy;
    const scope = order.application_authorized ? readApplicationScope(order.service_details) : null;
    if (!hasVerifiedJobDeskPayment(order) || !["approved", "active"].includes(order.status) || !client?.consent_to_process || !scope || !vacancy || applicationScopeHold(scope, vacancy)) return { outcome: "held", reason: "Payment or authorization needs review." };
    if (!(await checkSubmissionRequirements(match.id, order, client, vacancy))) return { outcome: "needs_human", reason: "The employer still requires an official step or more information." };
    const nextStatus = match.cover_letter && match.authorized_at ? "authorized" : "suggested";
    if (match.status === "needs_human") {
      const { data: claimed, error: claimError } = await db.from("job_desk_matches").update({ status: nextStatus }).eq("id", match.id).eq("status", "needs_human").select("id").maybeSingle();
      if (claimError) throw new Error(claimError.message);
      if (!claimed) return { outcome: "held", reason: "Another worker is already processing this application." };
    }
    if (nextStatus === "authorized") await submitMatch(match.id);
    else await prepareMatch(match.id);
    return { outcome: "rechecked", reason: "Check the application evidence for the final outcome." };
  }
  if (task.task_type === "process_cv" && task.order_id) return processJobDeskOrder({ orderId: task.order_id });
  if (task.task_type === "discover") return { count: await discoverVacancies(task.payload.sourceId) };
  if (task.task_type === "discover_email") return discoverEmailVacancies();
  if (task.task_type === "match" && task.order_id) return matchOrder(task.order_id);
  if (task.task_type === "prepare" && task.payload.matchId) { await prepareMatch(task.payload.matchId); return { ok: true }; }
  if (task.task_type === "submit" && task.payload.matchId) {
    await submitMatch(task.payload.matchId);
    const { data: application, error } = await db.from("job_desk_applications").select("status,method,provider_response,error_message").eq("match_id", task.payload.matchId).maybeSingle();
    if (error) throw new Error(error.message);
    return { outcome: application?.status ?? "not_submitted", method: application?.method, reason: application?.error_message ?? null };
  }
  if (task.task_type === "notify_client" && task.order_id && task.payload.event && task.payload.reference) return sendClientUpdate(task.order_id, task.payload.event as ClientUpdate, task.payload.reference);
  if (task.task_type === "schedule") {
    const day = new Date().toISOString().slice(0, 10);
    await enqueueTask("discover_email", `email-discovery:${day}`, null);
    const { data: sources } = await db.from("job_desk_sources").select("id").eq("active", true);
    for (const source of sources ?? []) await enqueueTask("discover", `discover:${source.id}:${day}`, null, { sourceId: source.id });
    return { count: sources?.length ?? 0 };
  }
  throw new Error(`Unknown Job Desk task: ${task.task_type}`);
}

export async function runJobDeskWorker({ maxTasks = 10, maxRunMs = 45000 }: { maxTasks?: number; maxRunMs?: number } = {}) {
  const db = createSupabaseAdminClient();
  const workerId = `vercel-${crypto.randomUUID()}`;
  const deadline = Date.now() + maxRunMs;
  let processed = 0;
  for (let index = 0; index < maxTasks && Date.now() < deadline; index += 1) {
    const task = await claimPrioritizedTask(db, workerId, index % 6 === 5) as Task | null;
    if (!task) break;
    const heartbeat = setInterval(() => {
      void db.from("job_desk_tasks")
        .update({ lease_until: new Date(Date.now() + 4 * 60 * 1000).toISOString() })
        .eq("id", task.id)
        .eq("locked_by", workerId)
        .eq("status", "running");
    }, 60_000);
    try {
      const result = await processTask(task);
      const { error: finishError } = await db.from("job_desk_tasks").update({ status: "succeeded", result, last_error: null, locked_at: null, lease_until: null, locked_by: null }).eq("id", task.id).eq("locked_by", workerId);
      if (finishError) throw new Error(finishError.message);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.slice(0, 1000) : "Task failed";
      const permanentEmailFailure = task.task_type === "notify_client" && /client update \((?:400|401|403)\)/.test(message);
      await db.from("job_desk_tasks").update({ status: permanentEmailFailure || task.attempts >= task.max_attempts ? "failed" : "queued", last_error: message, available_at: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** task.attempts)).toISOString(), locked_at: null, lease_until: null, locked_by: null }).eq("id", task.id).eq("locked_by", workerId);
    } finally {
      clearInterval(heartbeat);
    }
    processed += 1;
  }
  return processed;
}
