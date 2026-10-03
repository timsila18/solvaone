const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const source = fs.readFileSync(path.resolve(__dirname, "../src/lib/job-desk/application-scope.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleInstance = new Module("job-desk-application-scope", module);
const requireOriginal = moduleInstance.require.bind(moduleInstance);
moduleInstance.require = id => {
  if (id !== "./role-language") return requireOriginal(id);
  const helper = new Module("role-language", module);
  helper._compile(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "../src/lib/job-desk/role-language.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, "role-language.js");
  return helper.exports;
};
moduleInstance._compile(compiled, "job-desk-application-scope.js");
const { createApplicationScope, readApplicationScope, applicationScopeHold } = moduleInstance.exports;

function scope(overrides = {}) {
  return createApplicationScope({ targetRoles: "English Teacher, Literature Educator", preferredLocations: "Nairobi", remotePreference: "flexible", excludedEmployers: "Acme School", excludedRoles: "Principal", excludedKeywords: "unpaid internship", channel: "website", evidence: "Client checked the intake box", ...overrides });
}

const vacancy = { title: "English Teacher", company_name: "Good School", location: "Nairobi, Kenya", workplace_type: "onsite", description: "Teach English to secondary school learners." };

test("stores an immutable-looking scope snapshot with authorization evidence", () => {
  const value = scope();
  assert.equal(readApplicationScope({ applicationScope: value }).targetRoles[0], "English Teacher");
  assert.ok(value.authorizedAt);
  assert.equal(value.channel, "website");
});

test("does not interpret old orders or malformed scope as automatic authorization", () => {
  assert.equal(readApplicationScope({}), null);
  assert.equal(readApplicationScope({ applicationScope: { targetRoles: ["Teacher"] } }), null);
  assert.equal(readApplicationScope({ applicationScope: { ...scope(), excludedEmployers: [""] } }), null);
});

test("allows only a vacancy inside role and location scope", () => {
  assert.equal(applicationScopeHold(scope(), vacancy), null);
  assert.match(applicationScopeHold(scope(), { ...vacancy, title: "Accountant" }), /target roles/);
  assert.match(applicationScopeHold(scope({ targetRoles: "Business Development Manager" }), { ...vacancy, title: "Business Analyst" }), /target roles/);
  assert.match(applicationScopeHold(scope(), { ...vacancy, location: "Mombasa, Kenya" }), /locations/);
});

test("honors employer, role and keyword exclusions", () => {
  assert.match(applicationScopeHold(scope(), { ...vacancy, company_name: "Acme School" }), /Employer/);
  assert.match(applicationScopeHold(scope(), { ...vacancy, title: "English Principal" }), /Role is excluded/);
  assert.match(applicationScopeHold(scope(), { ...vacancy, description: "This is an unpaid internship." }), /exclusion/);
});

test("remote-only permission never authorizes an on-site role", () => {
  assert.match(applicationScopeHold(scope({ remotePreference: "remote" }), vacancy), /remote/);
  assert.match(applicationScopeHold(scope({ remotePreference: "onsite" }), { ...vacancy, workplace_type: "hybrid" }), /onsite/);
});
