import test from 'node:test';
import assert from 'node:assert/strict';
import { employerVacancySchema, employerDeadlineOpen, readEmployerLead } from '../src/lib/job-desk/employer-network.ts';
const row = { company:'Example employer', contactName:'Recruiter', email:'hr@example.com', phone:'0720000000', title:'Shop Assistant', location:'Nairobi, Kenya', requirements:'KCSE. No experience required. Training provided.', applicationEmail:'jobs@example.com', advertUrl:'https://example.com/jobs/assistant', closingDate:'2026-10-20', authorized:true, noFees:true };
test('employer intake validates details without treating them as verified', () => {
  assert.equal(employerVacancySchema.safeParse(row).success, true);
  assert.equal(readEmployerLead(JSON.stringify(row)).success, true);
  assert.equal(readEmployerLead('invalid').success, false);
  assert.equal(employerVacancySchema.safeParse({...row, authorized:false}).success, false);
});
test('expired, invalid and distant deadlines cannot import', () => {
  const now = new Date('2026-10-03T10:00:00Z');
  assert.equal(employerDeadlineOpen(row.closingDate, now), true);
  assert.equal(employerDeadlineOpen('2026-10-02', now), false);
  assert.equal(employerDeadlineOpen('2027-10-20', now), false);
  assert.equal(employerDeadlineOpen('2026-02-30', new Date('2026-02-01')), false);
});
test('unsafe advert URLs and oversized content are rejected', () => {
  for (const advertUrl of ['http://example.com', 'https://127.0.0.1/job', 'https://user:pass@example.com/jobs', 'javascript:alert(1)']) assert.equal(employerVacancySchema.safeParse({...row, advertUrl}).success, false);
  assert.equal(employerVacancySchema.safeParse({...row, requirements:'x'.repeat(6001)}).success, false);
});
