const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const mod = { exports: {} };
new Function("exports", "module", ts.transpileModule(fs.readFileSync("src/lib/job-desk/email-transport.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod.exports, mod);
const { sendApplicationEmail, ApplicationEmailError } = mod.exports;
async function run() {
  process.env.RESEND_API_KEY = "test-only";
  process.env.JOB_DESK_FROM_EMAIL = "apply@example.com";
  let sent;
  global.fetch = async (_, options) => { sent = options; return { ok: true, json: async () => ({ id: "accepted-id" }) }; };
  assert.deepEqual(await sendApplicationEmail({ to: ["candidate@example.com"], reply_to: "candidate@example.com" }, "unique-key"), { id: "accepted-id" });
  assert.equal(sent.headers["Idempotency-Key"], "unique-key");
  assert.equal(JSON.parse(sent.body).from, "apply@example.com");
  assert.equal(JSON.parse(sent.body).reply_to, "candidate@example.com");
  for (const status of [401, 403, 429]) {
    global.fetch = async () => ({ ok: false, status, json: async () => ({}) });
    await assert.rejects(sendApplicationEmail({}, "key"), error => error instanceof ApplicationEmailError && error.rejected);
  }
  global.fetch = async () => { throw new Error("timeout"); };
  await assert.rejects(sendApplicationEmail({}, "key"), error => error instanceof ApplicationEmailError && !error.rejected);
  console.log("Email acceptance, rejection, idempotency and uncertain-outcome tests passed. No emails sent.");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
