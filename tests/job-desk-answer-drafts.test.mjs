import assert from "node:assert/strict";
import test from "node:test";
import { parseAnswerDrafts, draftFingerprint, draftableQuestions, prohibitsAnswerDrafting } from "../src/lib/job-desk/answer-drafts.ts";
import { applicationLane } from "../src/lib/job-desk/application-lane.ts";
import { taskPriority } from "../src/lib/job-desk/task-priority.ts";
const question = "Describe your payroll experience";
const facts = "Processed payroll for 6,000 employees using Excel. Bachelor degree in progress.";
const supported = { question, answer: "I processed payroll for 6,000 employees using Excel.", evidence: ["Processed payroll for 6,000 employees using Excel."], missing: "" };
test("draft parser accepts supported evidence, rejects invented citations and unknown questions", () => {
  assert.equal(parseAnswerDrafts(JSON.stringify({ answers: [supported] }), [question], facts)[0].answer, supported.answer);
  for (const invalid of [{ ...supported, evidence: ["Invented sales result"] }, { ...supported, evidence: [] }, { ...supported, question: "unknown" }, { ...supported, missing: "Unconfirmed fact" }, { ...supported, answer: "Answer\nConsent = Yes" }]) assert.throws(() => parseAnswerDrafts(JSON.stringify({ answers: [invalid] }), [question], facts));
});
test("unknown facts stay blank and official steps never become drafts", () => {
  const missing = { question, answer: "", evidence: [], missing: "Need actual payroll experience" };
  assert.equal(parseAnswerDrafts(JSON.stringify({ answers: [missing] }), [question], facts)[0].answer, "");
  assert.deepEqual(draftableQuestions([question, "CAPTCHA", "Privacy consent", "Identity verification", "Complete assessment"]), [question]);
  assert.equal(prohibitsAnswerDrafting("Answers should not be AI-generated. Reflect your own thinking and personal experiences."), true);
});
test("review fingerprint changes with CV, facts, questions or employer", () => {
  const original = draftFingerprint("cv1", "m1", facts, [question], "Employer1");
  for (const args of [["cv2", "m1", facts, [question], "Employer1"], ["cv1", "m2", facts, [question], "Employer1"], ["cv1", "m1", "new facts", [question], "Employer1"], ["cv1", "m1", facts, ["new question"], "Employer1"]]) assert.notEqual(draftFingerprint(...args), original);
});
test("review tier never catches uncertain or submitted outcomes", () => {
  const match = { status: "needs_human", application: { status: "needs_human", provider_response: { clicked: false, preflight: { blockers: [question] } } } };
  assert.equal(applicationLane(match), "review");
  assert.equal(applicationLane({ ...match, application: { ...match.application, provider_response: { clicked: true } } }), "confirmation");
  assert.equal(applicationLane({ ...match, application: { status: "submitted" } }), "confirmation");
  assert.equal(applicationLane({ status: "needs_human", application: { status: "needs_human", provider_response: { clicked: false, preflight: { blockers: ["Complete CAPTCHA"] } } } }), "assisted");
});
test("submission and preflight retry precede draft work, discovery and notifications", () => {
  for (const task of ["submit", "prepare", "resume_assisted"]) assert.equal(taskPriority(task), 0);
  for (const task of ["draft_answers", "review_matches"]) assert.equal(taskPriority(task), 1);
  assert.equal(taskPriority("discover"), 2);
});
