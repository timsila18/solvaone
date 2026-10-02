import assert from "node:assert/strict";
import test from "node:test";
import { screenAutomaticCandidates } from "../src/lib/job-desk/automatic-screen.ts";

test("blocked forms and failed checks do not prevent later ready applications", async () => {
  const candidates = [...Array.from({ length: 12 }, (_, id) => ({ id, kind: "blocked" })), { id: 12, kind: "unavailable" }, { id: 13, kind: "email" }, { id: 14, kind: "simple_portal" }];
  const visited = [];
  const result = await screenAutomaticCandidates(candidates, async candidate => {
    visited.push(candidate.id);
    if (candidate.kind === "unavailable") throw new Error("Timeout");
    return { ready: candidate.kind !== "blocked", blockers: candidate.kind === "blocked" ? ["Missing factual example"] : [] };
  });
  assert.equal(visited.length, 15);
  assert.deepEqual(result.ready.map(item => item.id), [13, 14]);
  assert.equal(result.skipped.length, 13);
  assert.match(result.skipped.at(-1).reason, /deferred without submission/);
});

test("empty or wholly blocked results never authorize an application", async () => {
  assert.deepEqual(await screenAutomaticCandidates([], async () => ({ ready: true, blockers: [] })), { ready: [], skipped: [] });
  const result = await screenAutomaticCandidates([1], async () => ({ ready: false, blockers: ["Certificate required"] }));
  assert.deepEqual(result.ready, []);
  assert.equal(result.skipped[0].reason, "Certificate required");
});
