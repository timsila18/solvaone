# SolvaOne Support Operations Guide

## Support Channels

- Contact form: `/contact`
- Authenticated tickets: `/dashboard/support`
- Admin ticket queue: `/dashboard/admin`

## Common Cases

### Payment Pending

- Check `payments.status`.
- Check `payment_events` for callback receipt.
- If M-Pesa was successful but callback delayed, wait and recheck before manual action.

### Generation Failed After Payment

- Do not ask the user to pay again.
- Confirm payment status is successful.
- Ask user to retry generation.
- Review `ai_generations` and `system_logs`.

### Download Blocked

- Confirm payment status is `successful` or `paid`.
- Confirm document belongs to the user.
- Retry PDF/DOCX export.

### Refund Request

- Review payment and document generation status.
- Approve only for duplicate payments or verified technical failure.
- Reject where document generation/download was successful.

## Ticket Priorities

- Low: general question.
- Normal: ordinary support.
- High: payment or generation issue.
- Urgent: confirmed payment with blocked document access.
