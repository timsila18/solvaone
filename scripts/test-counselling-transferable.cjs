const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'module', 'require', code)(mod.exports, mod, name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name));
  return mod.exports;
}
const { scoreVacancy } = load('src/lib/job-desk/matching.ts');
const scope = { targetRoles: ['Graduate Counselling Psychologist'], preferredLocations: ['Kenya'], remotePreference: 'flexible', includeGeneralRoles: true, generalRoleFamilies: ['customer_service'] };
const profile = { target_job_titles: scope.targetRoles, structured_profile: { skills: ['Clear Communication and Accurate Reporting', 'Multidisciplinary Collaboration', 'Empathy and Emotional Resilience'], experience: [{ jobTitle: 'Volunteer Counsellor', responsibilities: ['Maintain confidential clinical documentation', 'Use active listening and empathy'] }] } };
const vacancy = { title: 'Customer Service Executive', location: 'Nairobi, Kenya', workplace_type: 'onsite', description: 'Excellent communication skills, teamwork, accurate records and active listening. Training provided.' };
assert.ok(scoreVacancy(vacancy, profile, scope).score > 0);
assert.equal(scoreVacancy(vacancy, profile, { ...scope, includeGeneralRoles: false }).score, 0);
assert.equal(scoreVacancy({ ...vacancy, location: 'US only', workplace_type: 'remote' }, profile, scope).score, 0);
assert.equal(scoreVacancy({ ...vacancy, title: 'Customer Service Manager' }, profile, scope).score, 0);
console.log('Transferable counselling skills, consent scope, geography and manager exclusion tests passed.');
