const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { NextRequest } = require('next/server');
let fixture;
let settings;
let calls;
const mod = { exports: {} };
const createServerClient = (_url, _key, options) => {
  settings = options;
  return {
    auth: { getClaims: async () => {
      if (fixture.refresh) options.cookies.setAll([{ name: 'session', value: 'renewed', options: { httpOnly: true, path: '/' } }]);
      if (fixture.authError) throw fixture.authError;
      return { data: { claims: fixture.noUser ? null : { sub: 'verified-user' } }, error: null };
    } },
    from: table => {
      assert.equal(table, 'users');
      const query = { select: () => query, abortSignal: () => query, retry: enabled => { assert.equal(enabled, false); return query; }, eq: (key, value) => { assert.equal(key, 'id'); assert.equal(value, 'verified-user'); return query; }, maybeSingle: async () => fixture.profiles[calls++] };
      return query;
    }
  };
};
const code = ts.transpileModule(fs.readFileSync('src/middleware.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const deadline = { exports: {} };
new Function('exports', 'module', ts.transpileModule(fs.readFileSync('src/lib/request-deadline.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(deadline.exports, deadline);
new Function('exports', 'module', 'require', code)(mod.exports, mod, id => id === '@supabase/ssr' ? { createServerClient } : id === './lib/request-deadline' ? deadline.exports : require(id));
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'fixture';
async function run(value, path = '/dashboard') {
  fixture = value; calls = 0;
  return mod.exports.middleware(new NextRequest(`https://solvaone.co.ke${path}`));
}
(async () => {
  await assert.rejects(deadline.exports.withinDeadline(new Promise(() => {}), 20), { name: 'TimeoutError' });
  let response = await run({ refresh: true, profiles: [{ data: { status: 'active' }, error: null, status: 200 }] });
  assert.equal(response.status, 200);
  assert.equal(response.cookies.get('session').value, 'renewed');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  response = await run({ refresh: true, profiles: [{ error: { code: '57014' }, status: 500 }, { data: { status: 'active' }, status: 200 }] });
  assert.equal(response.status, 200); assert.equal(calls, 2);
  response = await run({ refresh: true, profiles: [{ data: { status: 'disabled' }, status: 200 }] });
  assert.equal(response.status, 307); assert.match(response.headers.get('location'), /error=disabled/);
  assert.equal(response.cookies.get('session').value, 'renewed');
  response = await run({ refresh: true, profiles: [{ error: { code: '42501' }, status: 403 }] });
  assert.equal(response.status, 503); assert.equal(calls, 1);
  assert.equal(response.cookies.get('session').value, 'renewed');
  assert.match(await response.text(), /Retry/);
  response = await run({ profiles: [{ data: null, status: 200 }] });
  assert.equal(response.status, 503);
  response = await run({ profiles: [{ error: { code: 'PGRST003' }, status: 503 }, { error: { code: 'PGRST003' }, status: 503 }] }, '/api/admin/job-desk/automation');
  assert.equal(response.status, 503); assert.equal((await response.json()).retryable, true);
  assert.equal(response.headers.get('retry-after'), '5');
  response = await run({ refresh: true, authError: new Error('upstream'), profiles: [] });
  assert.equal(response.status, 503); assert.equal(response.cookies.get('session').value, 'renewed');
  response = await run({ refresh: true, authError: { name: 'AuthApiError', status: 402, message: 'exceed_egress_quota' }, profiles: [] });
  assert.equal(response.status, 503); assert.equal(response.cookies.get('session').value, 'renewed');
  response = await run({ noUser: true, profiles: [] });
  assert.equal(response.status, 307); assert.equal(calls, 0);
  response = await run({ authError: new Error('must not call'), profiles: [] }, '/login');
  assert.equal(response.status, 200);
  for (const path of ['/api/job-desk/intake', '/api/job-desk/payment-status', '/api/job-desk/payment-retry', '/api/job-desk/answers']) {
    response = await run({ authError: new Error('must not call'), profiles: [] }, path);
    assert.equal(response.status, 200);
  }
  // Exhaust the old shared auth budget; the profile must still get a fresh budget.
  const realNow = Date.now;
  let now = realNow(); Date.now = () => now;
  const realFetch = global.fetch;
  global.fetch = async (_input, init) => { assert.equal(init.signal.aborted, false); return new Response('{}'); };
  fixture = { profiles: [{ data: { status: 'active' }, status: 200 }] }; calls = 0;
  const pending = mod.exports.middleware(new NextRequest('https://solvaone.co.ke/dashboard'));
  now += 12000;
  await pending;
  await settings.global.fetch('https://fixture.supabase.co/rest/v1/users');
  Date.now = realNow; global.fetch = realFetch;
  console.log('Account middleware: bounded retries, fresh budget, missing/disabled denial, session cookie preservation, no-cache and API errors passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
