import assert from "node:assert/strict";
import test from "node:test";
import { discoveryWindow, renewTaskLease } from "../src/lib/job-desk/worker-lifecycle.ts";

test("discovery deduplicates within two hours and refreshes in the next window", () => {
  assert.equal(discoveryWindow(0), discoveryWindow(7199999));
  assert.notEqual(discoveryWindow(0), discoveryWindow(7200000));
});

test("heartbeat executes the lazy database query and retains ownership predicates", async () => {
  const predicates = [];
  let executed = false;
  const query = {
    update(value) { assert.ok(Date.parse(value.lease_until) > Date.now()); return this; },
    eq(key, value) { predicates.push([key, value]); return this; },
    then(resolve) { executed = true; resolve({ error: null }); }
  };
  await renewTaskLease({ from(name) { assert.equal(name, "job_desk_tasks"); return query; } }, "task", "worker");
  assert.equal(executed, true);
  assert.deepEqual(predicates, [["id", "task"], ["locked_by", "worker"], ["status", "running"]]);
});

test("heartbeat surfaces database failures", async () => {
  const query = { update() { return this; }, eq() { return this; }, then(resolve) { resolve({ error: { message: "Unavailable" } }); } };
  await assert.rejects(renewTaskLease({ from() { return query; } }, "task", "worker"), /Unavailable/);
});
