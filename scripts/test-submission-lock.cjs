const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
let row;
const db = { from() {
  let update, filters = [];
  const result = () => {
    const matches = filters.every(([key, expected]) => key === 'provider_response' ? JSON.stringify(row[key]) === expected : row[key] === expected);
    if (!matches) return { data: null, error: null };
    if (update) Object.assign(row, update);
    return { data: { ...row }, error: null };
  };
  const chain = {
    upsert() { return Promise.resolve({ error: null }); },
    select() { return chain; },
    update(value) { update = value; return chain; },
    eq(key, value) { filters.push([key, value]); return chain; },
    is(key, value) { filters.push([key, value]); return chain; },
    single() { return Promise.resolve({ data: { ...row }, error: null }); },
    maybeSingle() { return Promise.resolve(result()); },
    then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
  };
  return chain;
} };
const moduleUnderTest = new Module(__filename, module);
moduleUnderTest.require = id => id === '@/lib/supabase/admin' ? { createSupabaseAdminClient: () => db } : id === './submission-preflight' ? { canRetrySubmission: app => app.status === 'needs_human' && app.provider_response?.clicked === false && !app.provider_response.handoffAttemptId } : require(id);
moduleUnderTest._compile(ts.transpileModule(fs.readFileSync('src/lib/job-desk/submission-lock.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, __filename);
const { claimApplication } = moduleUnderTest.exports;
(async () => {
  row = { id: 'application', match_id: 'match', status: 'needs_human', provider_message_id: null, provider_response: { clicked: false, handoffAttemptId: 'reserved' } };
  assert.equal(await claimApplication('match', 'order', 'portal', 'fixture'), false);
  assert.equal(row.status, 'needs_human');
  assert.equal(row.provider_response.handoffAttemptId, 'reserved');
  row = { id: 'application', match_id: 'match', status: 'needs_human', provider_message_id: null, provider_response: { clicked: false } };
  assert.equal(await claimApplication('match', 'order', 'portal', 'fixture'), true);
  assert.equal(row.status, 'sending');
  assert.equal(await claimApplication('match', 'order', 'portal', 'fixture'), false);
  console.log('Send-lock takeover reservation and duplicate-send guards passed. No applications sent.');
})().catch(error => { console.error(error); process.exitCode = 1; });
