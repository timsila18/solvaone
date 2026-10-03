import test from 'node:test';
import assert from 'node:assert/strict';
import { prohibitsAnswerDrafting } from '../src/lib/job-desk/question-policy.ts';
test('Canonical own-words declaration prohibits automated answers', () => {
  assert.equal(prohibitsAnswerDrafting('During this application process I agree to use only my own words. I understand that plagiarism, the use of AI or other generated content will disqualify my application.'), true);
  assert.equal(prohibitsAnswerDrafting('Describe your technical skills'), false);
});
