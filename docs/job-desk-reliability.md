# Job Desk Operations

## Supported workflow

Upload a CV, record verified payment, preferences, reusable factual answers and scoped authorization. Prepare and approve the latest CV. The queue discovers reviewed open vacancies, checks suitability, prepares a concise fact-reviewed letter, and submits through verified employer email or a supported Greenhouse browser adapter. Unsupported requirements enter the administrator review queue. Do not invent personal answers, solve assessments on the client's behalf, or bypass identity/CAPTCHA checks.

One application row acts as a compare-and-set send lock. Provider acceptance, mail-server delivery and portal confirmation are different outcomes. Interrupted or ambiguous submissions require evidence before retrying. Successful submissions are never automatically sent again.

## Delivery Webhook Setup

In Resend, add `https://solvaone.co.ke/api/job-desk/email-events` for email.sent, email.delivered, email.delivery_delayed, email.bounced, email.failed and email.complained. Store its signing secret as `RESEND_WEBHOOK_SECRET` in Vercel production and redeploy. This route verifies signed raw payloads, timestamps and event ordering. It records employer delivery and queues client updates to the client email saved on the order. Client-update delivery is tracked separately in task results. A provider acceptance is not proof of employer review.

## Background Processing

The authenticated worker endpoint is `/api/job-desk/worker`; use `Authorization: Bearer <CRON_SECRET>` from a hosted scheduler every five minutes. The existing Supabase cron setup script uses a Vault secret named `job_desk_cron_secret`. Verify the live cron job and HTTP results before relying on it. The daily Vercel cron is only a fallback, not sufficient for timely processing. Do not put scheduler credentials in source control.

## Testing

Run `node scripts/test-job-desk-reliability.cjs`, `node scripts/test-job-desk-email.cjs`, `node scripts/test-submission-preflight.cjs`, `npm run typecheck` and `npm run build`. Live employer submissions are not test traffic. Use a controlled test recipient and signed webhook event to validate delivery after configuration.
