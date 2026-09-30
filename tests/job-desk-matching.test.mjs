import assert from "node:assert/strict";
import test from "node:test";
import { scoreVacancy } from "../src/lib/job-desk/matching.ts";

test("remote role with matching skills ranks ahead of unrelated onsite role", () => {
  const profile = { target_job_titles: ["Data Engineer"], preferred_locations: ["Nairobi"], remote_preference: "remote", structured_profile: { skills: ["Python", "SQL", "Kafka"] } };
  const strong = scoreVacancy({ title: "Senior Data Engineer", description: "Build Python, SQL and Kafka pipelines", location: "Remote", workplace_type: "remote" }, profile);
  const weak = scoreVacancy({ title: "Retail Cashier", description: "In-store checkout", location: "Mombasa", workplace_type: "onsite" }, profile);
  assert.ok(strong.score >= 60);
  assert.ok(weak.score < 40);
  assert.ok(strong.score > weak.score);
});

test("missing target role is visible as a gap", () => {
  const result = scoreVacancy({ title: "Accountant", description: "Bookkeeping", location: "Nairobi", workplace_type: "onsite" }, {});
  assert.ok(result.gaps.some((gap) => gap.includes("target role")));
  assert.equal(result.score, 0);
});
