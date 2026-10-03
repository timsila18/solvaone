# Job Hunting delivery target

The service target is ten distinct applications with delivery evidence. It is not
a guarantee that ten qualifying vacancies exist at a given moment.

## Search lanes

- Career titles and equivalent wording always run within the recorded scope.
- Adjacent career groups run only when `includeAdjacentRoles` is explicitly enabled.
  These candidates still require documented transferable skills and full-advert review.
- Named broader roles and selected general-job families run simultaneously when accepted.
- Kenya-wide intake replaces city preferences only when explicitly selected. It does
  not override remote-only work, employer exclusions, licences or work eligibility.
- Recruiter discovery shares its bounded crawl budget across career categories and
  rotates links between two-hour windows. No new source is crawled without approval.

## Delivery and recovery

The existing durable worker preflights routes, prepares tailored documents, submits
supported applications, and reconciles provider evidence. Prepared packets and sender
acceptance are not successful deliveries. Confirmed failures permit replacement searches;
uncertain attempts retain their guarded slots to prevent duplicate applications.

Under-target recovery keeps approved, paid, authorized searches active. Completion
requires ten unique match IDs with successful delivery evidence. Admin review includes
partially delivered orders and prioritizes zero-delivery clients.

The Supabase scheduler invokes the worker every five minutes. Configure its HTTP
timeout to 300000ms via `node scripts/setup-job-desk-cron.mjs --schedule-only`.
`node scripts/check-job-desk-cron.mjs` checks HTTP outcomes as well as cron invocation;
a cron success without an HTTP response is not proof of worker completion.

## Remaining operational requirements

Employer partnerships, additional permitted Kenyan vacancy sources and broader supported
portal adapters still need onboarding. The existing email/portal routes are reused;
this change does not install a universal browser worker or bypass human checks.
Existing orders retain their original scope until an authorized update is recorded.
Measure ten-delivery completion and time-to-first-delivery with live evidence before
advertising guaranteed coverage. No fabricated vacancies, qualifications or confirmations.
