import test from "node:test";
import assert from "node:assert/strict";
import { observedDelivery } from "../src/lib/job-desk/email-delivery-state.ts";

test("provider delivery is recorded as an observation, not an employer acknowledgement", () => {
  const result = observedDelivery({ id: "email-id", last_event: "delivered", created_at: "old", html: "private" }, "email-id", null, "2026-10-03T00:00:00Z");
  assert.equal(result.event, "email.delivered");
  assert.equal(result.source, "provider_poll");
  assert.equal(result.at, "2026-10-03T00:00:00Z");
  assert.equal(result.html, undefined);
});
test("mismatched IDs and unverified events cannot confirm delivery", () => {
  assert.equal(observedDelivery({ id: "other", last_event: "delivered" }, "id", null, "now"), null);
  for (const event of ["opened", "clicked", "unknown"]) assert.equal(observedDelivery({ id: "id", last_event: event }, "id", null, "now"), null);
});
test("polling cannot downgrade or replace signed terminal evidence", () => {
  for (const event of ["email.delivered", "email.bounced", "email.failed", "email.complained"]) {
    const previous = { event, at: "old", eventId: "webhook-id" };
    assert.equal(observedDelivery({ id: "id", last_event: "sent" }, "id", previous, "now"), previous);
  }
});
