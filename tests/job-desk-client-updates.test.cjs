const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const queued = [];
let sent;
const originalLoad = Module._load;
const originalResolve = Module._resolveFilename;
const originalFetch = global.fetch;
const originalKey = process.env.RESEND_API_KEY;
const originalSender = process.env.JOB_DESK_FROM_EMAIL;

Module._load = function (request, parent, isMain) {
  if (request === "@/lib/supabase/admin") return { createSupabaseAdminClient: () => ({
    from: (table) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        then: (resolve) => Promise.resolve({ data: [] }).then(resolve),
        single: async () => ({ data: { client: { full_name: "Jane Candidate", email: "jane@example.com" } } }),
        maybeSingle: async () => ({ data: table === "job_desk_applications" ? { status: "submitted", method: "email", provider_message_id: "accepted-test-id" } : { vacancy: { title: "Analyst", company_name: "Example Ltd" } } })
      };
      return query;
    }
  }) };
  if (request === "./automation") return { enqueueTask: async (...args) => { queued.push(args); return "task-id"; } };
  return originalLoad.call(this, request, parent, isMain);
};
Module._resolveFilename = function (id, ...rest) {
  return originalResolve.call(this, id.startsWith("@/") ? path.resolve(__dirname, "../src", id.slice(2)) : id, ...rest);
};
require.extensions[".ts"] = function (module, filename) {
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  module._compile(code, filename);
};

const { clientUpdateContent, queueClientUpdate, sendClientUpdate } = require("../src/lib/job-desk/client-updates.ts");

test("client updates are addressed to the supplied email and use the configured sender", async () => {
  process.env.RESEND_API_KEY = "test-only";
  process.env.JOB_DESK_FROM_EMAIL = "SolvaOne Job Desk <apply@solvaone.co.ke>";
  global.fetch = async (_url, options) => { sent = options; return { ok: true, json: async () => ({ id: "email-123" }) }; };
  const result = await sendClientUpdate("order-1", "application_submitted", "match-1");
  const body = JSON.parse(sent.body);
  assert.deepEqual(body.to, ["jane@example.com"]);
  assert.equal(body.from, "SolvaOne Job Desk <apply@solvaone.co.ke>");
  assert.match(body.subject, /Analyst/);
  assert.match(body.text, /Analyst at Example Ltd/);
  assert.match(body.text, /does not confirm/);
  assert.equal(sent.headers["Idempotency-Key"], "job-desk-update-application_submitted-match-1");
  assert.equal(result.providerMessageId, "email-123");
});

test("one event and reference maps to one durable queue key", async () => {
  await queueClientUpdate("order-1", "cv_approved", "cv-1");
  assert.deepEqual(queued[0], ["notify_client", "client-update:cv_approved:cv-1", "order-1", { event: "cv_approved", reference: "cv-1" }]);
});

test("a paused application is never described as submitted", () => {
  const copy = clientUpdateContent("application_needs_action", "Jane Candidate", "Analyst", "Example Ltd");
  assert.match(copy.text, /could not be completed automatically/);
  assert.match(copy.text, /will not claim it was submitted/);
});

test.after(() => {
  global.fetch = originalFetch;
  Module._load = originalLoad;
  Module._resolveFilename = originalResolve;
  if (originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey;
  if (originalSender === undefined) delete process.env.JOB_DESK_FROM_EMAIL; else process.env.JOB_DESK_FROM_EMAIL = originalSender;
});
