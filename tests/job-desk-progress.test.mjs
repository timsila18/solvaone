import assert from "node:assert/strict";
import test from "node:test";
import { applicationProgress, blockerAction, deliveryStage, successfulDelivery, reportEvidence } from "../src/lib/job-desk/application-progress.ts";
import { buildApplicationReport } from "../src/lib/job-desk/application-report.ts";
import { compareClientTasks } from "../src/lib/job-desk/task-priority.ts";
import { careerCatalogueUrls, isCareerCatalogueUrl } from "../src/lib/job-desk/career-discovery.ts";

const delivered = { status: "submitted", method: "email", provider_message_id: "email-1", provider_response: { delivery: { event: "email.delivered", at: "2026-10-03T09:00:00Z" } } };
const accepted = { status: "submitted", method: "email", provider_message_id: "email-2" };
const confirmed = { status: "submitted", method: "portal", provider_response: { confirmation: "Employer reference 123" } };
test("provider acceptance, preparation and blocked attempts never count as successful delivery", () => {
  assert.equal(successfulDelivery(accepted), false);
  assert.equal(successfulDelivery(delivered), true);
  assert.equal(successfulDelivery(confirmed), true);
  assert.equal(deliveryStage({ ...delivered, status: "sending" }), "processing");
  assert.equal(successfulDelivery({ ...delivered, provider_response: { delivery: { event: "email.bounced" } } }), false);
  assert.equal(successfulDelivery({ status: "submitted", method: "email", provider_response: { confirmation: "I sent it" } }), false);
  assert.equal(reportEvidence(null, "2026-10-03T09:00:00Z").status, "Prepared or shortlisted; not submitted");
});
test("one progress summary deduplicates openings and separates email from portal outcomes", () => {
  const result = applicationProgress([
    { id: "one", vacancy_id: "vacancy1", status: "submitted", application: delivered },
    { id: "duplicate", vacancy_id: "vacancy1", status: "submitted", application: delivered },
    { id: "two", status: "submitted", application: confirmed },
    { id: "three", status: "submitted", application: accepted },
    { id: "four", status: "ready", cover_letter: "A real letter" },
    { id: "five", status: "needs_human", cover_letter: "Prepared but not sent" },
    { id: "six", status: "preparing" },
    { id: "rejected", status: "rejected" }
  ], [{ id: "vacancy1" }, { id: "backup" }]);
  assert.deepEqual(result, { suitable: 7, ready: 1, delivered: 1, confirmed: 1, blocked: 1, accepted: 1, processing: 1 });
});
test("first delivery clients outrank top-ups while ready work and fairness ordering remain", () => {
  const task = (id, type, assisted = false) => ({ order_id: id, task_type: type, available_at: "2020-01-01", created_at: "2020-01-01", payload: assisted ? { assisted: "true" } : {} });
  const counts = new Map([["already", 3]]);
  assert.ok(compareClientTasks(task("first", "match"), task("already", "submit"), counts) < 0);
  assert.ok(compareClientTasks(task("first", "submit"), task("first", "match"), counts) < 0);
  assert.ok(compareClientTasks(task("first", "prepare"), task("first", "prepare", true), counts) < 0);
});
test("Kenyan discovery selects career categories from target roles and real work history", () => {
  const urls = careerCatalogueUrls([{ target_job_titles: ["Receptionist", "Retail Assistant"] }, { target_job_titles: ["Payroll Officer", "Sales Supervisor"] }, { target_job_titles: [], structured_profile: { experience: [{ jobTitle: "English Teacher" }] } }]);
  for (const path of ["customer-service", "administration", "hr-jobs", "sales-marketing", "teaching"]) assert.ok(urls.some(url => url.includes(path)));
  assert.equal(isCareerCatalogueUrl("https://www.corporatestaffing.co.ke.evil.test/category/hr-jobs-in-kenya/"), false);
  assert.equal(isCareerCatalogueUrl(urls[0] + "?redirect=evil"), false);
});
test("client reports use real timestamps and evidence without upgrading prepared applications", () => {
  const report = buildApplicationReport([
    { id: "1", status: "submitted", submitted_at: "2026-10-03T08:59:00Z", application: delivered, vacancy: { title: "Receptionist", company_name: "Example Employer" } },
    { id: "2", status: "needs_human", application: { status: "needs_human", error_message: "Unsupported portal" }, vacancy: { title: "Admin Assistant", company_name: "Example Employer" } },
    { id: "3", status: "submitted", application: accepted }
  ]);
  assert.match(report, /Receptionist/);
  assert.match(report, /3 Oct 2026, 11:59 EAT/);
  assert.match(report, /Email provider accepted; delivery not confirmed/);
  assert.match(report, /Blocked; not confirmed submitted/);
  assert.match(report, /Next action: Unsupported portal/);
  assert.match(blockerAction("Preflight: Unanswered required question").action, /saved answers/);
  assert.match(blockerAction("Could not send update \(403\)").action, /verified sender/);
});
