import assert from "node:assert/strict";
import test from "node:test";
import { batchVacancyIsCurrent, createBatchToken, hashBatchToken } from "../src/lib/job-desk/batch-authorization.ts";

test("batch tokens are opaque and hash consistently", () => {
  const { token, hash } = createBatchToken();
  assert.match(token, /^[A-Za-z0-9_-]{40,60}$/);
  assert.equal(hashBatchToken(token), hash);
  assert.notEqual(token, hash);
});

test("batch approval excludes closed, stale and unreviewed vacancies", () => {
  const current = { status: "open", review_status: "approved", duplicate_of: null, last_seen_at: new Date().toISOString(), description: "Current role" };
  assert.equal(batchVacancyIsCurrent(current), true);
  assert.equal(batchVacancyIsCurrent({ ...current, status: "closed" }), false);
  assert.equal(batchVacancyIsCurrent({ ...current, review_status: "needs_review" }), false);
  assert.equal(batchVacancyIsCurrent({ ...current, last_seen_at: new Date(Date.now() - 4 * 86400000).toISOString() }), false);
});
