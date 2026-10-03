import assert from "node:assert/strict";
import test from "node:test";
import { APPLICATION_TARGET, SHORTLIST_TARGET, occupiesApplicationSlot, reviewedShortlist, screeningBatch } from "../src/lib/job-desk/match-shortlist.ts";

test("twenty distinct reviewed candidates are ranked for a ten-application target", () => {
  const candidates = Array.from({ length: 30 }, (_, i) => ({ score: i, vacancy: { id: String(i), application_method: "email", email_verified: true, application_email: "jobs@example.com" } }));
  const shortlist = reviewedShortlist([...candidates, candidates[29]]);
  assert.equal(SHORTLIST_TARGET, 20);
  assert.equal(APPLICATION_TARGET, 10);
  assert.equal(shortlist.length, 20);
  assert.equal(new Set(shortlist.map(item => item.vacancy.id)).size, 20);
  assert.equal(shortlist[0].score, 29);
  assert.equal(shortlist.slice(0, APPLICATION_TARGET).length, 10);
});

test("a short genuine pool stays short rather than inventing twenty matches", () => {
  assert.equal(reviewedShortlist([]).length, 0);
  assert.equal(reviewedShortlist([{ score: 42, vacancy: { id: "real", application_method: "portal", provider: "lever" } }]).length, 1);
});

test("confirmed or in-progress work reserves slots; known unsent blockers and bounces allow backups", () => {
  const match = { id: "match", status: "suggested" };
  const queued = new Set(["match"]);
  assert.equal(occupiesApplicationSlot(match, queued), true);
  for (const status of ["preparing", "ready", "authorized"]) assert.equal(occupiesApplicationSlot({ ...match, status }, new Set()), true);
  assert.equal(occupiesApplicationSlot({ ...match, application: [{ status: "submitted", provider_message_id: "accepted" }] }, new Set()), true);
  assert.equal(occupiesApplicationSlot({ ...match, application: { status: "submitted", provider_response: { confirmation: "Employer receipt" } } }, new Set()), true);
  assert.equal(occupiesApplicationSlot({ ...match, application: { status: "sending" } }, new Set()), true);
  assert.equal(occupiesApplicationSlot({ ...match, application: { status: "needs_human", provider_response: { clicked: true } } }, new Set()), true);
  assert.equal(occupiesApplicationSlot({ ...match, application: { status: "needs_human", provider_response: { clicked: false } } }, new Set()), false);
  assert.equal(occupiesApplicationSlot({ ...match, application: { status: "submitted" } }, new Set()), false);
  assert.equal(occupiesApplicationSlot({ ...match, application: { status: "submitted", provider_message_id: "bounced", provider_response: { delivery: { event: "email.bounced" } } } }, new Set()), false);
});

test("bounded preflight rotates lower-ranked candidates while retaining the strongest", () => {
  const candidates = Array.from({ length: 120 }, (_, i) => i);
  const first = screeningBatch(candidates, 0);
  const second = screeningBatch(candidates, 1);
  assert.equal(first.length, 64);
  assert.equal(new Set(first).size, 64);
  assert.deepEqual(first.slice(0, 48), second.slice(0, 48));
  assert.notDeepEqual(first.slice(48), second.slice(48));
  const seen = new Set(Array.from({ length: 5 }, (_, window) => screeningBatch(candidates, window)).flat());
  assert.equal(seen.size, 120);
});
