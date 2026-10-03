import assert from "node:assert/strict";
import test from "node:test";
import { distinctSuccessfulDeliveries } from "../src/lib/job-desk/application-progress.ts";
import { underTargetDeliveryReview } from "../src/lib/job-desk/delivery-review.ts";

const order = { created_at: "2026-10-01T00:00:00Z", status: "active", payment_status: "paid", amount: 1500, payment_reference: "verified", application_authorized: true, service_details: {} };
const delivered = id => ({ match_id: id, status: "submitted", method: "email", provider_message_id: id, provider_response: { delivery: { event: "email.delivered" } } });

test("duplicate delivery records and accepted sends cannot meet a ten-position target", () => {
  assert.equal(distinctSuccessfulDeliveries([delivered("one"), delivered("one"), { ...delivered("two"), provider_response: null }]), 1);
  const review = underTargetDeliveryReview(order, [delivered("one")]);
  assert.equal(review.delivered, 1);
  assert.equal(review.remaining, 9);
  assert.equal(review.overdue, true);
});

test("ten distinct deliveries meet the target while paused and unpaid orders remain held", () => {
  assert.equal(underTargetDeliveryReview(order, Array.from({ length: 10 }, (_, i) => delivered(String(i)))), null);
  assert.equal(underTargetDeliveryReview({ ...order, status: "paused" }, []), null);
  assert.equal(underTargetDeliveryReview({ ...order, payment_status: "pending" }, []), null);
});
