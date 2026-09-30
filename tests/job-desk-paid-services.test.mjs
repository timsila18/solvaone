import test from "node:test";
import assert from "node:assert/strict";
import { getJobDeskService } from "../src/lib/job-desk/services.ts";
import { validateJobDeskCallback } from "../src/lib/job-desk/payment-validation.ts";

test("public Job Desk service prices are fixed server-side", () => {
  assert.equal(getJobDeskService("job_search_full")?.price, 1500);
  assert.equal(getJobDeskService("interview_coaching")?.price, 1000);
  assert.equal(getJobDeskService("linkedin_revamp")?.price, 1000);
  assert.equal(getJobDeskService("unknown"), null);
});

test("M-Pesa success requires the expected amount, phone and receipt", () => {
  const expected = { amount: 1500, phone_number: "254721537597" };
  const callback = { ResultCode: 0, CallbackMetadata: { Item: [{ Name: "Amount", Value: 1500 }, { Name: "PhoneNumber", Value: 254721537597 }, { Name: "MpesaReceiptNumber", Value: "SG12345678" }] } };
  assert.equal(validateJobDeskCallback(callback, expected).status, "successful");
  assert.equal(validateJobDeskCallback({ ...callback, CallbackMetadata: { Item: [{ Name: "Amount", Value: 1000 }] } }, expected).status, "needs_review");
  assert.equal(validateJobDeskCallback({ ResultCode: 1032 }, expected).status, "cancelled");
  assert.equal(validateJobDeskCallback({ ResultCode: 1037 }, expected).status, "timed_out");
});
