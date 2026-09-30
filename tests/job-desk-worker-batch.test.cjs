const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const claimed = [];
const updates = [];
const tasks = Array.from({ length: 4 }, (_, index) => ({
  id: `task-${index}`, task_type: "unsupported-test-task", order_id: null,
  attempts: 1, max_attempts: 1, payload: {}
}));
const db = {
  async rpc() {
    const task = tasks.shift();
    if (task) claimed.push(task.id);
    return { data: task ? [task] : [], error: null };
  },
  from() {
    const query = {
      update(value) { updates.push(value); return query; },
      eq() { return query; }
    };
    return query;
  }
};

const load = Module._load;
const resolveFilename = Module._resolveFilename;
Module._load = function (request, parent, isMain) {
  if (request === "@/lib/supabase/admin") return { createSupabaseAdminClient: () => db };
  if (request === "@/lib/openai") return { createOpenAIClient: () => ({}) };
  if (request === "@/lib/solva-intelligence/costs") return { estimateCost: () => 0, extractTokenUsage: () => ({}) };
  if (request === "./automation") return { discoverVacancies: async () => 0, enqueueTask: async () => {}, matchOrder: async () => 0, plainText: () => "" };
  if (request === "./matching") return { submissionHoldReason: () => null };
  if (request === "./payment") return { hasVerifiedJobDeskPayment: () => true };
  if (request === "./cv-docx") return { createJobDeskCvDocx: async () => Buffer.from("test") };
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

const { runJobDeskWorker } = require("../src/lib/job-desk/worker.ts");

test("worker processes a bounded batch and leaves later tasks queued", async () => {
  assert.equal(await runJobDeskWorker({ maxTasks: 3, maxRunMs: 45000 }), 3);
  assert.deepEqual(claimed, ["task-0", "task-1", "task-2"]);
  assert.equal(updates.length, 3);
  assert.equal(tasks.length, 1);
  assert.ok(updates.every((update) => update.status === "failed"));
});
