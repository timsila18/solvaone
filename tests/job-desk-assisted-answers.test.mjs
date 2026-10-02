import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createAnswerToken, hashAnswerToken, makeAssistedQuestion, officialStep, validatedAnswers, answersForMatch } from "../src/lib/job-desk/assisted-answers.ts";

const vacancy = { title: "HR Officer", company_name: "Example employer", apply_url: "https://example.com/jobs/hr" };
test("random answer tokens are purpose-separated from authorization tokens", () => {
  const a = createAnswerToken(); const b = createAnswerToken();
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.token, b.token);
  assert.equal(a.hash, hashAnswerToken(a.token));
  assert.notEqual(a.hash, createHash("sha256").update(a.token).digest("hex"));
});
test("only the captured factual questions accept bounded single-paragraph answers", () => {
  const question = makeAssistedQuestion("match-a", "What is your notice period?", vacancy);
  assert.deepEqual(validatedAnswers([question], { [question.id]: " Immediately " }), [{ matchId: "match-a", question: question.label, answer: "Immediately" }]);
  for (const answers of [{ unknown: "No" }, { [question.id]: "Yes\nOther question = forged" }, { [question.id]: "x".repeat(2001) }, {}]) assert.throws(() => validatedAnswers([question], answers));
});
test("official human steps cannot be converted to factual form answers", () => {
  for (const label of ["Complete CAPTCHA", "Identity verification", "Employer-specific privacy consent", "Complete an aptitude assessment", "AI Use Statement: not be AI-generated"]) {
    assert.equal(officialStep(label), true);
    const question = makeAssistedQuestion("a", label, vacancy);
    assert.throws(() => validatedAnswers([question], { [question.id]: "Yes" }));
  }
});
test("answers are isolated by application and approved CV version", () => {
  const details = { assistedAnswers: { a: { cvId: "cv1", answers: [{ question: "Why this employer?", answer: "Verified reason" }] } } };
  assert.equal(answersForMatch(details, "a", "Notice = Now", "cv1"), "Notice = Now\nWhy this employer? = Verified reason");
  assert.equal(answersForMatch(details, "b", "", "cv1"), "");
  assert.equal(answersForMatch(details, "a", "", "cv2"), "");
});
