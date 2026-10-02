import assert from "node:assert/strict";
import test from "node:test";
import { documentedSkillMatches, expiredDeadline, scoreVacancy, submissionHoldReason } from "../src/lib/job-desk/matching.ts";
import { applicationScopeHold, createApplicationScope } from "../src/lib/job-desk/application-scope.ts";

test("equivalent role names pass both scope and ranking without authorizing other careers", () => {
  const scope = createApplicationScope({ targetRoles: "HR Officer, Admin Officer", preferredLocations: "Kenya", remotePreference: "flexible", channel: "admin_recorded", evidence: "Client instructions", excludedEmployers: "", excludedRoles: "", excludedKeywords: "" });
  const vacancy = { title: "Human Resources Officer", company_name: "Employer", description: "Payroll administration and recruitment", location: "Nairobi, Kenya", workplace_type: "onsite" };
  assert.equal(applicationScopeHold(scope, vacancy), null);
  assert.ok(scoreVacancy(vacancy, { structured_profile: { skills: ["Payroll processing"] } }, scope).score >= 25);
  assert.equal(applicationScopeHold(scope, { ...vacancy, title: "Administrative Officer" }), null);
  assert.match(applicationScopeHold(scope, { ...vacancy, title: "Aircraft Engineer" }), /outside/);
  assert.match(applicationScopeHold(scope, { ...vacancy, location: "Lagos, Nigeria" }), /Location/);
});

test("equivalent documented skills widen matching without inventing specialist skills", () => {
  assert.equal(documentedSkillMatches("Payroll processing", "Responsible for payroll administration"), true);
  assert.equal(documentedSkillMatches("Recruitment", "Support talent acquisition"), true);
  assert.equal(documentedSkillMatches("Microsoft Excel", "Reporting using MS Excel"), true);
  assert.equal(documentedSkillMatches("Office administration", "Requires NetSuite administration"), false);
  assert.equal(documentedSkillMatches("Payroll", "Requires Python engineering"), false);
});

test("updated authorization replaces stale intake roles and locations for ranking", () => {
  const profile = { target_job_titles: ["Marketing Officer"], preferred_locations: ["Nairobi"], structured_profile: { skills: ["Payroll"] } };
  const vacancy = { title: "Payroll Officer", description: "Payroll processing", location: "Kisumu, Kenya", workplace_type: "onsite" };
  assert.equal(scoreVacancy(vacancy, profile).score, 0);
  assert.ok(scoreVacancy(vacancy, profile, { targetRoles: ["Payroll Officer"], preferredLocations: ["Kenya"], remotePreference: "flexible" }).score >= 25);
  assert.equal(scoreVacancy({ ...vacancy, description: "Application deadline: 2025-01-10" }, profile, { targetRoles: ["Payroll Officer"], preferredLocations: ["Kenya"] }).score, 0);
});

test("remote role with matching skills ranks ahead of unrelated onsite role", () => {
  const profile = { target_job_titles: ["Data Engineer"], preferred_locations: ["Nairobi"], remote_preference: "remote", structured_profile: { skills: ["Python", "SQL", "Kafka"] } };
  const strong = scoreVacancy({ title: "Senior Data Engineer", description: "Build Python, SQL and Kafka pipelines", location: "Remote", workplace_type: "remote" }, profile);
  const weak = scoreVacancy({ title: "Retail Cashier", description: "In-store checkout", location: "Mombasa", workplace_type: "onsite" }, profile);
  assert.ok(strong.score >= 60);
  assert.ok(weak.score < 40);
  assert.ok(strong.score > weak.score);
});

test("missing target role is visible as a gap", () => {
  const result = scoreVacancy({ title: "Accountant", description: "Bookkeeping", location: "Nairobi", workplace_type: "onsite" }, {});
  assert.ok(result.gaps.some((gap) => gap.includes("target role")));
  assert.equal(result.score, 0);
});

test("assessment and identity requests pause automated submission", () => {
  assert.match(submissionHoldReason("Complete the application form and aptitude test", "candidate@example.com", 1200), /assessment/);
  assert.match(submissionHoldReason("Send CV and passport copy", "candidate@example.com", 1200), /identity/);
  assert.equal(submissionHoldReason("Email CV to apply", "candidate@example.com", 1200), null);
  assert.match(submissionHoldReason("Email CV to apply", null, 1200), /email/);
});

test("Kenya candidate does not receive geographically restricted remote jobs", () => {
  const profile = { target_job_titles: ["Data Engineer"], remote_preference: "remote", structured_profile: { skills: ["Python", "SQL"] } };
  const job = { title: "Data Engineer", description: "Python and SQL", workplace_type: "remote" };
  assert.equal(scoreVacancy({ ...job, location: "Remote - United States" }, profile).score, 0);
  assert.equal(scoreVacancy({ ...job, location: "South Africa - JHB" }, profile).score, 0);
  assert.equal(scoreVacancy({ ...job, location: "Remote", description: "Applicants must be authorized to work in the US. Python and SQL." }, profile).score, 0);
  assert.ok(scoreVacancy({ ...job, location: "Africa Remote" }, profile).score > 0);
});

test("expired deadline and irrelevant qualifications are screened before AI review", () => {
  const profile = { target_job_titles: ["Accountant"], structured_profile: { skills: ["Bookkeeping"] } };
  assert.equal(expiredDeadline("Application deadline: 2025-01-10", new Date("2026-09-30")), true);
  assert.equal(expiredDeadline("Kindly make your application by 11th August 2026", new Date("2026-10-02")), true);
  assert.equal(scoreVacancy({ title: "Accountant", description: "Application deadline: 2025-01-10", location: "Nairobi", workplace_type: "onsite" }, profile).score, 0);
  assert.equal(scoreVacancy({ title: "Aircraft Engineer", description: "Maintain aircraft", location: "Nairobi", workplace_type: "onsite" }, profile).score, 0);
});
