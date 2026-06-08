# SolvaOne Launch Checklist

## Environment Variables

- NEXT_PUBLIC_SITE_URL
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SECRET_KEY
- OPENAI_API_KEY
- OPENAI_MODEL
- DATABASE_URL
- DIRECT_URL
- DARAJA_CONSUMER_KEY
- DARAJA_CONSUMER_SECRET
- DARAJA_SHORTCODE
- DARAJA_PASSKEY
- DARAJA_CALLBACK_URL
- DARAJA_ENV

## Supabase Setup

- Apply all migrations in order from `supabase/migrations`.
- Confirm RLS is enabled on all public tables.
- Confirm `users.role` supports `user`, `admin`, and `super_admin`.
- Promote one trusted owner account to `super_admin`.
- Confirm Auth email verification is enabled.
- Configure password reset redirect URL: `https://solvaone.co.ke/reset-password`.

## OpenAI Setup

- Confirm `OPENAI_API_KEY` is production scoped.
- Confirm `OPENAI_MODEL` is set.
- Test paid generation on a small document.
- Check `ai_generations` token and cost records.

## Daraja Setup

- Confirm Daraja environment is `live` for production.
- Confirm callback URL: `https://solvaone.co.ke/api/mpesa/callback`.
- Run a low-value STK push test.
- Confirm callback creates `payment_events` and updates `payments.status`.

## Domain Setup

- Apex A record: `76.76.21.21`.
- `www` CNAME: `cname.vercel-dns-0.com`.
- Remove old A and AAAA records.
- Confirm Vercel domain status and SSL certificate.

## Production Testing

- Visit homepage.
- Register and verify email.
- Login.
- Create project.
- Pay by M-Pesa.
- Generate document.
- Edit and save version.
- Download PDF, DOCX, and receipt.
- Submit support ticket.
- Review admin dashboard and launch dashboard.
