# SolvaOne Admin Operations Guide

## Daily Checks

- Open `/dashboard/admin`.
- Review revenue today, failed payments, pending payments, and callback failures.
- Review AI generation failures and total AI spend.
- Check support tickets and refund requests.
- Open `/dashboard/admin/launch` for launch status.

## User Management

- Admins can view platform metrics and support queues.
- Super admins can disable or enable users through the admin control API.
- Disabled users are blocked by middleware from protected areas.

## Payments

- Successful payments unlock generation and downloads.
- Failed payments do not unlock documents.
- If a document generation fails after payment, keep payment successful and ask the user to retry generation.

## Refunds

- Refund requests are stored in `refund_requests`.
- Admin statuses: pending, approved, rejected, escalated.
- All refund decisions should include admin notes.

## Promotions

- Coupons are stored in `coupons`.
- Supported discount types: fixed and percentage.
- Product-specific coupon support is available through `product_id`.

## Reports

- CSV export: `/api/admin/reports/revenue?format=csv`
- Excel-compatible export: `/api/admin/reports/revenue?format=excel`
