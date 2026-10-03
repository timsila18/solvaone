const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('matching preserves deferred preflight reasons instead of calling supported portals unsupported', () => {
  const source = fs.readFileSync('src/lib/job-desk/automation.ts', 'utf8');
  assert.match(source, /for \(const \{ candidate, reason \} of screened.skipped\)/);
  assert.match(source, /if \(!blockedQuestions.has\(candidate.vacancy.id\)\) blockedQuestions.set\(candidate.vacancy.id, \[reason\]\)/);
});
