import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuestion } from '../src/lib/job-desk/submission-preflight.ts';

test('invalid employer labels produce an actionable error, not a replace crash', () => {
  assert.throws(() => normalizeQuestion(undefined), /Employer question label is missing or invalid/);
  assert.equal(normalizeQuestion('Your skills*'), 'your skills');
});
