const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

let insertError;
let lookupCount = 0;
const db = { from: () => ({
  upsert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: insertError }) }) }),
  select: () => ({ eq: () => ({ eq: () => ({ in: () => ({ limit: () => ({ maybeSingle: async () => { lookupCount++; return { data: { id: 'already-active' }, error: null }; } }) }) }) }) })
}) };
const originalLoad = Module._load;
const originalTs = require.extensions['.ts'];
Module._load = function(request, parent, main) {
  if (parent?.filename?.endsWith('automation.ts')) {
    if (request === '@/lib/supabase/admin') return { createSupabaseAdminClient: () => db };
    if (request.startsWith('./') || request.startsWith('@/')) return {};
  }
  return originalLoad.call(this, request, parent, main);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { enqueueTask } = require('../src/lib/job-desk/automation.ts');

test('an existing active match task absorbs a different deduplication key', async () => {
  insertError = { code: '23505', message: 'duplicate key value violates unique constraint "job_desk_tasks_one_active_match_per_order_idx"' };
  assert.equal(await enqueueTask('match', 'new-key', 'order-id'), 'already-active');
  assert.equal(lookupCount, 1);
});

test('unrelated unique constraint errors remain visible', async () => {
  insertError = { code: '23505', message: 'duplicate key value violates unique constraint "another_index"' };
  await assert.rejects(enqueueTask('match', 'new-key', 'order-id'), /another_index/);
});

test.after(() => { Module._load = originalLoad; require.extensions['.ts'] = originalTs; });
