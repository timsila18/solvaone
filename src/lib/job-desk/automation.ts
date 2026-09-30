import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { scoreVacancy } from "./matching";
import { hasVerifiedJobDeskPayment } from "./payment";

export type Vacancy = { id: string; title: string; company_name: string; location: string; workplace_type: string; description: string; status: string; application_method: string; application_email: string | null; email_verified: boolean; apply_url: string };

export function plainText(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, " ").replace(/\s+/g, " ").trim().slice(0, 18000);
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
  const token = source.site_token;
  if (!/^[a-zA-Z0-9_-]{2,80}$/.test(token)) throw new Error("Invalid source token.");
  const url = source.provider === "greenhouse" ? `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true` : `https://api.lever.co/v0/postings/${token}?mode=json`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000), cache: "no-store" });
    if (!response.ok) throw new Error(`Vacancy feed returned HTTP ${response.status}`);
    const json = await response.json();
    const items: any[] = source.provider === "greenhouse" ? json.jobs : json;
    if (!Array.isArray(items) || items.length > 1500) throw new Error("Vacancy feed format was not recognized.");
    const now = new Date().toISOString();
    const rows = items.map((item) => {
      const applyUrl = source.provider === "greenhouse" ? item.absolute_url : item.hostedUrl;
      const host = new URL(applyUrl).hostname;
      if (!(source.provider === "greenhouse" ? ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(host) : host === "jobs.lever.co")) return null;
      const location = String(source.provider === "greenhouse" ? item.location?.name ?? "" : item.categories?.location ?? "").slice(0, 300);
      const description = plainText(String(source.provider === "greenhouse" ? item.content ?? "" : item.descriptionPlain ?? item.description ?? ""));
      return { source_id: sourceId, provider: source.provider, external_id: String(item.id), company_name: source.company_name, title: String(item.title ?? item.text ?? "").slice(0, 300), location, workplace_type: /remote/i.test(location + " " + String(item.workplaceType ?? "")) ? "remote" : /hybrid/i.test(location) ? "hybrid" : "unspecified", description, apply_url: applyUrl, application_method: "portal", last_seen_at: now, status: "open" };
    }).filter((row): row is NonNullable<typeof row> => !!row && !!row.title);
    for (let index = 0; index < rows.length; index += 100) {
      const { error: upsertError } = await db.from("job_desk_vacancies").upsert(rows.slice(index, index + 100), { onConflict: "provider,external_id" });
      if (upsertError) throw new Error(upsertError.message);
    }
    await db.from("job_desk_vacancies").update({ status: "closed" }).eq("source_id", sourceId).lt("last_seen_at", now);
    await db.from("job_desk_sources").update({ last_synced_at: now, last_error: null }).eq("id", sourceId);
    const { data: orders } = await db.from("job_desk_orders").select("id,payment_status,amount,payment_reference").in("payment_status", ["paid", "waived"]).in("status", ["approved", "active"]).limit(500);
    for (const order of orders ?? []) if (hasVerifiedJobDeskPayment(order)) await enqueueTask("match", `match:${order.id}:${sourceId}:${now.slice(0, 13)}`, order.id);
    return rows.length;
  } catch (cause) {
    await db.from("job_desk_sources").update({ last_error: cause instanceof Error ? cause.message.slice(0, 500) : "Source failed" }).eq("id", sourceId);
    throw cause;
  }
}

export async function matchOrder(orderId: string) {
  const db = createSupabaseAdminClient();
  const { data: order, error: orderError } = await db.from("job_desk_orders").select("id,client_id,payment_status,amount,payment_reference,status").eq("id", orderId).single();
  if (orderError) throw new Error(orderError.message);
  if (!hasVerifiedJobDeskPayment(order)) throw new Error("A verified payment or approved waiver is required before job matching.");
  const { data: approved } = await db.from("job_desk_documents").select("id").eq("order_id", orderId).eq("document_type", "revamped_cv").eq("status", "approved").limit(1).maybeSingle();
  if (!approved) throw new Error("Approve the candidate CV before matching vacancies.");
  const { data: profile, error: profileError } = await db.from("job_desk_candidate_profiles").select("*").eq("client_id", order.client_id).maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("Candidate profile is missing.");
  const { data: vacancies, error } = await db.from("job_desk_vacancies").select("*").eq("status", "open").order("last_seen_at", { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  const matches = (vacancies ?? []).map((vacancy) => ({ vacancy, ...scoreVacancy(vacancy, profile) })).filter((item) => item.score >= 40).sort((a, b) => b.score - a.score).slice(0, 50);
  for (const match of matches) {
    const { error: matchError } = await db.from("job_desk_matches").upsert({ order_id: orderId, vacancy_id: match.vacancy.id, score: match.score, reasons: match.reasons, gaps: match.gaps }, { onConflict: "order_id,vacancy_id", ignoreDuplicates: true });
    if (matchError) throw new Error(matchError.message);
  }
  const { data: top } = await db.from("job_desk_matches").select("id").eq("order_id", orderId).eq("status", "suggested").order("score", { ascending: false }).limit(3);
  for (const item of top ?? []) await enqueueTask("prepare", `prepare:${item.id}`, orderId, { matchId: item.id });
  await db.from("job_desk_orders").update({ status: "active" }).eq("id", orderId).in("status", ["approved", "active"]);
  return matches.length;
}

export function createAuthorizationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
