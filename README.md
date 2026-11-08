# AAndTee Loans

Next.js 14 loan application site: public form → server-built signed PDF → private Supabase Storage → admin review dashboard → optional WhatsApp notification.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in.
3. In the Supabase SQL editor run `schema.sql` (creates the table, RLS, the **private** `signed-documents` bucket and storage policy). If you already ran an earlier version, run `migration_002_accounts.sql` instead (adds applicant accounts).
   - In Supabase **Authentication → URL Configuration**, set *Site URL* to your site (e.g. `http://localhost:3000` while testing) and add `/reset-password` and `/` on that domain to *Redirect URLs*.
   - Applicants must confirm their email. For quick local testing you can turn off *Authentication → Providers → Email → Confirm email*. Supabase's built-in email sender is rate-limited; use custom SMTP (e.g. Resend, Brevo) before launch.
4. Create an admin user in Supabase Auth, then grant the role:
   ```sql
   UPDATE auth.users
   SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   WHERE email = 'you@example.com';
   ```
   The admin signs in at `/admin` (sign out and in again after the role is granted).
5. Optional: put `logo.png` or `logo.jpg` in `public/`. It is used in PDF headers; without it the lender name is printed as text.
6. `npm run dev`

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## How it works

| Piece | File |
|---|---|
| Shared validation (Omang, +267 phones, 18+, limits) | `lib/validation.ts` |
| Submit endpoint: rate limit, CAPTCHA, validate, build PDF, upload, insert, notify | `app/api/submit-loan/route.ts` |
| Server-side PDF (wrapping, pagination, unicode-safe, audit footer) | `lib/pdf-generator.ts` |
| Agreement wording (shared by form and PDF) | `lib/terms.ts` |
| Applicant sign in / sign up, then apply | `app/page.tsx`, `app/apply/page.tsx`, `components/AuthForm.tsx` |
| Admin dashboard (RLS-protected, signed PDF links, status changes) | `app/admin/page.tsx` |

Security model: the public never touches the database or bucket. The API route uses the service-role key; admins use the anon key plus RLS (`app_metadata.role = 'admin'`). PDFs are only reachable through short-lived signed URLs.

## Before going live

- **Have a Botswana lawyer review `lib/terms.ts`**, then bump `TERMS_VERSION` in `lib/config.ts` when it changes. Interest, fees and repayment dates are intentionally left to the written loan offer.
- Enable **Cloudflare Turnstile** (set both keys). Without them CAPTCHA is skipped.
- The rate limiter is in-memory and per instance. For strict limits on serverless, use Upstash Redis or Vercel KV (`lib/rate-limit.ts`).
- **WhatsApp:** free-form document messages only deliver if the admin messaged your business number in the last 24 h. Create an approved template with a document header and 3 body variables and set `WHATSAPP_TEMPLATE_NAME`. A WhatsApp failure never fails the applicant's submission; check `whatsapp_notified_at` in the dashboard.
- Set `NEXT_PUBLIC_LOAN_MIN` / `NEXT_PUBLIC_LOAN_MAX` to your real limits (defaults P500–P20,000).
- Consider a retention policy for applications and PDFs, as required under data-protection law.
