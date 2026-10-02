# Job Desk Answer Review

Applications with verified contact details and supported submission methods are
processed before answer-review work. Every sixth queue claim uses FIFO so intake,
discovery and client notifications are not permanently starved. Claims use atomic
conditional updates; expired leases recover with backoff and exhausted attempts fail.

## Administrator Flow

1. Upload and process the CV; check facts and approve the latest version.
2. Record payment and the client's application scope.
3. Run matching. Ready, suitable applications queue preparation automatically.
4. A bounded pool of five blocked supported vacancies gets a separate full-advert
   suitability review. Qualified matches with draftable questions queue answer drafts.
5. Open **Answer drafts awaiting your review** on the order page. Refresh drafts,
   inspect evidence, edit factual answers and confirm their accuracy.
6. Approve answers and continue. This saves answers for that application/CV and
   queues a fresh preflight; unanswered requirements still pause the application.
7. Inspect submission outcomes. Email-provider acceptance is not employer receipt.

Existing safely retryable matches can use **Prepare answer drafts** immediately.
After CV, question or saved-fact changes, use **Prepare fresh drafts**. Answers are
not shared indiscriminately across employers or reused after CV replacement.

## Guardrails

Drafts are never submission-ready answers until an administrator verifies them.
Each generated answer requires verbatim supporting candidate facts; missing facts
remain blank. Assessments, CAPTCHA, identity checks, employer declarations and
privacy acceptance stay outside factual approval. Explicit employer restrictions
against generated answers prevent drafting for that application.

Unknown/uncertain previous sends must not be retried. Approval does not override
payment, approved CV, active scope, vacancy freshness, suitability, supported
methods or duplicate-send controls. A queue failure preserves saved answers and
reports the need for an administrator retry rather than asking for another payment.

Runs reuse `job_desk_ai_runs` with operation `profile_refresh` and an explicit
`input_payload.purpose` of `application_answer_drafts`, and include
model, input/output token usage, estimated cost, validation failure and a fingerprint
of approved CV, facts, questions and advert. No additional migration is required.

## Tests

```powershell
node scripts/test-answer-draft-workflow.cjs
node scripts/test-assisted-answer-routes.cjs
node scripts/test-submission-preflight.cjs
node --experimental-strip-types --loader ./scripts/ts-test-resolver.mjs --test tests/job-desk-answer-drafts.test.mjs tests/job-desk-assisted-answers.test.mjs tests/job-desk-application-lane.test.mjs
npx tsc --noEmit --pretty false
```

These are deterministic tests, not live employer submissions. Verify an authorized
eligible pilot separately before claiming employer-confirmed end-to-end success.
