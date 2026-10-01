import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { scoreVacancy } from "./matching";
import { applicationScopeHold, readApplicationScope } from "./application-scope";
import { reviewCandidateMatches } from "./relevance";
import { hasVerifiedJobDeskPayment } from "./payment";
import { cleanText, feedStillListsJob, fetchFeedJobs, normalizeFeedJob, reviewReasons, vacancyFingerprint, type FeedSource } from "./vacancy-feeds";

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

export async function verifyVacancyStillOpen(vacancy: { id: string; source_id: string | null; external_id: string }) {
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
  const candidates = vacancies.filter(vacancy => !scope || !applicationScopeHold(scope, vacancy)).map((vacancy) => ({ vacancy, ...scoreVacancy(vacancy, profile, scope) })).filter((item) => item.score >= 25).sort((a, b) => b.score - a.score).slice(0, 64);
  const reviewed = await reviewCandidateMatches(orderId, { ...profile, approvedCvText: plainText(approved.html ?? ""), applicationScope: scope, broaderPreferences: scope?.includeBroaderRoles ? scope : null }, candidates.map((item) => item.vacancy));
  const matches = candidates.filter((item) => reviewed.get(item.vacancy.id)?.suitable).map((item) => ({ ...item, reasons: [...item.reasons, `Suitability review: ${reviewed.get(item.vacancy.id)?.reason}`] }));
  let refreshedSources = 0;
  if (matches.length < 10) {
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
  const { data: oldMatches, error: oldError } = await db.from("job_desk_matches").select("id,vacancy_id").eq("order_id", orderId).in("status", ["suggested", "preparing", "ready"]).limit(500);
  if (oldError) throw new Error(oldError.message);
  const obsoleteIds = (oldMatches ?? []).filter((item) => !selected.has(item.vacancy_id)).map((item) => item.id);
  if (obsoleteIds.length) {
    const { error: staleError } = await db.from("job_desk_matches").update({ status: "rejected", authorization_token_hash: null, authorization_expires_at: null }).in("id", obsoleteIds);
    if (staleError) throw new Error(staleError.message);
  }
  for (const match of matches) {
    const { error: matchError } = await db.from("job_desk_matches").upsert({ order_id: orderId, vacancy_id: match.vacancy.id, score: match.score, reasons: match.reasons, gaps: match.gaps }, { onConflict: "order_id,vacancy_id", ignoreDuplicates: true });
    if (matchError) throw new Error(matchError.message);
  }
  const { data: top, error: topError } = await db.from("job_desk_matches").select("id,score,vacancy:job_desk_vacancies(id,provider,application_method,email_verified,application_email)").eq("order_id", orderId).eq("status", "suggested").gte("score", 50).order("score", { ascending: false }).limit(50);
  if (topError) throw new Error(topError.message);
  const routeRank = (item: NonNullable<typeof top>[number]) => {
    const vacancy = Array.isArray(item.vacancy) ? item.vacancy[0] : item.vacancy;
    return vacancy?.application_method === "email" && vacancy.email_verified && vacancy.application_email ? 2 : vacancy?.provider === "greenhouse" ? 1 : 0;
  };
  // Prefer supported submission routes without weakening candidate relevance thresholds.
  for (const item of [...(top ?? [])].filter(item => selected.has((Array.isArray(item.vacancy) ? item.vacancy[0] : item.vacancy)?.id ?? "") && routeRank(item) > 0).sort((a, b) => routeRank(b) - routeRank(a) || b.score - a.score).slice(0, 10)) await enqueueTask("prepare", `prepare:${item.id}:${approved.id}`, orderId, { matchId: item.id });
  await db.from("job_desk_orders").update({ status: "active" }).eq("id", orderId).in("status", ["approved", "active"]);
  if (matches.length) await enqueueTask("notify_client", `client-update:matches_ready:${orderId}:${approved.id}`, orderId, { event: "matches_ready", reference: `${orderId}:${approved.id}` });
  return { count: matches.length, coverage: { checkedAt: new Date().toISOString(), target: 10, recentApproved: vacancies.length, scopeEligible: vacancies.filter(vacancy => !scope || !applicationScopeHold(scope, vacancy)).length, evidenceCandidates: candidates.length, suitable: matches.length, supported: matches.filter(item => item.score >= 50 && (item.vacancy.application_method === "email" && item.vacancy.email_verified && item.vacancy.application_email || item.vacancy.provider === "greenhouse")).length, refreshedSources, rejectedExamples: candidates.filter(item => reviewed.get(item.vacancy.id)?.suitable === false).slice(0, 10).map(item => ({ title: item.vacancy.title, company: item.vacancy.company_name, reason: reviewed.get(item.vacancy.id)?.reason })) } };
}

export function createAuthorizationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
