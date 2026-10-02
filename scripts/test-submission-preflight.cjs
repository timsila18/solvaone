const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const original = mod.require.bind(mod);
  mod.require = id => id.startsWith("./") ? load(path.resolve(path.dirname(file), `${id}.ts`)) : original(id);
  cache.set(file, mod);
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
  return mod.exports;
}
const { missingPortalRequirements, canRetrySubmission, applicationOutcome, submissionPreflight } = load("src/lib/job-desk/submission-preflight.ts");
const { buildApplicantKnown } = load("src/lib/job-desk/applicant-known.ts");
const cvFacts = buildApplicantKnown({ full_name: "Test Candidate", email: "test@example.com" }, { currentCity: "Nairobi", currentCountry: "Kenya", noticePeriod: "Immediately" }, "<h2>Professional Summary</h2><p>Payroll professional.</p><h2>Education</h2><p>Bachelor in progress.</p><h2>Referees</h2><p>Private referee.</p>");
assert.equal(cvFacts.education_history, "Bachelor in progress.");
assert.equal(cvFacts.professional_summary, "Payroll professional.");
const common = label => ({ label, required: true, fields: [{ name: "custom", type: "input_text" }] });
assert.deepEqual(missingPortalRequirements([common("Where are you currently based?"), common("What is your notice period?"), common("Educational background")], "", cvFacts), []);
assert.deepEqual(missingPortalRequirements([common("When can you start?")], "Notice period = Two weeks", cvFacts), []);
assert.deepEqual(missingPortalRequirements([common("When can you start?")], "Notice period = Two weeks\nAvailability to start = Immediately", {}), ["When can you start?"]);
for (const label of ["Passport country", "Gender", "Highest completed qualification", "Why do you want to join us?", "Describe a situation", "Are you a former employee?"]) assert.deepEqual(missingPortalRequirements([common(label)], "", cvFacts), [label]);
const questions = [
  { label: "First Name", required: true, fields: [{ name: "first_name", type: "input_text" }] },
  { label: "Resume", required: true, fields: [{ name: "resume", type: "input_file" }] },
  { label: "Former employee?*", required: true, fields: [{ name: "q1", type: "multi_value_single_select", values: [{ label: "Yes", value: 1 }, { label: "No", value: 0 }] }] },
  { label: "Certificates", required: true, fields: [{ name: "q2", type: "input_file" }] }
];
assert.deepEqual(missingPortalRequirements(questions, "Former employee? = No", { first_name: "Test" }), ["Certificates"]);
assert.deepEqual(missingPortalRequirements(questions, "Former employee? = Maybe", { first_name: "Test" }), ["Former employee?*", "Certificates"]);
assert.equal(canRetrySubmission({ status: "needs_human", provider_response: { clicked: false } }), true);
for (const application of [null, { status: "submitted", provider_response: { clicked: false } }, { status: "needs_human", provider_response: { clicked: true } }, { status: "needs_human" }]) assert.equal(canRetrySubmission(application), false);
assert.equal(applicationOutcome({ status: "submitted", provider_response: { confirmation: "Received" } }), "Confirmed submitted");
assert.match(applicationOutcome({ status: "submitted", provider_message_id: "email-1" }), /not confirmed/);
assert.equal(applicationOutcome({ status: "submitted" }), "Awaiting submission evidence");
async function run() {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ questions }) });
  try {
    const result = await submissionPreflight({ method: "portal", provider: "greenhouse", siteToken: "example", url: "https://job-boards.greenhouse.io/example/jobs/123", answers: "Former employee? = No", known: { first_name: "Test" } });
    assert.equal(result.ready, false);
    assert.deepEqual(result.blockers, ["Certificates"]);
    global.fetch = async () => ({ ok: true, json: async () => ({ questions: [common("What is your notice period?"), { ...common("Professional summary"), fields: [{ name: "summary", type: "input_text" }] }] }) });
    const automatic = await submissionPreflight({ method: "portal", provider: "greenhouse", siteToken: "example", url: "https://job-boards.greenhouse.io/example/jobs/123", answers: "Notice period = Two weeks", known: cvFacts });
    assert.equal(automatic.ready, true);
    assert.equal(automatic.fieldAnswers.custom, "Two weeks");
    assert.equal(automatic.fieldAnswers.summary, "Payroll professional.");
    const unsupported = await submissionPreflight({ method: "portal", provider: "lever", url: "https://example.com", answers: "", known: {} });
    assert.equal(unsupported.ready, false);
    global.fetch = async () => ({ ok: false, status: 404 });
    await assert.rejects(submissionPreflight({ method: "portal", provider: "greenhouse", siteToken: "example", url: "https://job-boards.greenhouse.io/example/jobs/123", answers: "", known: {} }), /404/);
    // Parse the embedded browser program as well, without executing or submitting it.
    const source = fs.readFileSync("src/lib/job-desk/portal-browser.ts", "utf8");
    const runner = source.match(/const runner = String.raw`([\s\S]*?)`;/)[1];
    new (require("node:vm").Script)(runner);
    console.log("Submission preflight, outcome, retry and browser syntax tests passed. No applications sent.");
  } finally { global.fetch = originalFetch; }
  if (process.argv.includes("--live")) {
    for (const jobId of ["8074181", "8088074"]) {
      const result = await submissionPreflight({ method: "portal", provider: "greenhouse", siteToken: "oafkenya", url: `https://job-boards.greenhouse.io/oafkenya/jobs/${jobId}`, answers: "", known: { first_name: "Test", last_name: "Candidate", email: "test@example.com", phone: "test" } });
      assert.equal(result.ready, false);
      assert.ok(result.blockers.length > 0);
      console.log(`Official job ${jobId}: ${result.blockers.length} missing requirements correctly detected. Read-only; no client data sent.`);
    }
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
