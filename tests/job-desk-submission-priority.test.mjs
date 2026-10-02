import assert from "node:assert/strict";
import test from "node:test";
import { compareSubmissionCandidates, submissionRouteRank } from "../src/lib/job-desk/submission-priority.ts";

test("verified email and supported portals precede unsupported high-score forms", () => {
  const candidates = [
    { score: 99, vacancy: { application_method: "portal", provider: "lever" } },
    { score: 80, vacancy: { application_method: "portal", provider: "greenhouse" } },
    { score: 25, vacancy: { application_method: "email", email_verified: true, application_email: "jobs@example.com" } },
  ];
  assert.deepEqual(candidates.sort(compareSubmissionCandidates).map(item => item.score), [25, 80, 99]);
});

test("unverified or empty email recipients never enter the automatic lane", () => {
  assert.equal(submissionRouteRank({ application_method: "email", email_verified: false, application_email: "jobs@example.com" }), 0);
  assert.equal(submissionRouteRank({ application_method: "email", email_verified: true, application_email: " " }), 0);
  assert.equal(submissionRouteRank({ application_method: "email", provider: "greenhouse" }), 0);
});

test("preparation has no ten-match truncation and still requires suitability review", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/lib/job-desk/automation.ts", import.meta.url), "utf8");
  const preparation = source.slice(source.indexOf("// Full-advert evidence review"), source.indexOf('await db.from("job_desk_orders").update'));
  assert.ok(preparation.includes("selected.has"));
  assert.ok(preparation.includes("routeRank(item) > 0"));
  assert.ok(!preparation.includes("slice(0, 10)"));
});
