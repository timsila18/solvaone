const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
function load(file, requireStub = require) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "module", "require", code)(mod.exports, mod, requireStub);
  return mod.exports;
}
const quality = load("src/lib/job-desk/letter-quality.ts");
const { nextDeliveryState } = load("src/lib/job-desk/delivery-events.ts");
assert.equal(quality.letterDate(new Date("2026-10-01T21:30:00Z")), "2 October 2026");
assert.match(quality.formatApplicationLetter("Experience includes sales leadership.", "Candidate", "Sales Manager", new Date("2026-10-01T08:00:00Z")), /^1 October 2026/);
assert.throws(() => quality.validateLetterBody("[Your name]"));
assert.deepEqual(quality.parseLetterReview('{"supported":true,"issues":[]}'), { supported: true, issues: [] });
assert.equal(quality.parseLetterReview('{"supported":true,"issues":["Invented current employer"]}').supported, false);
assert.throws(() => quality.parseLetterReview('{"supported":"yes","issues":[]}'));
const delivered = { event: "email.delivered", at: "2026-10-01T10:00:00Z", eventId: "one" };
assert.equal(nextDeliveryState(delivered, { event: "email.sent", at: "2026-10-01T11:00:00Z", eventId: "two" }), delivered);
assert.equal(nextDeliveryState(delivered, { event: "email.bounced", at: "2026-10-01T09:00:00Z", eventId: "two" }), delivered);
assert.equal(nextDeliveryState(delivered, delivered), delivered);
assert.equal(nextDeliveryState(undefined, { event: "unknown", at: delivered.at, eventId: "two" }), undefined);
assert.equal(nextDeliveryState(delivered, { event: "email.bounced", at: "2026-10-01T11:00:00Z", eventId: "two" }).event, "email.bounced");

let row;
const db = { from() {
  let mode, payload, filters = [];
  const query = {
    upsert(value) { if (!row) row = { ...value, id: "id", provider_response: {}, provider_message_id: null }; return query; },
    select() { return query; },
    update(value) { mode = "update"; payload = value; return query; },
    eq(key, value) { filters.push(r => typeof r[key] === "object" ? JSON.stringify(r[key]) === value : r[key] === value); return query; },
    is(key, value) { filters.push(r => r[key] === value); return query; },
    single() { return Promise.resolve({ data: { ...row }, error: null }); },
    maybeSingle() { const matches = filters.every(fn => fn(row)); if (mode === "update" && matches) row = { ...row, ...payload }; return Promise.resolve({ data: matches ? { ...row } : null, error: null }); },
    then(resolve) { if (mode === "update" && filters.every(fn => fn(row))) row = { ...row, ...payload }; resolve({ error: null }); }
  };
  return query;
} };
const { claimApplication } = load("src/lib/job-desk/submission-lock.ts", () => ({ createSupabaseAdminClient: () => db }));
(async () => {
  const claims = await Promise.all([claimApplication("match", "order", "email", "test@example.com"), claimApplication("match", "order", "email", "test@example.com")]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(await claimApplication("match", "order", "email", "test@example.com"), false);
  row.status = "needs_human"; row.provider_response = { clicked: true };
  assert.equal(await claimApplication("match", "order", "email", "test@example.com"), false);
  row.provider_response = { clicked: false };
  assert.equal(await claimApplication("match", "order", "email", "test@example.com"), true);
  row.status = "needs_human"; row.provider_response = { clicked: false }; row.provider_message_id = "accepted";
  assert.equal(await claimApplication("match", "order", "email", "test@example.com"), false);
  console.log("Factual review, Nairobi dates, delivery ordering, duplicate send locks and safe retry tests passed. No applications sent.");
})().catch(error => { console.error(error); process.exitCode = 1; });
