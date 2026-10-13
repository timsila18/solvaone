const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('src/app/actions.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const hung = () => new Promise(() => {});
async function run({ auth, telemetryHung = false, count = 0 }) {
  const events = [];
  function builder(table) {
    let operation = 'select';
    const b = {
      select() { return b; }, eq() { return b; }, gte() { return b; },
      insert() { operation = 'insert'; events.push('attempt'); return b; },
      update() { operation = 'update'; events.push('last_login'); return b; },
      abortSignal() { return b; }, retry(value) { assert.equal(value, false); return b; },
      then(resolve, reject) { return (telemetryHung && operation !== 'select' ? hung() : Promise.resolve({ count, error: null })).then(resolve, reject); }
    };
    return b;
  }
  const db = { from: builder, auth: { signInWithPassword: () => { events.push('signin'); return auth(); } } };
  const exports = {};
  vm.runInNewContext(code, {
    exports, console, Date, AbortSignal,
    require(name) {
      if (name === 'zod') return require('zod');
      if (name === 'next/navigation') return { redirect: location => { throw Object.assign(new Error('redirect'), { location }); } };
      if (name === 'next/headers') return { headers: async () => ({ get: () => null }) };
      if (name.includes('supabase/admin')) return { createSupabaseAdminClient: () => db };
      if (name.includes('supabase/server')) return { createSupabaseServerClient: async () => db, createSupabaseLoginClient: async () => { events.push('fresh_client'); return db; } };
      if (name.includes('security')) return { passwordSchema: require('zod').z.string(), clientIpFromHeaders: () => 'test', logSystemEvent: async () => {} };
      if (name.includes('request-deadline')) return { withinDeadline: async operation => {
        let timer;
        try { return await Promise.race([Promise.resolve(operation), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 10); })]); }
        finally { clearTimeout(timer); }
      } };
      if (name.includes('utils')) return {};
      throw new Error(`Unexpected import ${name}`);
    }
  });
  const form = new FormData();
  form.set('email', 'test@example.com'); form.set('password', 'test-only-password');
  try { await exports.loginAction(form); assert.fail('Expected redirect'); }
  catch (error) { assert.ok(error.location, error.message); return { location: error.location, events }; }
}
(async () => {
  const success = await run({ auth: async () => ({ data: { user: { id: 'test-user' } }, error: null }), telemetryHung: true });
  assert.equal(success.location, '/dashboard');
  assert.ok(success.events.includes('fresh_client'));
  const timeout = await run({ auth: hung });
  assert.equal(timeout.location, '/login?error=unavailable');
  const outage = await run({ auth: async () => ({ data: {}, error: { status: 504, name: 'AuthRetryableFetchError' } }) });
  assert.equal(outage.location, '/login?error=unavailable');
  assert.ok(!outage.events.includes('attempt'), 'Provider outage must not count as a wrong-password attempt');
  const quota = await run({ auth: async () => ({ data: {}, error: { status: 402, name: 'AuthApiError', message: 'exceed_egress_quota' } }) });
  assert.equal(quota.location, '/login?error=unavailable');
  assert.ok(!quota.events.includes('attempt'), 'Provider quota failure must not count as a wrong-password attempt');
  const invalid = await run({ auth: async () => ({ data: {}, error: { status: 400, name: 'AuthApiError', message: 'Invalid login credentials' } }) });
  assert.equal(invalid.location, '/login?error=credentials');
  assert.ok(invalid.events.includes('attempt'));
  const locked = await run({ auth: hung, count: 5 });
  assert.equal(locked.location, '/login?error=locked');
  assert.ok(!locked.events.includes('signin'));
  console.log('Login action tests passed: success with unavailable telemetry, auth timeout, outage, invalid password and lockout.');
})().catch(error => { console.error(error); process.exitCode = 1; });
