const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
let state;
const queued = [];
const cache = new Map();
class Query {
  constructor(table) { this.table = table; this.filters = []; }
  select() { return this; }
  eq(key, value) { this.filters.push(row => row[key] === value); return this; }
  neq(key, value) { this.filters.push(row => row[key] !== value); return this; }
  in(key, values) { this.filters.push(row => values.includes(row[key])); return this; }
  not(key, operator, value) { this.filters.push(row => row[key] !== value); return this; }
  order() { return this; }
  limit() { return this; }
  update(value) { this.value = value; return this; }
  run(single) {
    const rows = (state[this.table] ?? []).filter(row => this.filters.every(filter => filter(row)));
    if (this.value) rows.forEach(row => Object.assign(row, this.value));
    return { data: single ? rows[0] ?? null : rows, error: null };
  }
  maybeSingle() { return Promise.resolve(this.run(true)); }
  then(resolve, reject) { return Promise.resolve(this.run(false)).then(resolve, reject); }
}
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file, module);
  mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
  const original = mod.require.bind(mod);
  mod.require = name => {
    if (name === "@/lib/supabase/admin") return { createSupabaseAdminClient: () => ({ from: table => new Query(table) }) };
    if (name === "./automation") return { enqueueTask: async (...args) => queued.push(args) };
    if (name === "./client-updates") return { queueClientUpdate: async () => {} };
    return name.startsWith("./") ? load(path.resolve(path.dirname(file), `${name}.ts`)) : original(name);
  };
  cache.set(file, mod);
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
  return mod.exports;
}
const { reconcileJobDeskPipeline } = load("src/lib/job-desk/reconcile.ts");
const { recoverUnderfilledSearches, hasSubmissionEvidence } = load("src/lib/job-desk/search-recovery.ts");
const { createApplicationScope } = load("src/lib/job-desk/application-scope.ts");
const scope = createApplicationScope({ targetRoles: "HR Officer", preferredLocations: "Kenya", remotePreference: "flexible", channel: "admin_recorded", evidence: "Confirmed", excludedEmployers: "", excludedRoles: "", excludedKeywords: "" });
async function runCase(changes = {}, application = null, cvStatus = "approved") {
  queued.length = 0;
  state = {
    job_desk_matches: [{ id: "match", order_id: "order", status: "ready", authorized_at: null }],
    job_desk_applications: application ? [{ match_id: "match", order_id: "order", ...application }] : [],
    job_desk_orders: [{ id: "order", status: "active", service_type: "job_search_full", payment_status: "paid", amount: 1500, payment_reference: "Receipt", application_authorized: true, service_details: { applicationScope: scope }, ...changes }],
    job_desk_documents: [{ id: "cv", order_id: "order", document_type: "revamped_cv", status: cvStatus }]
  };
  await reconcileJobDeskPipeline();
  return queued.filter(item => item[0] === "prepare");
}
(async () => {
  assert.equal((await runCase()).length, 1);
  assert.equal((await runCase({ status: "paused" })).length, 0);
  assert.equal((await runCase({ payment_status: "pending" })).length, 0);
  assert.equal((await runCase({ application_authorized: false })).length, 0);
  assert.equal((await runCase({}, null, "review")).length, 0);
  assert.equal((await runCase({}, { status: "needs_human", provider_response: { clicked: true } })).length, 0);
  assert.equal((await runCase({}, { status: "submitted" })).length, 0);
  await runCase();
  state.job_desk_clients = [{ id: "client", consent_to_process: true }];
  state.job_desk_orders[0].client_id = "client";
  queued.length = 0;
  assert.deepEqual(await recoverUnderfilledSearches(), { checked: 1, zeroSubmissions: 1, queued: 1, held: 0 });
  assert.equal(queued[0][0], "match");
  state.job_desk_tasks = [{ id: "task", order_id: "order", task_type: "match", status: "running" }];
  assert.equal((await recoverUnderfilledSearches()).queued, 0);
  state.job_desk_tasks = [];
  state.job_desk_applications = Array.from({ length: 10 }, (_, i) => ({ order_id: "order", status: "submitted", provider_message_id: `provider-${i}`, provider_response: { delivery: { event: "email.delivered" } } }));
  assert.equal((await recoverUnderfilledSearches()).queued, 0);
  state.job_desk_applications = [{ order_id: "order", status: "submitted" }];
  assert.equal((await recoverUnderfilledSearches()).zeroSubmissions, 1);
  state.job_desk_clients[0].consent_to_process = false;
  assert.equal((await recoverUnderfilledSearches()).held, 1);
  state.job_desk_clients[0].consent_to_process = true;
  state.job_desk_documents[0].status = "review";
  assert.equal((await recoverUnderfilledSearches()).held, 1);
  state.job_desk_documents[0].status = "approved";
  state.job_desk_orders[0].payment_status = "pending";
  assert.equal((await recoverUnderfilledSearches()).held, 1);
  state.job_desk_orders[0].status = "paused";
  assert.equal((await recoverUnderfilledSearches()).checked, 0);
  assert.equal(hasSubmissionEvidence({ status: "submitted", provider_response: { confirmation: "Employer reference" } }), true);
  assert.equal(hasSubmissionEvidence({ status: "sending", provider_message_id: "provider" }), false);
  assert.equal(hasSubmissionEvidence({ status: "submitted", provider_message_id: "provider", provider_response: { delivery: { event: "email.bounced" } } }), false);
  console.log("PASS: stranded preparation recovery and payment, scope, CV, pause and uncertain-outcome guards");
  console.log("PASS: zero-submission search recovery, active-task guard, target evidence and safety holds");
})().catch(error => { console.error(error); process.exitCode = 1; });
