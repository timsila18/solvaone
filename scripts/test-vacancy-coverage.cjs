const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('exports', 'module', 'require', ts.transpileModule(fs.readFileSync('src/lib/job-desk/vacancy-feeds.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod.exports, mod, require);
const feeds = mod.exports;
assert.equal(feeds.isOfficialApplyUrl('greenhouse', 'jumia', 'https://job-boards.eu.greenhouse.io/jumia/jobs/123'), true);
assert.equal(feeds.isOfficialApplyUrl('greenhouse', 'jumia', 'https://job-boards.eu.greenhouse.io/other/jobs/123'), false);
assert.equal(feeds.isOfficialApplyUrl('greenhouse', 'jumia', 'https://job-boards.eu.greenhouse.io.attacker.com/jumia/jobs/123'), false);
const lever = feeds.normalizeFeedJob({ provider: 'lever', site_token: 'test', company_name: 'Test' }, { id: '1', text: 'Sales Manager', categories: { location: 'Nairobi' }, hostedUrl: 'https://jobs.lever.co/test/1', descriptionPlain: 'Overview', lists: [{ text: 'Qualifications', content: '<p>Account management experience</p>' }], additionalPlain: 'Closing date: 2020-01-01' });
assert.match(lever.description, /Account management experience/);
assert.ok(feeds.reviewReasons(lever).includes('expired_deadline'));
const smart = feeds.normalizeFeedJob({ provider: 'smartrecruiters', site_token: 'Test', company_name: 'Test' }, { id: '1', name: 'Sales Manager', location: { city: 'Nairobi', country: 'ke' }, applyUrl: 'https://jobs.smartrecruiters.com/Test/1', jobAd: { sections: { jobDescription: { text: 'Sales duties' }, qualifications: { text: 'Required degree' } } } });
assert.equal(smart.location, 'Nairobi, Kenya');
assert.match(smart.description, /Required degree/);
(async () => {
  const original = global.fetch;
  try {
    let pages = 0;
    global.fetch = async url => {
      const parsed = new URL(url);
      if (parsed.searchParams.has('offset')) {
        pages += 1;
        const offset = Number(parsed.searchParams.get('offset'));
        return { ok: true, json: async () => ({ totalFound: 101, content: Array.from({ length: offset === 0 ? 100 : 1 }, (_, i) => ({ id: String(offset + i) })) }) };
      }
      return { ok: true, json: async () => ({ id: parsed.pathname.split('/').pop() }) };
    };
    const source = { provider: 'smartrecruiters', site_token: 'Test', company_name: 'Test' };
    assert.equal((await feeds.fetchFeedJobs(source)).length, 101);
    assert.equal(pages, 2);
    assert.equal(await feeds.feedStillListsJob(source, '100'), true);
    global.fetch = async () => ({ ok: true, json: async () => ({ totalFound: 101, content: [] }) });
    await assert.rejects(feeds.fetchFeedJobs(source), /incomplete page/);
  } finally { global.fetch = original; }
  console.log('Feed descriptions, regional URLs, location, expiry and complete pagination tests passed. No applications sent.');
})().catch(error => { console.error(error); process.exitCode = 1; });
