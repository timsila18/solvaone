const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
let state, task, ready;
const queued = [];
class Query {
  constructor(table) { this.table = table; this.filters = []; }
  select() { return this; }
  eq(key, value) { this.filters.push(row => row[key] === value); return this; }
  in(key, values) { this.filters.push(row => values.includes(row[key])); return this; }
  order() { return this; }
  limit() { return this; }
  update(value) { this.value = value; return this; }
  upsert(value, options) {
    const prior = state[this.table].find(row => row.match_id === value.match_id);
    if (!prior) state[this.table].push({ id: "application", ...value });
    else if (!options?.ignoreDuplicates) Object.assign(prior, value);
    return this;
  }
  run(single) {
    const rows = (state[this.table] ?? []).filter(row => this.filters.every(filter => filter(row)));
    if (this.value) rows.forEach(row => Object.assign(row, this.value));
    return { data: single ? rows[0] ?? null : rows, error: null };
  }
  single() { return Promise.resolve(this.run(true)); }
  maybeSingle() { return Promise.resolve(this.run(true)); }
  then(resolve, reject) { return Promise.resolve(this.run(false)).then(resolve, reject); }
}
const db = { from: table => new Query(table) };
const originalLoad = Module._load;
const originalResolve = Module._resolveFilename;
Module._load = function(request, parent, main) {
  const mocks = {
    "@/lib/supabase/admin": { createSupabaseAdminClient: () => db },
    "@/lib/security": { logSystemEvent: async () => {} },
    "@/lib/openai": { createOpenAIClient: () => { throw new Error("No live AI in this test"); } },
    "./task-priority": { claimPrioritizedTask: async () => { const next = task; task = null; return next; } },
    "./automation": { enqueueTask: async (...args) => queued.push(args), verifyVacancyStillOpen: async () => true, plainText: value => value },
    "./matching": { scoreVacancy: () => ({ score: 80 }), submissionHoldReason: () => null },
    "./submission-preflight": { submissionPreflight: async () => ({ ready, blockers: ready ? [] : ["Unsupported portal"], checkedAt: new Date().toISOString() }), canRetrySubmission: application => application?.status === "needs_human" && application.provider_response?.clicked === false },
    "./client-updates": { queueClientUpdate: async () => {} },
    "./service": { processJobDeskOrder: async () => {} }
  };
  return mocks[request] ?? originalLoad.call(this, request, parent, main);
};
Module._resolveFilename = function(id, ...args) { return originalResolve.call(this, id.startsWith("@/") ? path.resolve(__dirname, "../src", id.slice(2)) : id, ...args); };
require.extensions[".ts"] = require.extensions[".tsx"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
const { createApplicationScope } = require("../src/lib/job-desk/application-scope.ts");
const { runJobDeskWorker } = require("../src/lib/job-desk/worker.ts");
function reset(assisted) {
  queued.length = 0; ready = !assisted;
  const scope = createApplicationScope({ targetRoles: "Receptionist", preferredLocations: "Kenya", remotePreference: "flexible", channel: "admin_recorded", evidence: "Confirmed", excludedEmployers: "", excludedRoles: "", excludedKeywords: "" });
  const vacancy = { title: "Receptionist", company_name: "Test Employer", location: "Nairobi, Kenya", workplace_type: "onsite", description: "Reception and office work", status: "open", review_status: "approved", duplicate_of: null, last_seen_at: new Date().toISOString(), application_method: "portal", apply_url: "https://example.com/application" };
  state = {
    job_desk_matches: [{ id: "match", order_id: "order", status: "suggested", reasons: ["Suitability review: Documented reception experience", ...(assisted ? ["Assisted route: Unsupported portal: use the prepared admin application packet."] : [])], vacancy }],
    job_desk_orders: [{ id: "order", client_id: "client", status: "active", payment_status: "paid", amount: 1500, payment_reference: "Verified receipt", application_authorized: true, service_details: { applicationScope: scope }, client: { full_name: "Example Client", email: "client@example.com", consent_to_process: true } }],
    job_desk_documents: [{ id: "cv", order_id: "order", document_type: "revamped_cv", status: "approved", html: "Approved factual CV" }],
    job_desk_candidate_profiles: [{ client_id: "client" }],
    job_desk_ai_runs: [{ order_id: "order", operation: "match_cover_letter", status: "succeeded", output_payload: { letter: "Previously reviewed factual application letter" } }],
    job_desk_applications: [], job_desk_tasks: []
  };
  // Cache lookup is independent of the fingerprint in this focused worker control-flow fixture.
  Query.prototype.eq = function(key, value) { if (key !== "input_fingerprint") this.filters.push(row => row[key] === value); return this; };
  task = { id: "task", order_id: "order", task_type: "prepare", attempts: 1, max_attempts: 3, payload: { matchId: "match", ...(assisted ? { assisted: "true" } : {}) } };
}
test("a suitable unsupported portal produces an approved-CV packet without submitting", async () => {
  reset(true); await runJobDeskWorker({ maxTasks: 1 });
  const match = state.job_desk_matches[0];
  assert.equal(match.status, "needs_human");
  assert.ok(match.cover_letter); assert.ok(match.authorized_at);
  assert.equal(state.job_desk_applications[0].provider_response.clicked, false);
  assert.equal(state.job_desk_applications[0].provider_response.cvId, "cv");
  assert.equal(queued.some(item => item[0] === "submit"), false);
});
test("supported ready applications enter submission independently of assisted work", async () => {
  reset(false); await runJobDeskWorker({ maxTasks: 1 });
  assert.equal(state.job_desk_matches[0].status, "authorized");
  assert.ok(queued.some(item => item[0] === "submit"));
});
test("payment and existing submission evidence still protect assisted preparation", async () => {
  reset(true); state.job_desk_orders[0].payment_status = "pending"; await runJobDeskWorker({ maxTasks: 1 });
  assert.equal(state.job_desk_matches[0].cover_letter, undefined); assert.equal(queued.length, 0);
  reset(true); state.job_desk_applications.push({ match_id: "match", status: "submitted", provider_message_id: "already-sent" }); await runJobDeskWorker({ maxTasks: 1 });
  assert.equal(state.job_desk_applications[0].provider_message_id, "already-sent"); assert.equal(queued.length, 0);
});
test.after(() => { Module._load = originalLoad; Module._resolveFilename = originalResolve; });
