# Application delivery verification

Supported automatic routes: verified employer email, supported Greenhouse forms,
and simple hosted Lever forms. Qualification, location, open-vacancy, payment,
scope and approved-CV checks still apply. Lever custom questions are inspected
on the hosted form; its postings API does not expose them. Required privacy
choices, unknown answers, autocomplete selections, CAPTCHA, assessments and
identity steps remain held. No unsupported facts are invented.

The scheduled worker adds missing catalogue sources without re-enabling sources
an administrator disabled. Acumen's public board was checked on 2026-10-03 and
included a Nairobi vacancy. Availability and candidate eligibility are rechecked
before applications; this is not a guarantee of ten suitable openings.

## Check accepted emails

On the administrator Job Desk page, use **Check application delivery**. This
queries up to five existing Resend message IDs and shows aggregate evidence for
the latest 500 accepted email applications. It never resends an application.

The GitHub Queue Recovery workflow has a `delivery` dispatch mode for the same
check, using the existing worker secret. Routine scheduling polls due records.
Resend must permit email retrieval. Sending-only keys report a configuration
block; they do not unlock retries. Signed webhook terminal evidence is retained.
Client-update queue keys are idempotent, including after notification outages.

Provider acceptance is not employer receipt. Verified email delivery means the
recipient mail server accepted the message, not that a recruiter read it.
Portal submission needs visible employer confirmation. An uncertain click is
never retried automatically.

## Verification

Run `node scripts/test-lever-adapter.cjs --live` for fixture/simulated browser
tests and a read-only live form check. This does not make a real submission.
The delivery-only workflow verifies production provider permissions and existing
email evidence without sending a new employer application. A complete live
upload-to-employer-confirmation test still requires an eligible vacancy and
approved candidate facts; do not substitute a queue success count for evidence.
