const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const cache = new Map();
let rows = [], context, authorized = true, queueFails = false;
const queued = [];
class Query {
  constructor(table) { this.table = table; this.filters = []; this.operation = "read"; this.sorts = []; }
  select() { return this; }
  eq(k,v) { this.filters.push(row => (k === "input_payload->>purpose" ? row.input_payload?.purpose : row[k]) === v); return this; }
  in(k,v) { this.filters.push(row => v.includes(row[k])); return this; }
  lt(k,v) { this.filters.push(row => row[k] < v); return this; }
  lte(k,v) { this.filters.push(row => row[k] <= v); return this; }
  order(k) { this.sorts.push(k); return this; }
  limit(n) { this.count = n; return this; }
  update(value) { this.operation = "update"; this.value = value; return this; }
  run(single) {
    const table = this.table === "job_desk_tasks" ? rows : this.table === "job_desk_orders" ? [context.order] : [{ order_id: context.order.id, operation: "profile_refresh", input_payload: { purpose: "application_answer_drafts" }, input_fingerprint: context.fingerprint, status: "succeeded", output_payload: { cvId: context.cv.id, matchId: context.match.id } }];
    let result = table.filter(row => this.filters.every(filter => filter(row)));
    result.sort((a,b) => { for (const k of this.sorts) { if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1; } return 0; });
    if (this.count) result = result.slice(0,this.count);
    if (this.operation === "update") for (const row of result) { Object.assign(row, this.value); if (this.table === "job_desk_orders") row.updated_at = crypto.randomUUID(); }
    return { data: single ? result[0] ?? null : result, error: null };
  }
  maybeSingle() { return Promise.resolve(this.run(true)); }
  then(resolve,reject) { return Promise.resolve(this.run(false)).then(resolve,reject); }
}
const db = { from: table => new Query(table) };
const overrides = {
  "next/server": { NextResponse: { json: (body,init) => Response.json(body,init) }, after: () => {} },
  "@/lib/supabase/server": { getCurrentUser: async () => ({ id: "admin" }) },
  "@/lib/supabase/admin": { createSupabaseAdminClient: () => db },
  "@/lib/security": { requireAdmin: async () => ({ allowed: authorized }), checkRateLimit: () => ({ allowed: true }), logAdminAction: async () => {} },
  "@/lib/job-desk/answer-draft-service": { loadDraftContext: async () => { if (context.held) throw new Error("Context no longer eligible"); return structuredCloneExceptDb(context); } },
  "@/lib/job-desk/automation": { enqueueTask: async (...args) => { if (queueFails) throw new Error("queue outage"); queued.push(args); } },
  "@/lib/job-desk/worker": { runJobDeskWorker: async () => 0 }
};
function structuredCloneExceptDb(value) { const { db: ignored, ...rest } = value; return { ...structuredClone(rest), db }; }
function load(file) {
  file = path.resolve(file); if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file,module); mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
  const original = mod.require.bind(mod);
  mod.require = name => overrides[name] ?? (name.startsWith("@/") ? load(`src/${name.slice(2)}.ts`) : name.startsWith("./") ? load(path.resolve(path.dirname(file),`${name}.ts`)) : original(name));
  cache.set(file,mod); mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{ compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,file); return mod.exports;
}
const route = load("src/app/api/admin/job-desk/orders/[orderId]/answer-drafts/route.ts");
const { claimPrioritizedTask } = load("src/lib/job-desk/task-priority.ts");
const matchId = "11111111-1111-4111-8111-111111111111";
function reset() { authorized = true; queueFails = false; queued.length = 0; context = { db, order: { id: "order", updated_at: "initial", service_details: { retain: "original" } }, cv: { id: "cv1" }, match: { id: matchId }, fingerprint: "a".repeat(64), questions: ["Notice period"] }; }
const params = { params: Promise.resolve({ orderId: "order" }) };
function request(body, origin = "https://solvaone.co.ke") { return new Request("https://solvaone.co.ke/api/admin/job-desk/orders/order/answer-drafts", { method: "POST", headers: { Origin: origin }, body: JSON.stringify(body) }); }
async function run() {
  reset(); const input = { action: "approve", matchId, fingerprint: context.fingerprint, factual: true, answers: { "Notice period": "Immediately" } };
  assert.equal((await route.POST(request(input,"https://attacker.example"),params)).status,403);
  authorized = false; assert.equal((await route.POST(request(input),params)).status,403); authorized = true;
  assert.equal((await route.POST(request({ ...input, factual: false }),params)).status,400);
  assert.equal((await route.POST(request({ ...input, answers: { "Privacy consent": "Yes" } }),params)).status,409);
  context.fingerprint = "b".repeat(64); assert.equal((await route.POST(request(input),params)).status,409); context.fingerprint = input.fingerprint;
  const results = await Promise.all([route.POST(request(input),params),route.POST(request(input),params)]);
  assert.deepEqual(results.map(result => result.status).sort(),[200,409]);
  assert.equal(context.order.service_details.retain,"original"); assert.equal(context.order.service_details.assistedAnswers[matchId].cvId,"cv1"); assert.equal(queued[0][0],"resume_assisted");
  reset(); queueFails = true; const saved = await route.POST(request(input),params); assert.equal(saved.status,200); assert.equal((await saved.json()).queued,false); assert.ok(context.order.service_details.assistedAnswers[matchId]);
  reset(); context.held = true; assert.equal((await route.POST(request(input),params)).status,409);
  const makeTask = (id,type,time) => ({ id,task_type:type,status:"queued",attempts:0,max_attempts:3,available_at:time,created_at:time });
  rows = [makeTask("discovery","discover","2020-01-01"),makeTask("draft","draft_answers","2021-01-01"),makeTask("submit","submit","2022-01-01")];
  const claims = await Promise.all([claimPrioritizedTask(db,"worker1"),claimPrioritizedTask(db,"worker2")]);
  assert.equal(new Set(claims.map(item => item.id)).size,2); assert.ok(claims.some(item => item.id === "submit")); assert.ok(claims.some(item => item.id === "draft"));
  assert.equal((await claimPrioritizedTask(db,"worker3",true)).id,"discovery");
  rows = [{ ...makeTask("expired","submit","2020-01-01"),status:"running",attempts:3,lease_until:"2020-01-01" },makeTask("later","submit","2099-01-01")];
  assert.equal(await claimPrioritizedTask(db,"worker4"),null); assert.equal(rows[0].status,"failed");
  console.log("PASS: admin approval, factual gates, changed context, concurrent CAS, durable queue outage, ready-first selection, fairness and expired leases");
}
run().catch(error => { console.error(error); process.exitCode=1; });
