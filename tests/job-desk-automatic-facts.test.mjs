import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticFactualAnswers } from '../src/lib/job-desk/answer-drafts.ts';

test('only exact approved factual answers advance automatically', () => {
  const facts = 'Managed supplier records and reconciled invoices.';
  const item = { question: 'Describe your duties', answer: facts, evidence: [facts], missing: '' };
  assert.equal(automaticFactualAnswers([item], facts).length, 1);
  assert.equal(automaticFactualAnswers([{ ...item, answer: 'Improved accuracy by 50 percent' }], facts).length, 0);
  assert.equal(automaticFactualAnswers([{ ...item, missing: 'Grade unknown' }], facts).length, 0);
  assert.equal(automaticFactualAnswers([{ ...item, question: 'Identity verification' }], facts).length, 0);
  assert.equal(automaticFactualAnswers([item], '').length, 0);
  assert.equal(automaticFactualAnswers([{ ...item, question: 'What was your school grade?' }], facts).length, 0);
  assert.equal(automaticFactualAnswers([{ ...item, question: 'Describe a situation involving these responsibilities' }], facts).length, 0);
});
