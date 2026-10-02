import assert from "node:assert/strict";
import test from "node:test";
import { applicationLane } from "../src/lib/job-desk/application-lane.ts";

test("authorized applications continue independently of blocked applications", () => {
  assert.equal(applicationLane({ status: "authorized" }), "automatic");
  assert.equal(applicationLane({ status: "needs_human", application: { status: "needs_human", provider_response: { clicked: false } } }), "assisted");
  assert.equal(applicationLane({ status: "ready" }), "assisted");
});
test("accepted or uncertain submissions never appear as automatic retries", () => {
  for (const status of ["sending", "submitted"]) assert.equal(applicationLane({ status: "authorized", application: { status } }), "confirmation");
  assert.equal(applicationLane({ status: "needs_human", application: { status: "needs_human", provider_response: { clicked: true } } }), "confirmation");
  assert.equal(applicationLane({ status: "authorized", application: { status: "failed" } }), "assisted");
});
