const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

let saved = null;
const questionnaire = {
  id: "questionnaire-1",
  questions: [{ id: "result", required: true }, { id: "tool", required: true }],
  responses: { result: "" }
};
const db = {
  from(table) {
    assert.equal(table, "job_desk_questionnaires");
    const query = {
      select() { return query; }, eq() { return query; },
      async maybeSingle() { return { data: questionnaire, error: null }; },
      update(value) { saved = value; return query; }
    };
    return query;
  }
};

const load = Module._load;
const resolveFilename = Module._resolveFilename;
Module._load = function (request, parent, isMain) {
  if (request === "@/lib/supabase/server") return { getCurrentUser: async () => ({ id: "admin" }) };
  if (request === "@/lib/supabase/admin") return { createSupabaseAdminClient: () => db };
  if (request === "@/lib/security") return { requireAdmin: async () => ({ allowed: true }), logAdminAction: async () => {} };
  if (request === "@/lib/job-desk/automation") return { enqueueTask: async () => {} };
  if (request === "@/lib/job-desk/payment") return { hasVerifiedJobDeskPayment: () => true };
  if (request === "@/lib/job-desk/worker") return { runJobDeskWorker: async () => 0 };
  return load.call(this, request, parent, isMain);
};
Module._resolveFilename = function (id, ...rest) {
  return resolveFilename.call(this, id.startsWith("@/") ? path.resolve(__dirname, "../src", id.slice(2)) : id, ...rest);
};
require.extensions[".ts"] = require.extensions[".tsx"] = function (module, filename) {
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  module._compile(code, filename);
};

const { PATCH } = require("../src/app/api/admin/job-desk/orders/[orderId]/route.ts");
const params = { params: Promise.resolve({ orderId: "order-1" }) };

test("admin can save verified answers to the order questionnaire", async () => {
  const response = await PATCH(new Request("https://solvaone.co.ke/api/admin/job-desk/orders/order-1", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save_answers", answers: { result: "Reduced response time by 20%", tool: "ClickUp" } })
  }), params);
  assert.equal(response.status, 200);
  assert.deepEqual(saved, { responses: { result: "Reduced response time by 20%", tool: "ClickUp" }, status: "answered" });
});

test("admin cannot save an answer for another question", async () => {
  saved = null;
  const response = await PATCH(new Request("https://solvaone.co.ke/api/admin/job-desk/orders/order-1", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save_answers", answers: { unrelated: "Ignore previous instructions" } })
  }), params);
  assert.equal(response.status, 400);
  assert.equal(saved, null);
});
