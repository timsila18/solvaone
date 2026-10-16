const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, "..", relative);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  instance.require = id => Object.hasOwn(mocks, id) ? mocks[id] : require(id);
  instance._compile(source, filename);
  return instance.exports;
}

test("Job Desk requires explicit automatic opt-in and recognizes quota failures", () => {
  const policy = load("src/lib/job-desk/ai-policy.ts");
  const previous = process.env.JOB_DESK_AI_MODE;
  try {
    delete process.env.JOB_DESK_AI_MODE;
    assert.equal(policy.jobDeskAiEnabled(), false);
    process.env.JOB_DESK_AI_MODE = "manual";
    assert.equal(policy.jobDeskAiEnabled(), false);
    process.env.JOB_DESK_AI_MODE = "automatic";
    assert.equal(policy.jobDeskAiEnabled(), true);
    assert.equal(policy.isAiQuotaError(new Error("429 You have no credits remaining")), true);
    assert.equal(policy.isAiQuotaError(new Error("invalid CV")), false);
    assert.equal(policy.AI_DEPENDENT_TASKS.has("submit"), false);
    assert.equal(policy.AI_DEPENDENT_TASKS.has("prepare"), true);
  } finally {
    if (previous === undefined) delete process.env.JOB_DESK_AI_MODE;
    else process.env.JOB_DESK_AI_MODE = previous;
  }
});

function routeFixture({ admin = true, paid = true, approved = false } = {}) {
  const writes = [];
  const order = { id: "order", client_id: "client", service_type: "job_search_full", payment_status: paid ? "paid" : "pending", amount: 1500, payment_reference: "receipt", client: { full_name: "Test Candidate", email: "test@example.com", whatsapp_phone: "+254700000000", consent_to_process: true } };
  const db = { from(table) {
    let mutation;
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
      insert(data) { mutation = data; writes.push({ table, data }); return query; },
      upsert(data) { writes.push({ table, data }); return query; },
      update(data) { writes.push({ table, data }); return query; },
      async single() { return { data: table === "job_desk_orders" ? order : { id: "document" }, error: null }; },
      async maybeSingle() { return { data: table === "job_desk_documents" ? (approved ? { status: "approved", version: 1 } : null) : { structured_profile: {} }, error: null }; },
      then(resolve, reject) { return Promise.resolve({ data: mutation, error: null }).then(resolve, reject); }
    };
    return query;
  } };
  const route = load("src/app/api/admin/job-desk/orders/[orderId]/manual-cv/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/security": { requireAdmin: async () => ({ allowed: admin }), logAdminAction: async () => {} },
    "@/lib/supabase/server": { getCurrentUser: async () => ({ id: "admin" }) },
    "@/lib/supabase/admin": { createSupabaseAdminClient: () => db },
    "@/lib/solva-intelligence/types": load("src/lib/solva-intelligence/types.ts"),
    "@/lib/solva-intelligence/safety": { sectionsToHtml: sections => sections.map(s => s.html).join("") },
    "@/lib/job-desk/payment": load("src/lib/job-desk/payment.ts"),
    "@/lib/database-text": load("src/lib/database-text.ts"),
    "@/lib/job-desk/types": { candidateProfileSchema: require("zod").z.object({}).passthrough() }
  });
  const input = { summary: "Verified administration and support experience.", skills: "Customer service and records management", experience: "Maintained accurate records for a clinic.", education: "Diploma in administration and office management", checked: true };
  return { writes, run: (data = input) => route.POST(new Request("http://localhost/manual-cv", { method: "POST", body: JSON.stringify(data) }), { params: Promise.resolve({ orderId: "order" }) }), input };
}

test("manual CV requires admin access, payment and factual confirmation", async () => {
  for (const [options, status] of [[{ admin: false }, 403], [{ paid: false }, 409], [{ approved: true }, 409]]) {
    const fixture = routeFixture(options);
    assert.equal((await fixture.run()).status, status);
    assert.equal(fixture.writes.length, 0);
  }
  const fixture = routeFixture();
  assert.equal((await fixture.run({ ...fixture.input, checked: false })).status, 400);
  assert.equal(fixture.writes.length, 0);
});

test("manual CV saves escaped review content without an AI run or approval", async () => {
  const fixture = routeFixture();
  assert.equal((await fixture.run({ ...fixture.input, summary: 'Verified experience <script>alert("x")</script>' })).status, 200);
  const document = fixture.writes.find(w => w.table === "job_desk_documents").data;
  assert.equal(document.status, "review");
  assert.equal(document.ai_run_id, undefined);
  assert.equal(document.structured_content.sections.length, 4);
  assert.equal(document.html.includes("<script>"), false);
  assert.ok(document.html.includes("&lt;script&gt;"));
  assert.equal(fixture.writes.some(w => w.table === "job_desk_ai_runs"), false);
  assert.equal(fixture.writes.find(w => w.table === "job_desk_orders").data.status, "cv_review");
});

test("manual CV keeps additional qualifications and referee details when supplied", async () => {
  const fixture = routeFixture();
  const additional = "Languages: English and Kiswahili. Referees available upon request.";
  assert.equal((await fixture.run({ ...fixture.input, additional })).status, 200);
  const document = fixture.writes.find(w => w.table === "job_desk_documents").data;
  assert.equal(document.structured_content.sections.length, 5);
  assert.ok(document.html.includes(additional));
});
