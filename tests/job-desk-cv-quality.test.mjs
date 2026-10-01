import assert from "node:assert/strict";
import test from "node:test";
import { cvDepthIssue } from "../src/lib/job-desk/cv-quality.ts";

const output = (sections, length) => ({ revampedCv: { sections: Array.from({ length: sections }, (_, i) => ({ html: `<p>${"A".repeat(length / sections)}</p>`, id: String(i), title: "Section" })) } });

test("truly empty CV output is blocked", () => {
  assert.equal(cvDepthIssue(output(2, 300))?.blocking, true);
});

test("evidence-limited usable CV reaches review with a quality note", () => {
  const result = cvDepthIssue(output(7, 2359));
  assert.equal(result?.blocking, false);
  assert.match(result?.message ?? "", /additional verified experience/);
});
