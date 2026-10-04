import { createHash } from "node:crypto";
import { load } from "cheerio";
import { isCareerCatalogueUrl } from "./career-discovery";
import { balancedDiscoveryLinks } from "./search-lanes";

const origin = "https://www.corporatestaffing.co.ke";
export const emailCatalogueUrl = `${origin}/category/corporate-staffing-jobs/`;
const recruiterRecipients = new Set(["jobs@corporatestaffing.co.ke", "vacancies@corporatestaffing.co.ke"]);
// Recruitment address published in the trusted recruiter's application section;
// employer identity/domain independently checked before inclusion here.
const employerRecipients = [{ email: "recruitment@westmedical.co.ke", employer: /westlands? medical centre/i }];

export function isEmailCatalogueUrl(value: string) {
  return value === emailCatalogueUrl || isCareerCatalogueUrl(value) || [2, 3].some(page => value === `${emailCatalogueUrl}page/${page}/`);
}

export function emailCataloguePages(html: string) {
  const $ = load(html);
  return [...new Set($("a[href]").map((_, node) => {
    try { return new URL($(node).attr("href") ?? "", origin).href; } catch { return ""; }
  }).get().filter(url => url !== emailCatalogueUrl && isEmailCatalogueUrl(url)))];
}

export function isEmailAdvertUrl(value: string) {
  try { const url = new URL(value); return url.origin === origin && /^\/job\/[a-z0-9-]+\/$/.test(url.pathname) && !url.search; }
  catch { return false; }
}

export function emailAdvertLinks(html: string) {
  const $ = load(html);
  return [...new Set($("h2 a, h3 a").map((_, node) => {
    try { return new URL($(node).attr("href") ?? "", origin).href; } catch { return ""; }
  }).get().filter(isEmailAdvertUrl))].slice(0, 40);
}

export function parseEmailAdvert(html: string, url: string, now = new Date()) {
  if (!isEmailAdvertUrl(url)) throw new Error("Unapproved recruiter advert URL.");
  const $ = load(html);
  $("script,style,nav,footer,.related-posts").remove();
  const title = $("h1").first().text().replace(/\s+/g, " ").trim();
  $("article").first().find("h1,h2,h3,h4,p,li,div,dt,dd,td,th").append(" ");
  const text = $("article").first().text().replace(/\s+/g, " ").trim();
  const description = text.split(/Job Seeker Testimonials|Job Search Support Service:/i)[0].slice(0, 18000);
  const instructions = description.split(/How to Apply/i)[1] ?? "";
  // Never infer a recipient from a footer or a recruiter contact address.
  const employer = description.match(/Employer:\s*(.*?)(?=Industry:|Salary:|Location:|Country:|Deadline:|$)/i)?.[1]?.trim() ?? "";
  const emails = [...new Set((instructions.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).map(email => email.toLowerCase()))];
  const verified = emails.filter(email => recruiterRecipients.has(email) && /send your CV/i.test(instructions) || employerRecipients.some(item => item.email === email && item.employer.test(employer)));
  if (!title || description.length < 400 || verified.length !== 1 || emails.length !== 1) return null;
  const recipient = verified[0];
  const dates: number[] = [];
  for (const match of description.matchAll(/(?:deadline\s*:\s*|before\s+)(\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+\s+\d{4})/gi)) {
    const numeric = match[1].match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const date = numeric ? Date.UTC(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1])) : Date.parse(`${match[1].replace(/(\d)(st|nd|rd|th)\b/gi, "$1")} UTC`);
    if (Number.isFinite(date)) dates.push(date);
  }
  if (!dates.length) return null;
  const deadline = Math.min(...dates);
  const conflict = new Set(dates).size > 1;
  const expired = deadline + 86400000 - 3 * 3600000 <= now.getTime();
  const location = description.match(/Location:\s*(.*?)(?=Country:|Deadline:|$)/i)?.[1]?.trim();
  if (!location || !/Country:\s*Kenya\b/i.test(description)) return null;
  return {
    external_id: `official-email:${createHash("sha256").update(url).digest("hex")}`,
    provider: "manual", source_id: null, company_name: recruiterRecipients.has(recipient) ? "Corporate Staffing Services (recruiter)" : employer, title,
    location: `${location}, Kenya`, workplace_type: "onsite", description,
    apply_url: url, application_method: "email", application_email: recipient, email_verified: true,
    status: expired ? "closed" : "open", review_status: conflict ? "needs_review" : "approved",
    review_reasons: conflict ? ["conflicting_deadlines"] : [], duplicate_of: null,
    last_seen_at: now.toISOString(), source_updated_at: null,
  };
}

export async function fetchEmailPage(url: string) {
  if (!isEmailCatalogueUrl(url) && !isEmailAdvertUrl(url)) throw new Error("Unapproved discovery URL.");
  const response = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000), headers: { "User-Agent": "SolvaOneJobDesk/1.0", Accept: "text/html" } });
  if (!response.ok) throw new Error(`Official recruiter returned HTTP ${response.status}.`);
  const html = await response.text();
  if (html.length > 2000000) throw new Error("Recruiter page exceeds discovery size limit.");
  return html;
}

export async function fetchEmailAdverts(careerUrls: string[] = []) {
  const robots = await fetch(`${origin}/robots.txt`, { redirect: "error", signal: AbortSignal.timeout(12000), cache: "no-store" });
  if (!robots.ok) throw new Error("Recruiter crawl permission could not be checked.");
  // This catalogue currently permits public crawling. Stop if that policy changes.
  if (/^\s*Disallow:\s*\S+/im.test(await robots.text())) throw new Error("Recruiter crawl policy changed; discovery paused for review.");
  const catalogue = await fetchEmailPage(emailCatalogueUrl);
  const discoveredGroups: string[][] = [];
  let catalogueFailures = 0;
  // Read career categories first so broad listings cannot consume the entire advert budget.
  for (const category of careerUrls.filter(isCareerCatalogueUrl)) {
    try { discoveredGroups.push(emailAdvertLinks(await fetchEmailPage(category))); }
    catch { catalogueFailures++; }
  }
  discoveredGroups.push(emailAdvertLinks(catalogue));
  for (const page of emailCataloguePages(catalogue)) {
    try { discoveredGroups.push(emailAdvertLinks(await fetchEmailPage(page))); }
    catch { catalogueFailures++; }
  }
  const links = balancedDiscoveryLinks(discoveredGroups, 100, Math.floor(Date.now() / 7200000));
  if (!links.length) throw new Error("Recruiter catalogue contains no recognizable adverts; retained previous listings.");
  const results: NonNullable<ReturnType<typeof parseEmailAdvert>>[] = [];
  let failures = 0;
  for (let offset = 0; offset < links.length; offset += 4) {
    const batch = await Promise.allSettled(links.slice(offset, offset + 4).map(async url => parseEmailAdvert(await fetchEmailPage(url), url)));
    for (const result of batch) {
      if (result.status === "rejected") failures++;
      else if (result.value) results.push(result.value);
    }
  }
  if (failures === links.length) throw new Error("Recruiter adverts unavailable; retained previous listings.");
  return { results, checked: links.length, failures, catalogueFailures };
}
