const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const mod = { exports: {} };
const code = ts.transpileModule(fs.readFileSync("src/lib/payments.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function("exports", "module", "require", code)(mod.exports, mod, () => ({}));
for (const key of ["DARAJA_CONSUMER_KEY", "DARAJA_CONSUMER_SECRET", "DARAJA_SHORTCODE", "DARAJA_PASSKEY", "DARAJA_CALLBACK_URL"]) process.env[key] = "fixture";
const input = { phone: "0712345678", amount: 1500, orderId: "fixture", description: "Test" };
async function run() {
  let calls = 0;
  global.fetch = async () => { calls++; throw new TypeError("fetch failed"); };
  await assert.rejects(mod.exports.requestJobDeskStkPush(input), /No payment prompt was sent/);
  assert.equal(calls, 1);
  calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.ok(options.signal);
    if (url.includes("oauth")) return { ok: true, json: async () => ({ access_token: "fixture" }) };
    throw new TypeError("fetch failed");
  };
  await assert.rejects(mod.exports.requestJobDeskStkPush(input), /status is unknown/);
  assert.equal(calls, 2);
  const mock = response => { global.fetch = async url => url.includes("oauth") ? { ok: true, json: async () => ({ access_token: "fixture" }) } : response; };
  mock({ ok: true, status: 200, json: async () => ({ ResponseCode: "0", CheckoutRequestID: "checkout", MerchantRequestID: "merchant" }) });
  assert.deepEqual(await mod.exports.requestJobDeskStkPush(input), { checkoutRequestId: "checkout", merchantRequestId: "merchant" });
  mock({ ok: true, status: 200, json: async () => ({ ResponseCode: "1", ResponseDescription: "Invalid request" }) });
  await assert.rejects(mod.exports.requestJobDeskStkPush(input), /M-Pesa rejected/);
  mock({ ok: false, status: 502, json: async () => ({ errorMessage: "Gateway error" }) });
  await assert.rejects(mod.exports.requestJobDeskStkPush(input), /status is unknown/);
  mock({ ok: true, status: 200, json: async () => ({ ResponseCode: "0" }) });
  await assert.rejects(mod.exports.requestJobDeskStkPush(input), /status is unknown/);
  mock({ ok: true, status: 200, json: async () => ({}) });
  await assert.rejects(mod.exports.requestJobDeskStkPush(input), /status is unknown/);
  mock({ ok: true, status: 200, json: async () => { throw new Error("Invalid JSON"); } });
  await assert.rejects(mod.exports.requestJobDeskStkPush(input), /status is unknown/);
  console.log("Payment network tests passed: safe authentication retry, unknown send hold, deadlines, provider acceptance/rejection and malformed response handling. No live payment sent.");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
