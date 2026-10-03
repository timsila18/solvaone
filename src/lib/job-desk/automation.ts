import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { scoreVacancy, submissionHoldReason } from "./matching";
import { applicationScopeHold, readApplicationScope } from "./application-scope";
import { reviewCandidateMatches } from "./relevance";
import { hasVerifiedJobDeskPayment } from "./payment";
import { compareSubmissionCandidates, submissionRouteRank } from "./submission-priority";
import { screenAutomaticCandidates } from "./automatic-screen";
import { APPLICATION_TARGET, SHORTLIST_TARGET, occupiesApplicationSlot, reviewedShortlist, screeningBatch, rotatingReviewBatch } from "./match-shortlist";
import { draftableQuestions, prohibitsAnswerDrafting } from "./question-policy";
import { answersForMatch } from "./assisted-answers";
import { submissionPreflight } from "./submission-preflight";
import { readApplicantDetails } from "./applicant-details";
import { buildApplicantKnown } from "./applicant-known";
import { fetchEmailAdverts, fetchEmailPage, parseEmailAdvert } from "./email-vacancy-feed";
import { cleanText, feedStillListsJob, fetchFeedJobs, normalizeFeedJob, reviewReasons, vacancyFingerprint, type FeedSource } from "./vacancy-feeds";
import { careerCatalogueUrls } from "./career-discovery";
import { adjacentRoleTitles, searchLane, searchLanePlan } from "./search-lanes";

export type Vacancy = { id: string; provider?: string; title: string; company_name: string; location: string; workplace_type: string; description: string; status: string; application_method: string; application_email: string | null; email_verified: boolean; apply_url: string };

export function plainText(html: string) {
  return cleanText(html);
}

export async function enqueueTask(taskType: string, key: string, orderId: string | null, payload: Record<string, unknown> = {}) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("job_desk_tasks").upsert({ task_type: taskType, deduplication_key: key, order_id: orderId, payload }, { onConflict: "deduplication_key", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id;
}

export async function discoverVacancies(sourceId: string) {
  const db = createSupabaseAdminClient();
  const { data: source, error } = await db.from("job_desk_sources").select("*").eq("id", sourceId).eq("active", true).single();
  if (error || !source) throw new Error("Active vacancy source not found.");
  if (!/^[a-zA-Z0-9_-]{2,80}$/.test(source.site_token)) throw new Error("Invalid source token.");
  try {
    const items = await fetchFeedJobs(source as FeedSource);
    const now = new Date().toISOString();
    const seenInFeed = new Set<string>();
    const parsed = items.map((item) => normalizeFeedJob(source as FeedSource, item)).filter((job): job is NonNullable<typeof job> => {
      if (!job) return false;
      const key = vacancyFingerprint(job);
      if (seenInFeed.has(key)) return false;
      seenInFeed.add(key);
      return true;
    });
    if (items.length > 0 && parsed.length === 0) throw new Error("No official application links were found; existing vacancies were retained.");
    const { data: existing, error: existingError } = await db.from("job_desk_vacancies").select("id,source_id,company_name,title,location").eq("status", "open").or(`source_id.is.null,source_id.neq.${sourceId}`).limit(5000);
    if (existingError) throw new Error(existingError.message);
    const { data: previous, error: previousError } = await db.from("job_desk_vacancies").select("external_id,review_status,description,source_updated_at").eq("source_id", sourceId).limit(1500);
    if (previousError) throw new Error(previousError.message);
    const previousById = new Map((previous ?? []).map((item) => [item.external_id, item]));
    const existingByFingerprint = new Map((existing ?? []).map((item) => [vacancyFingerprint(item), item.id]));
    const rows = parsed.map((job) => {
      const duplicateOf = existingByFingerprint.get(vacancyFingerprint(job)) ?? null;
      const reasons = reviewReasons(job, new Date(now));
      if (duplicateOf) reasons.push("duplicate_listing");
      const old = previousById.get(job.external_id);
      const unchanged = old && old.description === job.description && old.source_updated_at === job.source_updated_at;
      const reviewStatus = old?.review_status === "rejected" ? "rejected" : reasons.includes("expired_deadline") ? "needs_review" : unchanged && old.review_status === "approved" && !duplicateOf ? "approved" : reasons.length ? "needs_review" : "approved";
      return { ...job, source_id: sourceId, provider: source.provider, application_method: "portal", last_seen_at: now, status: "open", review_status: reviewStatus, review_reasons: reasons, duplicate_of: duplicateOf };
    });
    for (let index = 0; index < rows.length; index += 100) {
      const { error: upsertError } = await db.from("job_desk_vacancies").upsert(rows.slice(index, index + 100), { onConflict: "provider,external_id" });
      if (upsertError) throw new Error(upsertError.message);
    }
    await db.from("job_desk_vacancies").update({ status: "closed" }).eq("source_id", sourceId).lt("last_seen_at", now);
    await db.from("job_desk_sources").update({ last_synced_at: now, last_error: null }).eq("id", sourceId);
    const { data: orders } = await db.from("job_desk_orders").select("id,payment_status,amount,payment_reference").eq("service_type", "job_search_full").in("payment_status", ["paid", "waived"]).in("status", ["approved", "active"]).limit(500);
    for (const order of orders ?? []) if (hasVerifiedJobDeskPayment(order)) await enqueueTask("match", `match:${order.id}:${sourceId}:${now.slice(0, 13)}`, order.id);
    return rows.length;
  } catch (cause) {
    await db.from("job_desk_sources").update({ last_error: cause instanceof Error ? cause.message.slice(0, 500) : "Source failed" }).eq("id", sourceId);
    throw cause;
  }
}

export async function discoverEmailVacancies() {
  const db = createSupabaseAdminClient();
  const { data: activeOrders, error: activeError } = await db.from("job_desk_orders").select("client_id,service_details").eq("service_type", "job_search_full").in("status", ["approved", "active"]).limit(500);
  if (activeError) throw new Error(activeError.message);
  const clientIds = [...new Set((activeOrders ?? []).map(order => order.client_id))];
  const { data: profiles, error: profileError } = clientIds.length ? await db.from("job_desk_candidate_profiles").select("client_id,target_job_titles,structured_profile").in("client_id", clientIds) : { data: [], error: null };
  if (profileError) throw new Error(profileError.message);
  const careerUrls = careerCatalogueUrls((profiles ?? []).map(profile => {
    const scopes = (activeOrders ?? []).filter(order => order.client_id === profile.client_id).map(order => readApplicationScope(order.service_details)).filter(Boolean);
    return { ...profile, target_job_titles: scopes.length ? scopes.flatMap(scope => scope?.targetRoles ?? []) : profile.target_job_titles, generalRoleFamilies: scopes.flatMap(scope => scope?.includeGeneralRoles ? scope.generalRoleFamilies ?? [] : []), broaderRoles: scopes.flatMap(scope => scope ? [...(scope.includeBroaderRoles ? scope.broaderRoles ?? [] : []), ...adjacentRoleTitles(scope)] : []) };
  }));
  const { results, checked, failures } = await fetchEmailAdverts(careerUrls);
  for (const row of results) {
    const { data: duplicate, error: duplicateError } = await db.from("job_desk_vacancies").select("id").eq("apply_url", row.apply_url).neq("external_id", row.external_id).eq("status", "open").limit(1).maybeSingle();
    if (duplicateError) throw new Error(duplicateError.message);
    const { data: old, error: readError } = await db.from("job_desk_vacancies").select("review_status").eq("provider", "manual").eq("external_id", row.external_id).maybeSingle();
    if (readError) throw new Error(readError.message);
    const { error } = await db.from("job_desk_vacancies").upsert({ ...row, duplicate_of: duplicate?.id ?? null, review_status: old?.review_status === "rejected" ? "rejected" : duplicate ? "needs_review" : row.review_status }, { onConflict: "provider,external_id" });
    if (error) throw new Error(error.message);
  }
  const { data: orders, error } = await db.from("job_desk_orders").select("id,payment_status,amount,payment_reference").eq("service_type", "job_search_full").in("status", ["approved", "active"]).limit(500);
  if (error) throw new Error(error.message);
  for (const order of orders ?? []) if (hasVerifiedJobDeskPayment(order)) await enqueueTask("match", `email-match:${order.id}:${Math.floor(Date.now() / 7200000)}`, order.id);
  return { checked, careerCatalogues: careerUrls, imported: results.length, open: results.filter(row => row.status === "open" && row.review_status === "approved").length, failures };
}

export async function verifyVacancyStillOpen(vacancy: { id: string; source_id: string | null; external_id: string; apply_url?: string; description?: string }) {
  if (vacancy.external_id.startsWith("official-email:")) {
    const fresh = parseEmailAdvert(await fetchEmailPage(vacancy.apply_url ?? ""), vacancy.apply_url ?? "");
    // Changed requirements need another candidate review, not a stale approval.
    return Boolean(fresh && fresh.status === "open" && fresh.review_status === "approved" && fresh.description === vacancy.description);
  }
  if (!vacancy.source_id) return true; // A manually added listing needs administrator verification.
  const db = createSupabaseAdminClient();
  const { data: source, error } = await db.from("job_desk_sources").select("provider,site_token,company_name,active").eq("id", vacancy.source_id).single();
  if (error || !source?.active) return false;
  const listed = await feedStillListsJob(source as FeedSource, vacancy.external_id);
  if (!listed) await db.from("job_desk_vacancies").update({ status: "closed" }).eq("id", vacancy.id);
  return listed;
}

export async function matchOrder(orderId: string) {
  const db = createSupabaseAdminClient();
  const { data: order, error: orderError } = await db.from("job_desk_orders").select("id,client_id,payment_status,amount,payment_reference,status,service_type,application_authorized,service_details").eq("id", orderId).single();
  if (orderError) throw new Error(orderError.message);
  if (order?.service_type !== "job_search_full") throw new Error("Job matching is only available for job hunting orders.");
  if (!hasVerifiedJobDeskPayment(order)) throw new Error("A verified payment or approved waiver is required before job matching.");
  const { data: approved } = await db.from("job_desk_documents").select("id,status,html").eq("order_id", orderId).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle();
  if (approved?.status !== "approved") throw new Error("Approve the latest candidate CV before matching vacancies.");
  const { data: profile, error: profileError } = await db.from("job_desk_candidate_profiles").select("*").eq("client_id", order.client_id).maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("Candidate profile is missing.");
  const freshnessCutoff = new Date(Date.now() - 72 * 3600000).toISOString();
  const vacancies: Vacancy[] = [];
  for (let offset = 0; offset < 3000; offset += 1000) {
    const { data, error } = await db.from("job_desk_vacancies").select("*").eq("status", "open").eq("review_status", "approved").is("duplicate_of", null).gte("last_seen_at", freshnessCutoff).order("last_seen_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 999);
    if (error) throw new Error(error.message);
    vacancies.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const scope = order.application_authorized ? readApplicationScope(order.service_details) : null;
  const { data: handled, error: handledError } = await db.from("job_desk_matches").select("id,vacancy_id,status,application:job_desk_applications(id,status,provider_message_id,provider_response)").eq("order_id", orderId);
  if (handledError) throw new Error(handledError.message);
  // Existing outcomes belong to the guarded retry workflow, not a new application search.
  const handledIds = new Set((handled ?? []).filter(item => Array.isArray(item.application) ? item.application.length > 0 : Boolean(item.application)).map(item => item.vacancy_id));
  const { data: queuedPreparation, error: preparationError } = await db.from("job_desk_tasks").select("payload").eq("order_id", orderId).eq("task_type", "prepare").in("status", ["queued", "running"]);
  if (preparationError) throw new Error(preparationError.message);
  const preparingIds = new Set((queuedPreparation ?? []).map(item => (item.payload as { matchId?: string })?.matchId));
  const committedMatches = (handled ?? []).filter(item => occupiesApplicationSlot(item, preparingIds));
  const committedSlots = committedMatches.length;
  for (const item of committedMatches) handledIds.add(item.vacancy_id);
  const remainingSlots = Math.max(0, APPLICATION_TARGET - committedSlots);
  const scopedVacancies = vacancies.filter(vacancy => !scope || !applicationScopeHold(scope, vacancy));
  const ranked = scopedVacancies.filter(vacancy => !handledIds.has(vacancy.id)).map(vacancy => ({ vacancy, ...scoreVacancy(vacancy, { ...profile, approvedCvText: plainText(approved.html ?? "") }, scope) }));
  const pool = ranked.filter(item => item.score >= 25).sort(compareSubmissionCandidates);
  const filterReasons = new Map<string, number>();
  for (const item of ranked.filter(item => item.score < 25)) {
    const reason = item.gaps[0] ?? "Insufficient documented role or skill overlap.";
    filterReasons.set(reason, (filterReasons.get(reason) ?? 0) + 1);
  }
  const { data: client, error: clientError } = await db.from("job_desk_clients").select("full_name,email,whatsapp_phone").eq("id", order.client_id).single();
  if (clientError || !client) throw new Error(clientError?.message ?? "Candidate contact details are missing.");
  const { data: sourceRows, error: sourcesError } = await db.from("job_desk_sources").select("id,provider,site_token,active").eq("active", true);
  if (sourcesError) throw new Error(sourcesError.message);
  const sourcesById = new Map((sourceRows ?? []).map(source => [source.id, source]));
  const details = readApplicantDetails(order.service_details);
  const blockedQuestions = new Map<string, string[]>();
  const screened = await screenAutomaticCandidates(screeningBatch(pool.filter(item => submissionRouteRank(item.vacancy) > 0), Math.floor(Date.now() / 300000)), async item => {
    const vacancy = item.vacancy as Vacancy & { source_id?: string };
    const hold = submissionHoldReason(vacancy.application_method === "email" ? vacancy.description : "", client.email, plainText(approved.html ?? "").length);
    if (hold) return { ready: false, blockers: [hold] };
    const source = sourcesById.get(vacancy.source_id ?? "");
    const preflight = await submissionPreflight({ method: vacancy.application_method, emailVerified: vacancy.email_verified, applicationEmail: vacancy.application_email, provider: source?.provider, siteToken: source?.site_token, url: vacancy.apply_url, answers: details?.portalAnswers ?? "", known: buildApplicantKnown(client, details, approved.html ?? "") });
    if (!preflight.ready) blockedQuestions.set(vacancy.id, preflight.blockers);
    return preflight;
  });
  const candidates = screened.ready;
  // Preserve deferred schema/connection errors as well as explicit missing answers.
  for (const { candidate, reason } of screened.skipped) {
    if (!blockedQuestions.has(candidate.vacancy.id)) blockedQuestions.set(candidate.vacancy.id, [reason]);
  }
  const reviewed = await reviewCandidateMatches(orderId, { ...profile, approvedCvText: plainText(approved.html ?? ""), applicationScope: scope, broaderPreferences: scope?.includeBroaderRoles ? scope : null }, candidates.map((item) => item.vacancy));
  const automaticShortlist = reviewedShortlist(candidates.filter((item) => reviewed.get(item.vacancy.id)?.suitable).map((item) => ({ ...item, reasons: [...item.reasons, `Suitability review: ${reviewed.get(item.vacancy.id)?.reason}`] })));
  const assistedPool = rotatingReviewBatch([...pool.filter(item => submissionRouteRank(item.vacancy) === 0), ...screened.skipped.map(item => item.candidate)], Math.floor(Date.now() / 7200000));
  const assistedReview = scope && automaticShortlist.length < SHORTLIST_TARGET
    ? await reviewCandidateMatches(orderId, { ...profile, approvedCvText: plainText(approved.html ?? ""), applicationScope: scope }, assistedPool.map(item => item.vacancy))
    : new Map<string, { suitable: boolean; reason: string }>();
  const assisted = reviewedShortlist(assistedPool.filter(item => assistedReview.get(item.vacancy.id)?.suitable).map(item => ({ ...item, reasons: [...item.reasons, `Suitability review: ${assistedReview.get(item.vacancy.id)?.reason}`, `Assisted route: ${(blockedQuestions.get(item.vacancy.id) ?? ["Unsupported portal: use the prepared admin application packet."]).join("; ")}`] }))).slice(0, Math.min(5, SHORTLIST_TARGET - automaticShortlist.length));
  const shortlist = [...automaticShortlist, ...assisted];
  const matches = automaticShortlist.slice(0, remainingSlots);
  let refreshedSources = 0;
  if (remainingSlots > 0 && shortlist.length < SHORTLIST_TARGET) {
    if (await enqueueTask("discover_email", `email-coverage:${Math.floor(Date.now() / 7200000)}`, null)) refreshedSources++;
    const { data: sources, error: sourceError } = await db.from("job_desk_sources").select("id,last_synced_at").eq("active", true).limit(100);
    if (sourceError) throw new Error(sourceError.message);
    const cutoff = Date.now() - 2 * 3600000;
    const window = Math.floor(Date.now() / (2 * 3600000));
    for (const source of sources ?? []) {
      if (!source.last_synced_at || new Date(source.last_synced_at).getTime() < cutoff) {
        const task = await enqueueTask("discover", `coverage-refresh:${source.id}:${window}`, null, { sourceId: source.id });
        if (task) refreshedSources += 1;
      }
    }
  }
  const selected = new Set(matches.map((item) => item.vacancy.id));
  const deferred = new Set(candidates.filter(item => reviewed.get(item.vacancy.id)?.reason.startsWith("Review temporarily unavailable;")).map(item => item.vacancy.id));
  for (const item of candidates) if (reviewed.get(item.vacancy.id)?.suitable && !selected.has(item.vacancy.id)) deferred.add(item.vacancy.id);
  // Preserve historical/manual work; skipped forms never enter automatic preparation.
  for (const item of screened.skipped) deferred.add(item.candidate.vacancy.id);
  for (const item of pool.filter(item => submissionRouteRank(item.vacancy) === 0)) deferred.add(item.vacancy.id);
  const examined = new Set([...screened.ready.map(item => item.vacancy.id), ...screened.skipped.map(item => item.candidate.vacancy.id)]);
  for (const item of pool) if (!examined.has(item.vacancy.id)) deferred.add(item.vacancy.id);
  for (const id of handledIds) deferred.add(id);
  const { data: oldMatches, error: oldError } = await db.from("job_desk_matches").select("id,vacancy_id").eq("order_id", orderId).in("status", ["suggested", "preparing", "ready"]).limit(500);
  if (oldError) throw new Error(oldError.message);
  const obsoleteIds = (oldMatches ?? []).filter((item) => !selected.has(item.vacancy_id) && !deferred.has(item.vacancy_id)).map((item) => item.id);
  if (obsoleteIds.length) {
    const { error: staleError } = await db.from("job_desk_matches").update({ status: "rejected", authorization_token_hash: null, authorization_expires_at: null }).in("id", obsoleteIds);
    if (staleError) throw new Error(staleError.message);
  }
  for (const match of [...matches, ...assisted]) {
    const { error: matchError } = await db.from("job_desk_matches").upsert({ order_id: orderId, vacancy_id: match.vacancy.id, score: match.score, reasons: match.reasons, gaps: match.gaps }, { onConflict: "order_id,vacancy_id", ignoreDuplicates: true });
    if (matchError) throw new Error(matchError.message);
  }
  const selectedIds = [...matches, ...assisted].map(item => item.vacancy.id);
  const { data: top, error: topError } = selectedIds.length ? await db.from("job_desk_matches").select("id,score,vacancy:job_desk_vacancies(id,provider,application_method,email_verified,application_email)").eq("order_id", orderId).in("vacancy_id", selectedIds).eq("status", "suggested").gte("score", 25).order("score", { ascending: false }).limit(50) : { data: [], error: null };
  if (topError) throw new Error(topError.message);
  const routeRank = (item: NonNullable<typeof top>[number]) => {
    const vacancy = Array.isArray(item.vacancy) ? item.vacancy[0] : item.vacancy;
    return vacancy ? submissionRouteRank(vacancy) : 0;
  };
  // Full-advert evidence review, not title-word percentage, qualifies these selected matches.
  // Each task preflights independently; blocked forms must not consume a ten-job batch.
  for (const item of [...(top ?? [])].filter(item => selected.has((Array.isArray(item.vacancy) ? item.vacancy[0] : item.vacancy)?.id ?? "") && routeRank(item) > 0).sort((a, b) => routeRank(b) - routeRank(a) || b.score - a.score)) await enqueueTask("prepare", `prepare:${item.id}:${approved.id}`, orderId, { matchId: item.id });
  const assistedIds = new Set(assisted.map(item => item.vacancy.id));
  for (const item of top ?? []) if (assistedIds.has((Array.isArray(item.vacancy) ? item.vacancy[0] : item.vacancy)?.id ?? "")) await enqueueTask("prepare", `assisted-packet:${item.id}:${approved.id}`, orderId, { matchId: item.id, assisted: "true" });
  // Ready work is queued first. A small separately reviewed pool may need factual drafts.
  const reviewPool = screened.skipped.map(item => item.candidate).filter(item => {
    const blockers = blockedQuestions.get(item.vacancy.id) ?? [];
    return blockers.length && !prohibitsAnswerDrafting(blockers.join(" ")) && draftableQuestions(blockers).length;
  }).slice(0, 5);
  if (scope && reviewPool.length) await enqueueTask("review_matches", `review-matches:${orderId}:${approved.id}:${Math.floor(Date.now() / 7200000)}`, orderId, { vacancyIds: JSON.stringify(reviewPool.map(item => item.vacancy.id)) });
  await db.from("job_desk_orders").update({ status: "active" }).eq("id", orderId).in("status", ["approved", "active"]);
  if (matches.length || assisted.length) await enqueueTask("notify_client", `client-update:matches_ready:${orderId}:${approved.id}`, orderId, { event: "matches_ready", reference: `${orderId}:${approved.id}` });
  const lanes = scope ? searchLanePlan(scope).map(lane => ({ ...lane, ranked: pool.filter(item => searchLane(scope, item.vacancy.title) === lane.id).length, suitable: shortlist.filter(item => searchLane(scope, item.vacancy.title) === lane.id).length })) : [];
  return { count: matches.length, coverage: { lanes, rankingEligible: pool.length, alreadyHandled: scopedVacancies.length - ranked.length, filterReasons: [...filterReasons].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })), searchScope: { roles: scope?.targetRoles ?? profile.target_job_titles, locations: scope?.preferredLocations ?? profile.preferred_locations, arrangement: scope?.remotePreference ?? profile.remote_preference }, checkedAt: new Date().toISOString(), target: APPLICATION_TARGET, shortlistTarget: SHORTLIST_TARGET, selectedForPreparation: matches.length, assistedPackets: assisted.length, committedSlots, recentApproved: vacancies.length, scopeEligible: scopedVacancies.length, evidenceCandidates: candidates.length + assistedPool.length, suitable: shortlist.length, supported: automaticShortlist.length, shortlist: shortlist.map(item => ({ id: item.vacancy.id, title: item.vacancy.title, company: item.vacancy.company_name, url: item.vacancy.apply_url, score: item.score, selected: selected.has(item.vacancy.id), reasons: item.reasons })), automaticScreened: screened.ready.length + screened.skipped.length, automaticSkipped: screened.skipped.length, unsupportedRoutes: pool.filter(item => submissionRouteRank(item.vacancy) === 0).length, skippedExamples: screened.skipped.slice(0, 10).map(item => ({ title: item.candidate.vacancy.title, company: item.candidate.vacancy.company_name, reason: item.reason })), refreshedSources, rejectedExamples: [...candidates, ...assistedPool].filter(item => (reviewed.get(item.vacancy.id) ?? assistedReview.get(item.vacancy.id))?.suitable === false).slice(0, 10).map(item => ({ title: item.vacancy.title, company: item.vacancy.company_name, reason: (reviewed.get(item.vacancy.id) ?? assistedReview.get(item.vacancy.id))?.reason })) } };
}

export async function reviewDeferredMatches(orderId: string, vacancyIds: string[]) {
  const db = createSupabaseAdminClient();
  const { data: order, error } = await db.from("job_desk_orders").select("*,client:job_desk_clients(*)").eq("id", orderId).single();
  if (error) throw new Error(error.message);
  const scope = order?.application_authorized ? readApplicationScope(order.service_details) : null;
  const client = Array.isArray(order?.client) ? order.client[0] : order?.client;
  if (!scope || !hasVerifiedJobDeskPayment(order) || !client?.consent_to_process || !["approved", "active"].includes(order.status)) return { held: true };
  const { data: cv } = await db.from("job_desk_documents").select("id,status,html").eq("order_id", orderId).eq("document_type", "revamped_cv").order("version", { ascending: false }).limit(1).maybeSingle();
  if (cv?.status !== "approved") return { held: true };
  const { data: profile, error: profileError } = await db.from("job_desk_candidate_profiles").select("*").eq("client_id", order.client_id).single();
  if (profileError) throw new Error(profileError.message);
  const { data: rows, error: rowsError } = await db.from("job_desk_vacancies").select("*").in("id", vacancyIds.slice(0, 5)).eq("status", "open").eq("review_status", "approved").is("duplicate_of", null).gte("last_seen_at", new Date(Date.now() - 72 * 3600000).toISOString());
  if (rowsError) throw new Error(rowsError.message);
  const candidates = (rows ?? []).filter(vacancy => !applicationScopeHold(scope, vacancy) && scoreVacancy(vacancy, profile, scope).score >= 25 && submissionRouteRank(vacancy) > 0);
  const reviewed = await reviewCandidateMatches(orderId, { ...profile, approvedCvText: plainText(cv.html ?? ""), applicationScope: scope }, candidates);
  let count = 0;
  for (const vacancy of candidates) {
    if (!reviewed.get(vacancy.id)?.suitable || !(await verifyVacancyStillOpen(vacancy))) continue;
    const { data: prior, error: priorError } = await db.from("job_desk_matches").select("id").eq("order_id", orderId).eq("vacancy_id", vacancy.id).maybeSingle();
    if (priorError) throw new Error(priorError.message);
    // Never overwrite ongoing, submitted or uncertain historical applications.
    if (prior) continue;
    const details = readApplicantDetails(order.service_details);
    const { data: source } = await db.from("job_desk_sources").select("provider,site_token,active").eq("id", vacancy.source_id).maybeSingle();
    const preflight = await submissionPreflight({ method: vacancy.application_method, emailVerified: vacancy.email_verified, applicationEmail: vacancy.application_email, provider: source?.active ? source.provider : undefined, siteToken: source?.site_token, url: vacancy.apply_url, answers: answersForMatch(order.service_details, "", details?.portalAnswers ?? "", cv.id), known: buildApplicantKnown(client, details, cv.html ?? "") });
    if (preflight.ready || !draftableQuestions(preflight.blockers).length || prohibitsAnswerDrafting(preflight.blockers.join(" "))) continue;
    const scored = scoreVacancy(vacancy, profile, scope);
    const { data: match, error: insertError } = await db.from("job_desk_matches").upsert({ order_id: orderId, vacancy_id: vacancy.id, score: scored.score, reasons: [...scored.reasons, `Suitability review: ${reviewed.get(vacancy.id)?.reason}`], gaps: scored.gaps, status: "needs_human" }, { onConflict: "order_id,vacancy_id", ignoreDuplicates: true }).select("id").maybeSingle();
    if (insertError) throw new Error(insertError.message);
    if (!match) continue;
    const { error: applicationError } = await db.from("job_desk_applications").insert({ match_id: match.id, order_id: orderId, method: vacancy.application_method, status: "needs_human", provider_response: { clicked: false, preflight }, error_message: `Preflight: ${preflight.blockers.join("; ")}`.slice(0, 4000) });
    if (applicationError) throw new Error(applicationError.message);
    await enqueueTask("draft_answers", `answer-drafts:${match.id}:${cv.id}`, orderId, { matchId: match.id });
    count++;
  }
  return { reviewApplications: count };
}

export function createAuthorizationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
