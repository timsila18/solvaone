import assert from "node:assert/strict";
import test from "node:test";
import { emailAdvertLinks, emailCataloguePages, isEmailCatalogueUrl, isEmailAdvertUrl, parseEmailAdvert } from "../src/lib/job-desk/email-vacancy-feed.ts";

const url = "https://www.corporatestaffing.co.ke/job/hr-assistant/";
const now = new Date("2026-10-02T09:00:00Z");
const page = (deadline = "5th October 2026", metadata = "") => `<article><h1>HR Assistant</h1>Location: Nairobi Country: Kenya ${metadata}<div class="entry-content">${"Recruitment and payroll administration. ".repeat(20)}<h2>How to Apply</h2>Please send your CV only to jobs@corporatestaffing.co.ke before ${deadline}</div></article>`;

test("discovery follows only bounded published recruiter catalogue pages", () => {
  const root = "https://www.corporatestaffing.co.ke/category/corporate-staffing-jobs/";
  assert.deepEqual(emailCataloguePages(`<a href="${root}page/2/">2</a><a href="${root}page/3/">3</a><a href="${root}page/99/">99</a><a href="https://evil.test/">Other</a><a href="${root}page/2/">Next</a>`), [`${root}page/2/`, `${root}page/3/`]);
  assert.equal(isEmailCatalogueUrl(`${root}page/2/?redirect=evil`), false);
  assert.equal(isEmailCatalogueUrl(`${root}page/99/`), false);
});

test("only original allowlisted advert links enter discovery", () => {
  assert.equal(isEmailAdvertUrl("https://www.corporatestaffing.co.ke.evil.test/job/x/"), false);
  assert.equal(isEmailAdvertUrl("http://www.corporatestaffing.co.ke/job/x/"), false);
  assert.deepEqual(emailAdvertLinks(`<h2><a href="${url}">Job</a></h2><h2><a href="${url}">Duplicate</a></h2><h2><a href="https://evil.test">Other</a></h2>`), [url]);
});
test("official instructions provide an email route and full requirements", () => {
  const job = parseEmailAdvert(page(), url, now);
  assert.equal(job.status, "open");
  assert.equal(job.review_status, "approved");
  assert.equal(job.email_verified, true);
  assert.equal(job.application_email, "jobs@corporatestaffing.co.ke");
  assert.equal(job.location, "Nairobi, Kenya");
});

test("published alternative recruiter mailbox is retained exactly", () => {
  const job = parseEmailAdvert(page().replaceAll('jobs@corporatestaffing.co.ke','vacancies@corporatestaffing.co.ke'),url,now);
  assert.equal(job.application_email,'vacancies@corporatestaffing.co.ke');
  assert.equal(job.email_verified,true);
});

test("verified employer recruitment mailbox does not need the recruiter's CV wording", () => {
  const html=page().replace('Location: Nairobi','Employer: Westland Medical Centre Industry: Admin Location: Nairobi').replace('Please send your CV only to jobs@corporatestaffing.co.ke before 5th October 2026','recruitment@westmedical.co.ke').replace('Country: Kenya','Country: Kenya Deadline: 08/10/2026');
  const job=parseEmailAdvert(html,url,now);
  assert.equal(job.application_email,'recruitment@westmedical.co.ke');
  assert.equal(job.company_name,'Westland Medical Centre');
  assert.equal(parseEmailAdvert(html.replace('Westland Medical Centre','Unknown Employer'),url,now),null);
  assert.equal(parseEmailAdvert(html.replace('recruitment@westmedical.co.ke','recruitment@westmedical.co.ke.evil.test'),url,now),null);
});

test("adjacent HTML metadata and bare email never merge into invalid tokens", () => {
  const html = `<article><h1>Receptionist</h1><div>Employer: Westland Medical Centre</div><div>Industry: Admin</div><div>Location: Nairobi</div><div>Country: Kenya</div><div>Deadline: 08/10/2026</div><p>${'Hospital reception, administration, patient scheduling and records. '.repeat(12)}</p><h2>How to Apply</h2><p>recruitment@westmedical.co.ke</p><h2>Job Seeker Testimonials</h2></article>`;
  const job=parseEmailAdvert(html,url,now);
  assert.equal(job.application_email,'recruitment@westmedical.co.ke');
  assert.equal(job.status,'open');
});
test("expired and conflicting deadlines cannot enter automatic matching", () => {
  assert.equal(parseEmailAdvert(page("29th September 2026"), url, now).status, "closed");
  const conflict = parseEmailAdvert(page("5th October 2026", "Deadline: 30/09/2026"), url, now);
  assert.equal(conflict.review_status, "needs_review");
  assert.equal(conflict.status, "closed");
});
test("missing deadline, footer email and missing location do not authorize sending", () => {
  assert.equal(parseEmailAdvert(page("soon"), url, now), null);
  assert.equal(parseEmailAdvert(page().replace("jobs@corporatestaffing.co.ke", "info@corporatestaffing.co.ke") + "<footer>jobs@corporatestaffing.co.ke</footer>", url, now), null);
  assert.equal(parseEmailAdvert(page().replace("Location: Nairobi Country: Kenya", ""), url, now), null);
  assert.equal(parseEmailAdvert(page().replace("Country: Kenya", "Country: Uganda"), url, now), null);
});
