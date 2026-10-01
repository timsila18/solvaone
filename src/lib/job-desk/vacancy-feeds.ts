import { createHash } from "node:crypto";

export type FeedProvider = "greenhouse" | "lever" | "ashby" | "smartrecruiters";
export type FeedSource = { provider: FeedProvider; site_token: string; company_name: string };
export type FeedVacancy = {
  external_id: string;
  company_name: string;
  title: string;
  location: string;
  workplace_type: "remote" | "hybrid" | "onsite" | "unspecified";
  description: string;
  apply_url: string;
  source_updated_at: string | null;
};

export const recommendedSources: FeedSource[] = [
  { provider: "greenhouse", site_token: "jumia", company_name: "Jumia" },
  { provider: "ashby", site_token: "M-KOPA", company_name: "M-KOPA" },
  { provider: "greenhouse", site_token: "scangroup", company_name: "WPP Scangroup" },
  { provider: "greenhouse", site_token: "oafkenya", company_name: "One Acre Fund Kenya" },
  { provider: "lever", site_token: "dlocal", company_name: "dLocal" },
  { provider: "greenhouse", site_token: "gitlab", company_name: "GitLab" },
  { provider: "greenhouse", site_token: "canonical", company_name: "Canonical" },
  { provider: "lever", site_token: "binance", company_name: "Binance" },
  { provider: "ashby", site_token: "lilt-production", company_name: "LILT" },
  { provider: "smartrecruiters", site_token: "WatuCreditLtd", company_name: "Watu Credit" },
  { provider: "smartrecruiters", site_token: "Assent", company_name: "Assent" },
  { provider: "smartrecruiters", site_token: "StratostaffEALimited", company_name: "Stratostaff EA" }
];

export function cleanText(value: unknown) {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, " ").replace(/\s+/g, " ").trim().slice(0, 18000);
}

function dateOrNull(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

export function isOfficialApplyUrl(provider: FeedProvider, token: string, rawUrl: unknown): rawUrl is string {
  try {
    const url = new URL(String(rawUrl));
    if (url.protocol !== "https:") return false;
    const hosts: Record<FeedProvider, string[]> = {
      greenhouse: ["boards.greenhouse.io", "job-boards.greenhouse.io", "job-boards.eu.greenhouse.io"],
      lever: ["jobs.lever.co"],
      ashby: ["jobs.ashbyhq.com"],
      smartrecruiters: ["jobs.smartrecruiters.com"]
    };
    return hosts[provider].includes(url.hostname.toLowerCase()) && url.pathname.split("/")[1]?.toLowerCase() === token.toLowerCase();
  } catch { return false; }
}

function workplace(location: string, hint: string) {
  const text = `${location} ${hint}`;
  return /remote|home based/i.test(text) ? "remote" : /hybrid/i.test(text) ? "hybrid" : /on.?site|office based/i.test(text) ? "onsite" : "unspecified";
}

export function normalizeFeedJob(source: FeedSource, item: Record<string, any>): FeedVacancy | null {
  const provider = source.provider;
  if (provider === "ashby" && item.isListed === false) return null;
  const title = cleanText(provider === "greenhouse" ? item.title : provider === "lever" ? item.text : provider === "smartrecruiters" ? item.name : item.title).slice(0, 300);
  const location = cleanText(provider === "greenhouse" ? item.location?.name : provider === "lever" ? item.categories?.location : provider === "smartrecruiters" ? item.location?.fullLocation ?? [item.location?.city, item.location?.country === "ke" ? "Kenya" : item.location?.country].filter(Boolean).join(", ") : item.location).slice(0, 300);
  const rawUrl = provider === "greenhouse" ? item.absolute_url : provider === "lever" ? item.hostedUrl : provider === "smartrecruiters" ? item.applyUrl : item.applyUrl ?? item.jobUrl;
  if (!title || !isOfficialApplyUrl(provider, source.site_token, rawUrl)) return null;
  const description = cleanText(provider === "greenhouse" ? item.content : provider === "lever" ? [item.descriptionPlain ?? item.description, ...(Array.isArray(item.lists) ? item.lists.map((section: Record<string, unknown>) => `${section.text ?? ""} ${section.content ?? ""}`) : []), item.additionalPlain ?? item.additional].filter(Boolean).join(" ") : provider === "smartrecruiters" ? Object.values(item.jobAd?.sections ?? {}).map((section: any) => `${section.title ?? ""} ${section.text ?? ""}`).join(" ") : item.descriptionPlain ?? item.descriptionHtml);
  const date = provider === "greenhouse" ? item.updated_at : provider === "lever" ? item.createdAt : provider === "smartrecruiters" ? item.releasedDate : item.publishedAt;
  const externalId = provider === "ashby" ? createHash("sha256").update(String(item.jobUrl ?? rawUrl)).digest("hex") : String(item.id ?? "");
  if (!externalId) return null;
  const hint = provider === "ashby" ? `${item.workplaceType ?? ""} ${item.isRemote ? "remote" : ""}` : provider === "smartrecruiters" ? `${item.location?.remote ? "remote" : ""} ${item.location?.hybrid ? "hybrid" : ""}` : String(item.workplaceType ?? "");
  return { external_id: externalId, company_name: source.company_name, title, location, workplace_type: workplace(location, hint), description, apply_url: String(rawUrl), source_updated_at: dateOrNull(date) };
}

export function vacancyFingerprint(job: Pick<FeedVacancy, "company_name" | "title" | "location">) {
  const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return [clean(job.company_name), clean(job.title), clean(job.location)].join("|");
}

export function reviewReasons(job: FeedVacancy, now = new Date()) {
  const reasons: string[] = [];
  const deadline = job.description.match(/\b(?:application\s+deadline|closing\s+date|apply\s+by)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[a-z]+\s+\d{4})\b/i);
  if (deadline) { const date = new Date(deadline[1]); if (!Number.isNaN(date.getTime()) && date.getTime() + 86400000 < now.getTime()) reasons.push("expired_deadline"); }
  if (job.description.length < 160) reasons.push("thin_description");
  if (job.source_updated_at && now.getTime() - new Date(job.source_updated_at).getTime() > 180 * 86400000) reasons.push("old_published_date");
  if (/application (?:fee|charge)|pay (?:a|an|the) (?:registration|processing|application) fee|send money|deposit to apply/i.test(job.description)) reasons.push("payment_request_language");
  if (/apply (?:only |exclusively )?(?:via|through) (?:whatsapp|telegram)/i.test(job.description)) reasons.push("messaging_only_application");
  return reasons;
}

async function fetchJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Vacancy feed returned HTTP ${response.status}`);
  return response.json();
}

export async function fetchFeedJobs(source: FeedSource): Promise<Record<string, any>[]> {
  const token = encodeURIComponent(source.site_token);
  if (source.provider === "greenhouse") {
    const body = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
    if (!Array.isArray(body.jobs) || body.jobs.length > 1500) throw new Error("Greenhouse feed was incomplete or too large.");
    return body.jobs;
  }
  if (source.provider === "lever") {
    const body = await fetchJson(`https://api.lever.co/v0/postings/${token}?mode=json`);
    if (!Array.isArray(body) || body.length > 1500) throw new Error("Lever feed was incomplete or too large.");
    return body;
  }
  if (source.provider === "ashby") {
    const body = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${token}`);
    if (!Array.isArray(body.jobs) || body.jobs.length > 1500) throw new Error("Ashby feed was incomplete or too large.");
    return body.jobs;
  }
  const postings = await fetchSmartRecruitersPostings(token);
  const jobs: Record<string, any>[] = [];
  for (let start = 0; start < postings.length; start += 5) {
    const page = await Promise.all(postings.slice(start, start + 5).map((item: Record<string, any>) => fetchJson(`https://api.smartrecruiters.com/v1/companies/${token}/postings/${encodeURIComponent(String(item.id))}`)));
    jobs.push(...page);
  }
  return jobs;
}

async function fetchSmartRecruitersPostings(token: string) {
  const postings: Record<string, any>[] = [];
  let total = 0;
  do {
    const page = await fetchJson(`https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=100&offset=${postings.length}`);
    if (!Array.isArray(page.content) || !Number.isInteger(page.totalFound) || page.totalFound < 0 || page.totalFound > 1500) throw new Error("SmartRecruiters feed was incomplete or too large.");
    total = page.totalFound;
    if (!page.content.length && postings.length < total) throw new Error("SmartRecruiters returned an incomplete page; existing vacancies were retained.");
    postings.push(...page.content);
  } while (postings.length < total);
  if (new Set(postings.map(item => item.id)).size !== postings.length) throw new Error("SmartRecruiters pagination repeated postings; existing vacancies were retained.");
  return postings;
}

export async function feedStillListsJob(source: FeedSource, externalId: string) {
  const token = encodeURIComponent(source.site_token);
  if (source.provider === "smartrecruiters") {
    const postings = await fetchSmartRecruitersPostings(token);
    return postings.some((item: Record<string, any>) => String(item.id) === externalId);
  }
  const items = await fetchFeedJobs(source);
  return items.some((item) => {
    if (source.provider === "ashby") return item.isListed !== false && createHash("sha256").update(String(item.jobUrl ?? item.applyUrl ?? "")).digest("hex") === externalId;
    return String(item.id) === externalId;
  });
}
