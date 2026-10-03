const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const originalLoad = Module._load;
const originalFetch = global.fetch;
const oldKey = process.env.RESEND_API_KEY;
let rows, notifications, loseClaim;
const id = "11111111-1111-4111-8111-111111111111";
const db = { from: () => {
  let patch;
  const query = {
    select: () => query, eq: () => query, is: () => query, not: () => query, order: () => query,
    limit: async () => ({ data: rows, error: null }),
    update: value => { patch = value; return query; },
    maybeSingle: async () => {
      if (loseClaim) return { data: null, error: null };
      rows[0].provider_response = patch.provider_response;
      return { data: { id: rows[0].id }, error: null };
    }
  };
  return query;
} };
Module._load = function (request, parent, isMain) {
  if (request === "@/lib/supabase/admin") return { createSupabaseAdminClient: () => db };
  if (request === "./client-updates") return { queueClientUpdate: async (...args) => notifications.push(args) };
  return originalLoad.call(this, request, parent, isMain);
};
require.extensions[".ts"] = function (mod, file) {
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
};
const { reconcileEmailDeliveries } = require(path.resolve("src/lib/job-desk/email-delivery.ts"));
test.beforeEach(() => {
  process.env.RESEND_API_KEY = "test-only";
  rows = [{ id: "app", order_id: "order", match_id: "match", provider_message_id: id, provider_response: { clicked: true, verification_type: "provider_accepted", unrelated: "preserve" } }];
  notifications = []; loseClaim = false;
});
test("accepted email becomes verified delivery and queues the correct client update without resending", async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, `https://api.resend.com/emails/${id}`);
    assert.equal(options.body, undefined);
    assert.ok(!options.method || options.method === "GET");
    return { ok: true, status: 200, json: async () => ({ id, last_event: "delivered", html: "private message" }) };
  };
  const result = await reconcileEmailDeliveries({ force: true });
  assert.equal(result.checked, 1); assert.equal(result.delivered, 1);
  assert.equal(rows[0].provider_response.clicked, true);
  assert.equal(rows[0].provider_response.unrelated, "preserve");
  assert.equal(rows[0].provider_response.html, undefined);
  assert.deepEqual(notifications, [["order", "application_delivered", "match"]]);
});
test("sending-only keys report a configuration block, not a delivery or retry", async () => {
  global.fetch = async () => ({ ok: false, status: 403 });
  const result = await reconcileEmailDeliveries({ force: true });
  assert.equal(result.configurationBlocked, true); assert.equal(result.updated, 0);
  assert.deepEqual(notifications, []);
});
test("concurrent webhook evidence is not overwritten or notified from an uncommitted poll", async () => {
  loseClaim = true;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ id, last_event: "delivered" }) });
  const result = await reconcileEmailDeliveries({ force: true });
  assert.equal(result.updated, 0); assert.equal(rows[0].provider_response.delivery, undefined);
  assert.deepEqual(notifications, []);
});
test("provider failure creates a delivery-failure update without altering submission identity", async () => {
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ id, last_event: "bounced" }) });
  const result = await reconcileEmailDeliveries({ force: true });
  assert.equal(result.deliveryFailures, 1);
  assert.equal(rows[0].provider_message_id, id);
  assert.deepEqual(notifications, [["order", "application_delivery_failed", "match"]]);
});
test.after(() => {
  global.fetch = originalFetch; Module._load = originalLoad;
  if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey;
});
