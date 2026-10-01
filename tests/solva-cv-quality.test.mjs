import assert from "node:assert/strict";
import test from "node:test";
import { cvDepthIssue, cvDepthStats, isUsableCv } from "../src/lib/solva-intelligence/cv-depth.ts";

const input = { product: "cv_revamp", mode: "full_document" };

function cv(sectionCount, bulletCount, wordsPerBullet) {
  const sentence = Array.from({ length: wordsPerBullet }, (_, index) => `fact${index}`).join(" ");
  return {
    sections: Array.from({ length: sectionCount }, (_, section) => ({
      id: `section_${section}`,
      title: `Section ${section}`,
      html: `<ul>${Array.from({ length: Math.ceil(bulletCount / sectionCount) }, () => `<li>${sentence}</li>`).join("")}</ul>`
    }))
  };
}

test("a substantive CV below the former fixed quotas is usable without a depth error", () => {
  const output = cv(11, 60, 14);
  const stats = cvDepthStats(output);
  assert.ok(stats.words < 1400);
  assert.ok(stats.textLength < 10500);
  assert.equal(isUsableCv(input, output), true);
  assert.equal(cvDepthIssue(input, output), null);
});

test("an evidence-limited CV remains usable and gets private guidance", () => {
  const output = cv(3, 6, 16);
  assert.equal(isUsableCv(input, output), true);
  assert.match(cvDepthIssue(input, output) ?? "", /without repeating duties or inventing facts/);
});

test("a nearly empty CV still needs a real response", () => {
  const output = { sections: [{ title: "Profile", html: "<p>Candidate</p>" }, { title: "Experience", html: "<p>Not supplied</p>" }] };
  assert.equal(isUsableCv(input, output), false);
});

test("CV depth rules do not apply to cover letters", () => {
  const output = { sections: [{ title: "Letter", html: "<p>Dear Hiring Manager</p>" }] };
  assert.equal(isUsableCv({ product: "cover_letter", mode: "full_document" }, output), true);
  assert.equal(cvDepthIssue({ product: "cover_letter", mode: "full_document" }, output), null);
});
