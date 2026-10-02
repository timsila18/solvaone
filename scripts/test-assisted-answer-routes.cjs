const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const cache = new Map();
let state;
const queued = [];
const id = "11111111-1111-4111-8111-111111111111";
class Query {
  constructor(table) { this.table = table; this.filters = []; this.operation = "read"; }
  select() { return this; }
  eq(key, value) { this.filters.push(row => row[key] === value); return this; }
  is(key, value) { return this.eq(key, value); }
  gt(key, value) { this.filters.push(row => row[key] > value); return this; }
  order() { return this; }
  limit() { return this; }
  update(value) { this.operation = "update"; this.value = value; return this; }
  insert(value) { this.operation = "insert"; this.value = value; return this; }
  run(single) {
    const table = state[this.table];
    if (this.operation === "insert") table.push({ id: "batch-1", consumed_at: null, ...this.value });
    const rows = table.filter(row => this.filters.every(filter => filter(row)));
    if (this.operation === "update") for (const row of rows) Object.assign(row, this.value);
    return { data: single ? rows[0] ?? null : rows, error: null };
  }
  maybeSingle() { return Promise.resolve(this.run(true)); }
  single() { return this.maybeSingle(); }
  then(resolve, reject) { return Promise.resolve(this.run(false)).then(resolve, reject); }
}
const db = { from: table => new Query(table) };
const overrides = {
  "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) }, after: () => {} },
  "@/lib/supabase/admin": { createSupabaseAdminClient: () => db },
  "@/lib/supabase/server": { getCurrentUser: async () => ({ id: "admin" }) },
  "@/lib/security": { requireAdmin: async () => ({ allowed: true }), checkRateLimit: () => ({ allowed: true }), logAdminAction: async () => {}, logSystemEvent: async () => {}, clientIpFromHeaders: () => "test-ip" },
  "@/lib/job-desk/automation": { enqueueTask: async (...args) => queued.push(args) },
  "@/lib/job-desk/worker": { runJobDeskWorker: async () => 0 },
  "@/lib/job-desk/batch-authorization": { batchVacancyIsCurrent: vacancy => vacancy?.status === "open" }
};
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file, module); mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
  const original = mod.require.bind(mod);
  mod.require = name => overrides[name] ?? (name.startsWith("@/") ? load(`src/${name.slice(2)}.ts`) : name.startsWith("./") ? load(path.resolve(path.dirname(file), `${name}.ts`)) : original(name));
  cache.set(file, mod);
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
  return mod.exports;
}
const admin = load("src/app/api/admin/job-desk/orders/[orderId]/answer-link/route.ts");
const client = load("src/app/api/job-desk/answers/route.ts");
const { loadAnswerRequest } = load("src/lib/job-desk/answer-request.ts");
function reset() {
  queued.length = 0;
  state = {
    job_desk_orders: [{ id, service_type: "job_search_full", status: "active", payment_status: "paid", amount: 1500, payment_reference: "real-reference", application_authorized: true, service_details: { retained: "Keep this", applicationScope: { targetRoles: ["HR Officer"] } }, updated_at: "2026-10-01", client: { full_name: "Test applicant", consent_to_process: true } }],
    job_desk_documents: [{ id: "cv-1", order_id: id, document_type: "revamped_cv", status: "approved" }],
    job_desk_matches: [{ id: "match-1", order_id: id, status: "needs_human", reasons: ["Suitability review: verified"], vacancy: { status: "open", title: "HR Officer", company_name: "Test employer", apply_url: "https://example.com/job" }, application: { status: "needs_human", provider_response: { clicked: false, preflight: { blockers: ["Notice period", "Employer privacy consent"] } } } }],
    job_desk_authorization_batches: []
  };
}
function request(url, body, origin = "https://solvaone.co.ke") { return new Request(`https://solvaone.co.ke${url}`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
async function create() {
  const response = await admin.POST(request("/api/admin/job-desk/orders/test/answer-link", { action: "create" }), { params: Promise.resolve({ orderId: id }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  return result.url.split("/").at(-1);
}
async function run() {
  reset(); let token = await create();
  assert.equal(state.job_desk_authorization_batches[0].token_hash.includes(token), false);
  const loaded = await loadAnswerRequest(token); assert.ok(loaded);
  assert.equal(loaded.snapshot.questions.length, 2);
  const question = loaded.snapshot.questions.find(question => !question.officialStep);
  const payload = { token, answers: { [question.id]: "Immediately" }, factual: true };
  let response = await client.POST(request("/api/job-desk/answers", payload, "https://attacker.example")); assert.equal(response.status, 403);
  response = await client.POST(request("/api/job-desk/answers", { ...payload, answers: { unknown: "Yes" } })); assert.equal(response.status, 400);
  response = await client.POST(request("/api/job-desk/answers", { ...payload, answers: { [loaded.snapshot.questions.find(question => question.officialStep).id]: "Yes" } })); assert.equal(response.status, 400);
  const concurrent = await Promise.all([client.POST(request("/api/job-desk/answers", payload)), client.POST(request("/api/job-desk/answers", payload))]);
  assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
  assert.equal(queued.length, 1); assert.equal(queued[0][0], "resume_assisted");
  assert.equal(state.job_desk_orders[0].service_details.retained, "Keep this");
  assert.equal(state.job_desk_orders[0].service_details.assistedAnswers["match-1"].cvId, "cv-1");
  assert.equal(await loadAnswerRequest(token), null);
  reset(); token = await create(); state.job_desk_authorization_batches[0].expires_at = "2000-01-01"; assert.equal(await loadAnswerRequest(token), null);
  reset(); token = await create(); state.job_desk_documents[0].id = "cv-new"; assert.equal(await loadAnswerRequest(token), null);
  reset(); token = await create(); state.job_desk_orders[0].application_authorized = false; assert.equal(await loadAnswerRequest(token), null);
  reset(); token = await create(); await admin.POST(request("/api/admin/job-desk/orders/test/answer-link", { action: "revoke" }), { params: Promise.resolve({ orderId: id }) }); assert.equal(await loadAnswerRequest(token), null);
  reset(); state.job_desk_orders[0].payment_status = "pending"; response = await admin.POST(request("/api/admin/job-desk/orders/test/answer-link", { action: "create" }), { params: Promise.resolve({ orderId: id }) }); assert.equal(response.status, 409);
  reset(); state.job_desk_matches[0].application.provider_response.clicked = true; response = await admin.POST(request("/api/admin/job-desk/orders/test/answer-link", { action: "create" }), { params: Promise.resolve({ orderId: id }) }); assert.equal(response.status, 409);
  console.log("Answer-link route tests passed: purpose-bound tokens, origin, factual fields, concurrent single-use, preserved details, queue, expiry, CV change, revoked scope/link, unpaid and uncertain submissions. No emails or applications sent.");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
