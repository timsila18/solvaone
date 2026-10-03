import test from 'node:test';
import assert from 'node:assert/strict';
import { generalRoleFamily, completionHold } from '../src/lib/job-desk/general-jobs.ts';
import { createApplicationScope, applicationScopeHold, readApplicationScope } from '../src/lib/job-desk/application-scope.ts';
import { scoreVacancy } from '../src/lib/job-desk/matching.ts';
import { careerCatalogueUrls } from '../src/lib/job-desk/career-discovery.ts';

const scope = createApplicationScope({ targetRoles: 'Office Assistant', preferredLocations: 'Kenya', remotePreference: 'flexible', excludedEmployers: 'Excluded Employer', excludedRoles: '', excludedKeywords: '', channel: 'admin_recorded', evidence: 'Client accepts retail entry-level work', includeGeneralRoles: 'true', generalRoleFamilies: 'retail' });
const job = { title: 'Shop Assistant', company_name: 'Real Employer', location: 'Nairobi, Kenya', workplace_type: 'onsite', description: 'KCSE school leavers accepted. Training provided. Serve customers.' };
const candidate = { structured_profile: { education: [{ qualification: 'KCSE' }], totalYearsExperience: 0, experience: [], skills: [] } };
test('school leaver reaches mandatory review through accepted general family', () => {
  assert.equal(applicationScopeHold(scope, job), null);
  assert.ok(scoreVacancy(job, candidate, scope).score >= 25);
});
test('general jobs require opt-in and retain employer and location exclusions', () => {
  assert.match(applicationScopeHold({ ...scope, includeGeneralRoles: false }, job), /target roles/);
  assert.match(applicationScopeHold(scope, { ...job, company_name: 'Excluded Employer' }), /excluded/);
  assert.equal(scoreVacancy({ ...job, location: 'London, UK' }, candidate, scope).score, 0);
  assert.equal(scoreVacancy({ ...job, description: 'Requires 5 years experience.' }, candidate, scope).score, 0);
});
test('malformed scopes and specialist variants never authorize general jobs', () => {
  assert.equal(readApplicationScope({ applicationScope: { ...scope, generalRoleFamilies: ['everything'] } }), null);
  assert.equal(generalRoleFamily('Server Administrator'), null);
  assert.equal(generalRoleFamily('Senior Shop Assistant'), null);
});
test('general matching never discards the client salary floor', () => {
  assert.equal(scoreVacancy(job, candidate, { ...scope, minimumMonthlyKes: 20000 }).score, 0);
  assert.ok(scoreVacancy({ ...job, description: job.description + ' KSh 25,000 per month.' }, candidate, { ...scope, minimumMonthlyKes: 20000 }).score >= 25);
});
test('delivery evidence is required before service completion', () => {
  assert.match(completionHold('job_search_full', 0), /not complete/);
  assert.equal(completionHold('job_search_full', 10), null);
  assert.equal(completionHold('cv_revamp', 0), null);
});
test('accepted hospitality and warehouse families select Kenyan catalogue sources', () => {
  const urls = careerCatalogueUrls([{ generalRoleFamilies: ['hospitality', 'warehouse'] }]);
  assert.ok(urls.some(url => url.includes('hospitality')));
  assert.ok(urls.some(url => url.includes('logistics')));
});
