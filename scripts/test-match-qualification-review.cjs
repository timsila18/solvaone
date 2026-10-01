const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
const chain = {
  select() { return this; }, eq() { return this; }, upsert() { return this; }, update() { return this; },
  async maybeSingle() { return { data: null }; }, async single() { return { data: { id: 'test-run' } }; }
};
let responseDecision;
let incompleteFirst = false;
let calls = 0;
let isolateFailures = false;
const dependencies = {
  '@/lib/supabase/admin': { createSupabaseAdminClient: () => ({ from: () => Object.create(chain) }) },
  '@/lib/openai': { createOpenAIClient: () => ({ responses: { async create(request) {
    calls += 1;
    const input = JSON.parse(request.input.findLast(item => item.role === 'user').content);
    assert.equal(input.reviewVersion, 6);
    assert.equal(input.candidate.approvedCvText, 'Bachelor of Business Administration, Marketing');
    assert.equal(input.vacancies[0].description.length, 5000);
    if (incompleteFirst) { incompleteFirst = false; return { output_text: '{truncated' }; }
    if (isolateFailures) {
      if (input.vacancies.length > 1 || input.vacancies[0].id === 'broken') return { output_text: '{truncated' };
      return { output_text: JSON.stringify({ decisions: input.vacancies.map(job => ({ ...responseDecision, id: job.id })) }) };
    }
    return { output_text: JSON.stringify({ decisions: [responseDecision] }) };
  } } }) },
  '@/lib/solva-intelligence/costs': { extractTokenUsage: () => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }), estimateCost: () => 0 },
  'openai/helpers/zod': { zodTextFormat: () => ({}) }
};
new Function('exports', 'module', 'require', ts.transpileModule(fs.readFileSync('src/lib/job-desk/relevance.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod.exports, mod, name => dependencies[name] ?? require(name));
(async () => {
  const vacancy = { id: 'job', title: 'Sales Manager', company_name: 'Example', location: 'Nairobi', workplace_type: 'onsite', description: 'x'.repeat(5000) };
  const profile = { approvedCvText: 'Bachelor of Business Administration, Marketing' };
  responseDecision = { id: 'job', suitable: true, reason: 'Sales skills transfer', mandatoryChecks: [{ requirement: 'Luxury hospitality sales essential', cvEvidence: 'Not documented', supported: false }] };
  assert.equal((await mod.exports.reviewCandidateMatches('order', profile, [vacancy])).get('job').suitable, false);
  responseDecision = { ...responseDecision, mandatoryChecks: [{ requirement: 'Sales experience', cvEvidence: 'National Sales Manager, 2024-2025', supported: true }] };
  isolateFailures = true;
  const isolated = await mod.exports.reviewCandidateMatches('order', profile, ['broken', 'valid1', 'valid2', 'valid3', 'valid4'].map(id => ({ ...vacancy, id })));
  assert.equal(isolated.get('broken').suitable, false);
  assert.match(isolated.get('broken').reason, /later retry/);
  for (const id of ['valid1', 'valid2', 'valid3', 'valid4']) assert.equal(isolated.get(id).suitable, true);
  responseDecision = { ...responseDecision, mandatoryChecks: [{ requirement: 'Sales experience', cvEvidence: 'National Sales Manager, 2024-2025', supported: true }] };
  incompleteFirst = true;
  const before = calls;
  assert.equal((await mod.exports.reviewCandidateMatches('order', profile, [vacancy])).get('job').suitable, true);
  assert.equal(calls - before, 2);
  responseDecision = { ...responseDecision, mandatoryChecks: [{ requirement: 'Sales experience', cvEvidence: '', supported: true }] };
  assert.equal((await mod.exports.reviewCandidateMatches('order', profile, [vacancy])).get('job').suitable, false);
  console.log('Full-advert review and unsupported mandatory qualification safeguards passed. No live AI calls or applications.');
})().catch(error => { console.error(error); process.exitCode = 1; });
