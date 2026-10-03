import test from 'node:test';
import assert from 'node:assert/strict';
import { tailorApprovedCv } from '../src/lib/job-desk/cv-tailoring.ts';
const cv = { sections: [{title:'Professional Summary',html:'<p>Approved profile</p>'},{title:'Core Skills',html:'<ul><li>Stock monitoring</li><li>Payroll processing</li></ul>'},{title:'Experience',html:'<h3>2024 Employer</h3><p>Verified duty</p><h3>2020 Employer</h3>'},{title:'Projects',html:'<p>Warehouse project</p>'},{title:'Certifications',html:'<p>Payroll course</p>'}] };
test('tailoring prioritizes relevant approved skills without editing claims or chronology', () => {
  const original = JSON.stringify(cv);
  const result = tailorApprovedCv(cv, {title:'Payroll Assistant',description:'Payroll processing and records.'});
  assert.match(result.sections[1].html, /<li>Payroll processing<\/li><li>Stock monitoring/);
  assert.equal(result.sections[2].html, cv.sections[2].html);
  assert.equal(result.sections[3].title, 'Certifications');
  assert.equal(JSON.stringify(cv), original);
  assert.deepEqual(result.sections.map(s=>s.html.replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean)).flat().sort(), cv.sections.map(s=>s.html.replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean)).flat().sort());
});
test('complex skill lists and untargeted exports remain unchanged', () => {
  assert.equal(tailorApprovedCv(cv), cv);
  const complex = {sections:[{title:'Skills',html:'<ul><li>Outer<ul><li>Inner</li></ul></li></ul>'}]};
  assert.deepEqual(tailorApprovedCv(complex,{title:'Inner',description:''}),complex);
});
