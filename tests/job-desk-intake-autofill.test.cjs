const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('admin CV upload triggers existing empty-field-only intake preview', () => {
  const source = fs.readFileSync('src/components/job-desk/intake-form.tsx', 'utf8');
  assert.match(source, /if \(event.target.files\?\.length\) void prefill\(\)/);
  assert.match(source, /!control.value.trim\(\) && raw/);
  assert.match(source, /name="preferredIndustries"/);
  assert.match(source, /type="submit" disabled=\{busy \|\| reading\}/);
});
