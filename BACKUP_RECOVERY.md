# SolvaOne Backup and Recovery

## Protected Data

- Users
- Projects
- Documents
- Document versions
- Payments
- Payment events
- AI generations
- Support tickets
- Refund requests

## Backup Strategy

- Enable Supabase point-in-time recovery if available on the active plan.
- Export logical backups before major migrations.
- Keep migrations committed and ordered in `supabase/migrations`.
- Keep template assets in Git and object/document sources in the repository.

## Recovery Procedure

1. Stop new writes if a serious incident is active.
2. Identify affected tables and time window.
3. Restore from Supabase PITR or latest backup.
4. Re-apply migrations if needed.
5. Verify auth, projects, payments, documents, and downloads.
6. Log the incident in `system_logs`.

## Routine Failure Protection

- M-Pesa callbacks are idempotent.
- Paid users can retry generation after AI failure.
- Document versions preserve autosaved content.
- Admin exports provide revenue audit backups.
