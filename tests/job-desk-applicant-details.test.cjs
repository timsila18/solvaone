const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const source = fs.readFileSync(path.resolve(__dirname, "../src/lib/job-desk/applicant-details.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleInstance = new Module("job-desk-applicant-details", module);
moduleInstance.filename = path.resolve(__dirname, "../src/lib/job-desk/applicant-details.js");
moduleInstance.paths = Module._nodeModulePaths(path.dirname(moduleInstance.filename));
moduleInstance._compile(compiled, moduleInstance.filename);
const { applicantDetailsSchema, readApplicantDetails } = moduleInstance.exports;

test("old orders with no application details remain unconfirmed", () => {
  assert.equal(readApplicantDetails({}), null);
  const empty = applicantDetailsSchema.parse({});
  assert.equal(empty.kenyaWorkEligibility, "not_provided");
  assert.equal(empty.sponsorshipNeeded, "not_provided");
});

test("confirmed client answers are retained for reuse", () => {
  const answer = applicantDetailsSchema.parse({ currentCity: "Nairobi", currentCountry: "Kenya", kenyaWorkEligibility: "yes", sponsorshipNeeded: "no", noticePeriod: "30 days", applicantLinkedinUrl: "https://linkedin.com/in/example" });
  assert.equal(readApplicantDetails({ applicantDetails: answer }).noticePeriod, "30 days");
  assert.equal(answer.kenyaWorkEligibility, "yes");
});

test("unsafe links and invalid declarations are rejected", () => {
  assert.equal(applicantDetailsSchema.safeParse({ portfolioUrl: "http://example.com" }).success, false);
  assert.equal(applicantDetailsSchema.safeParse({ kenyaWorkEligibility: "assumed-from-cv" }).success, false);
});
