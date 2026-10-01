const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const mod = { exports: {} };
  new Function('exports', 'module', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod.exports, mod);
  return mod.exports;
}
const { scoreVacancy, documentedSkillMatches } = load('src/lib/job-desk/matching.ts');
assert.equal(documentedSkillMatches('route-to-market', 'Our route to market strategy'), true);
assert.equal(documentedSkillMatches('key account management', 'Account management and sales forecasts'), true);
assert.equal(documentedSkillMatches('team leadership', 'Team management is essential'), true);
assert.equal(documentedSkillMatches('sales forecasting', 'Forecasting weather and account login'), false);
assert.equal(documentedSkillMatches('CRM', 'scrmtool experience'), false);
const { createApplicationScope, applicationScopeHold } = load('src/lib/job-desk/application-scope.ts');
const profile = { target_job_titles: ['Accountant'], preferred_locations: ['Nairobi'], structured_profile: { skills: ['communication', 'reporting', 'customer service'], experience: [{ jobTitle: 'Accountant' }] } };
const job = { title: 'Customer Support Coordinator', company_name: 'Example', location: 'Nairobi', workplace_type: 'onsite', description: 'Communication, reporting and customer service. KES 50,000 per month.' };
const scope = createApplicationScope({ targetRoles: 'Accountant', preferredLocations: 'Nairobi', remotePreference: 'flexible', excludedEmployers: '', excludedRoles: '', excludedKeywords: '', channel: 'admin_recorded', evidence: 'Client authorized broader roles', includeBroaderRoles: 'true', broaderRoles: 'Customer Support Coordinator', broaderSeniority: 'professional', minimumMonthlyKes: '40000' });
assert.equal(scoreVacancy(job, profile).score, 0);
assert.ok(scoreVacancy(job, profile, scope).score >= 50);
assert.equal(applicationScopeHold(scope, job), null);
assert.equal(scoreVacancy(job, profile, { ...scope, minimumMonthlyKes: 60000 }).score, 0);
assert.equal(scoreVacancy({ ...job, description: 'Communication and reporting.' }, profile, scope).score, 0);
assert.equal(scoreVacancy(job, { ...profile, structured_profile: { skills: ['communication'], experience: [] } }, scope).score, 0);
assert.equal(scoreVacancy({ ...job, title: 'Junior Customer Support Coordinator' }, profile, scope).score, 0);
assert.equal(scoreVacancy({ ...job, location: 'London' }, profile, scope).score, 0);
assert.match(applicationScopeHold({ ...scope, excludedEmployers: ['Example'] }, job), /excluded/);
const salesScope = { ...scope, targetRoles: ['National Sales Manager', 'Regional Sales Manager'], includeBroaderRoles: false, preferredLocations: ['Nairobi'], excludedEmployers: [] };
assert.equal(applicationScopeHold(salesScope, { ...job, title: 'Sales Manager' }), null);
assert.match(applicationScopeHold(salesScope, { ...job, title: 'Engineering Manager' }), /outside/);
assert.match(applicationScopeHold(salesScope, { ...job, title: 'Sales Manager', location: 'London' }), /outside/);
const cityScope = createApplicationScope({ targetRoles: 'National Sales Manager', preferredLocations: 'Nairobi, Kenya, Mombasa, Kenya', remotePreference: 'flexible', excludedEmployers: '', excludedRoles: '', excludedKeywords: '', channel: 'admin_recorded', evidence: 'Only Nairobi and Mombasa' });
assert.deepEqual(cityScope.preferredLocations, ['Nairobi', 'Mombasa']);
assert.match(applicationScopeHold(cityScope, { ...job, title: 'Sales Manager', location: 'Kenya' }), /outside/);
const countryScope = { ...cityScope, includeUnspecifiedKenyaLocations: true };
assert.equal(applicationScopeHold(countryScope, { ...job, title: 'Sales Manager', location: 'Kenya' }), null);
for (const location of ['Kisumu, Kenya', 'Western Region, Kenya', 'Eldoret']) {
  assert.match(applicationScopeHold(countryScope, { ...job, title: 'Sales Manager', location }), /outside/);
}
assert.match(applicationScopeHold(cityScope, { ...job, title: 'Sales Manager', location: 'Kisumu, Kenya' }), /outside/);
assert.throws(() => createApplicationScope({ ...scope, targetRoles: 'Accountant', preferredLocations: '', excludedEmployers: '', excludedRoles: '', excludedKeywords: '', includeBroaderRoles: 'true', broaderRoles: '' }));
console.log('Broader-role opt-in, skill evidence, salary, seniority, location and exclusion tests passed. No applications sent.');
