import test from "node:test";
import assert from "node:assert/strict";
import { hasVerifiedJobDeskPayment } from "../src/lib/job-desk/payment.ts";

test("a paid Job Desk order needs an amount and receipt reference", () => {
  assert.equal(hasVerifiedJobDeskPayment({ payment_status: "paid", amount: 0, payment_reference: null }), false);
  assert.equal(hasVerifiedJobDeskPayment({ payment_status: "paid", amount: 500, payment_reference: "" }), false);
  assert.equal(hasVerifiedJobDeskPayment({ payment_status: "paid", amount: "500.00", payment_reference: "MPESA-123" }), true);
});

test("an explicit waiver is eligible, but partial payment is not", () => {
  assert.equal(hasVerifiedJobDeskPayment({ payment_status: "waived", amount: 0, payment_reference: null }), true);
  assert.equal(hasVerifiedJobDeskPayment({ payment_status: "partially_paid", amount: 500, payment_reference: "MPESA-123" }), false);
});
