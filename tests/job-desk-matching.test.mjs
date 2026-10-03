import assert from "node:assert/strict";
import test from "node:test";
import { documentedSkillMatches, expiredDeadline, scoreVacancy, submissionHoldReason, workHistoryKeywordMatches, vacancyEligibility } from "../src/lib/job-desk/matching.ts";
import { applicationScopeHold, createApplicationScope } from "../src/lib/job-desk/application-scope.ts";

test("educator titles and teaching evidence reach review within the saved scope", () => {
  const scope = createApplicationScope({ targetRoles: "English and Literature Educator", preferredLocations: "Ruaka, Kenya", remotePreference: "remote", channel: "admin_recorded", evidence: "Client instructions", excludedEmployers: "", excludedRoles: "", excludedKeywords: "" });
  const vacancy = { title: "English Teacher", company_name: "School", description: "Lesson preparation and learner assessment", location: "Remote", workplace_type: "remote" };
  const profile = { structured_profile: { skills: ["Lesson planning", "Student assessment"] } };
  assert.equal(applicationScopeHold(scope, vacancy), null);
  assert.ok(scoreVacancy(vacancy, profile, scope).score >= 60);
  assert.equal(documentedSkillMatches("Lesson planning", vacancy.description), true);
  assert.match(applicationScopeHold(scope, { ...vacancy, title: "Software Engineer" }), /outside/);
  assert.match(vacancyEligibility({ ...vacancy, workplace_type: "onsite", location: "Ruaka, Kenya" }, { remote_preference: "remote" }), /remote work only/);
});

test("explicit Kenya remote recruiting overrides headquarters, not work restrictions", () => {
  const vacancy = { title: "English Teacher", location: "London", workplace_type: "remote", description: "Candidates based in Kenya are welcome. Lesson planning required." };
  assert.equal(vacancyEligibility(vacancy, {}), null);
  assert.match(vacancyEligibility({ ...vacancy, description: "Global company with clients in Kenya." }, {}), /restricted/);
  assert.match(vacancyEligibility({ ...vacancy, description: vacancy.description + " Applicants must be based in the UK." }, {}), /restriction/);
  assert.match(vacancyEligibility({ ...vacancy, description: vacancy.description + " Application deadline: 2025-01-10" }, {}), /deadline/);
});

test("customer success wording reaches full review without bypassing country eligibility", () => {
  const scope = createApplicationScope({ targetRoles: "Customer service", preferredLocations: "International", remotePreference: "remote", channel: "admin_recorded", evidence: "Remote customer work", excludedEmployers: "", excludedRoles: "", excludedKeywords: "" });
  const vacancy = { title: "Customer Success Specialist", company_name: "Employer", description: "Customer training and account management", location: "Worldwide", workplace_type: "remote" };
  const profile = { structured_profile: { skills: ["Account Management"], experience: [{ jobTitle: "Customer Experience Lead" }] } };
  assert.equal(applicationScopeHold(scope, vacancy), null);
  assert.ok(scoreVacancy(vacancy, profile, scope).score >= 25);
  assert.equal(scoreVacancy({ ...vacancy, location: "Remote, United States" }, profile, scope).score, 0);
  assert.match(applicationScopeHold(scope, { ...vacancy, title: "Software Engineer" }), /outside/);
});

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

test("customer service, reception and petrol station synonyms respect authorization", () => {
  const scope = createApplicationScope({ targetRoles: "Customer Service Attendant, Receptionist, Petrol Station Attendant", preferredLocations: "Kenya", remotePreference: "flexible", channel: "admin_recorded", evidence: "Client instructions", excludedEmployers: "", excludedRoles: "", excludedKeywords: "" });
  const job = { company_name: "Employer", description: "Customer enquiries and cash reconciliation", location: "Nairobi, Kenya", workplace_type: "onsite" };
  for (const title of ["Customer Care Agent", "Customer Support Representative", "Front Desk Assistant", "Fuel Station Attendant"]) {
    assert.equal(applicationScopeHold(scope, { ...job, title }), null, title);
    assert.ok(scoreVacancy({ ...job, title }, {}, scope).score >= 25, title);
  }
  assert.match(applicationScopeHold(scope, { ...job, title: "Software Support Engineer" }), /outside/);
  assert.match(applicationScopeHold({ ...scope, excludedRoles: ["Customer Care"] }, { ...job, title: "Customer Support Representative" }), /excluded/);
});

test("work-history duties count as keyword evidence without inferring software or credentials", () => {
  const profile = { target_job_titles: ["Receptionist"], structured_profile: { skills: [], experience: [{ jobTitle: "Receptionist", responsibilities: ["Coordinated appointments and handled switchboard calls", "Resolved customer complaints and supported payment reconciliation"], achievements: [] }] } };
  const advert = "Appointment scheduling, switchboard, complaint resolution, cash reconciliation. Salesforce certification desirable.";
  assert.deepEqual(workHistoryKeywordMatches(profile, advert), ["complaint resolution", "cash handling", "appointment management", "switchboard"]);
  assert.ok(scoreVacancy({ title: "Front Desk Assistant", description: advert, location: "Nairobi", workplace_type: "onsite" }, profile).reasons.some(reason => reason.includes("appointment management")));
  assert.equal(documentedSkillMatches("Switchboard", "Salesforce administration"), false);
  assert.deepEqual(workHistoryKeywordMatches({}, advert), []);
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
