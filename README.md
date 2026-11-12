# AAndTee Loans

Next.js 14 loan application site: public form → server-built signed PDF → private Supabase Storage → admin review dashboard → optional WhatsApp notification.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in.
3. In the Supabase SQL editor run `schema.sql` (creates the table, RLS, the **private** `signed-documents` bucket and storage policy). `schema.sql` is the complete, current schema (it already contains the changes from migrations 003-005), so a fresh project only needs that file.
   - Then run `migration_004_proof_whatsapp_profiles.sql` (safe to re-run; adds WhatsApp number, proof of payment, profiles and the user-file read policy). Fresh installs run `schema.sql` first, then migration 004.
   - Then run `migration_005_cancel_documents_staff.sql` (safe to re-run; adds the CANCELLED status, `documents` in the applicant view and `profiles.is_staff`). `schema.sql` already contains it at the end.
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
- Set `NEXT_PUBLIC_LOAN_MIN` / `NEXT_PUBLIC_LOAN_MAX` to your real limits (defaults P100–P200).
- Consider a retention policy for applications and PDFs, as required under data-protection law.


## v2.2: polish and small features (no migration)

| Piece | What |
|---|---|
| `lib/status.ts` | Status labels, hints, help text, `shortRef`, timeline, waiting / stale helpers |
| `lib/stats.ts` | Admin money summary and sorting |
| `lib/draft.ts` | Apply-form draft autosave (non-sensitive fields only, per account, 7-day expiry; Omang, income, signature and files are never stored) |
| `lib/whatsapp-link.ts` | `wa.me` click-to-chat links for admins (separate from the not-yet-built WhatsApp API sending) |
| Application page | Progress timeline, next-step help, Print / Save as PDF |
| Admin | Sort, money tiles, "waiting N days" and stale banner, paging |
| Platform | Per-page titles, icon + manifest, skip link, `/api/health` (200 when Supabase env vars are set, 503 otherwise) |

## Pages

| Route | Who | What |
|---|---|---|
| `/` | everyone | Sign in / create account |
| `/dashboard` | applicant | Current and past applications; **Apply for another loan** unlocks once the lender has replied (status is no longer PENDING) |
| `/apply` | applicant | Application form, 5 supporting documents (bank statement, Omang front/back, registration letter, student ID), consent and signature |
| `/admin` | admin | Review, **edit all applicant details** (not the signature/PDF), view the signed PDF and every uploaded document, change status, see edit history |

Supporting documents go straight from the browser to the private `application-documents` bucket through a short-lived signed upload URL (`/api/upload-url`); admins read them through signed links. Admin edits go through `/api/admin/applications/[id]` and are written to `application_edits`.


## Proof of payment, profiles and warnings (migration 004)

| Route / piece | What |
|---|---|
| `/dashboard/applications/[id]` | Applicant opens an application. Only while it is **APPROVED** can they upload, replace or remove proof of payment (images or PDF, **max 3**). Nothing else on the application is editable. |
| `/api/applications/[id]/proofs` | One route for sign / attach / replace / remove / view. Owner-only for applicants, any application for admins. The 3-file limit and status rule are also enforced inside Postgres (`add_proof_of_payment` etc.). |
| `/profile` | Everyone (admins too). Applicants: picture, names, Omang, address, phones, next of kin and the 5 loan documents. Admins: picture, name, phone, WhatsApp, address. |
| Apply form | Prefilled from the profile; saved documents are preselected ("From my profile") and can be replaced per application or restored with **Use saved**. Blank profile fields are filled from each submitted application (never overwritten). Optional WhatsApp number with a "same as my Pay2Cell number" box. |
| Admin → Applications | Add / replace / remove proofs on any application, edit the WhatsApp number, and **Send payment warnings**: one custom message to every APPROVED application with no proof and a WhatsApp number. |
| Admin → Users | Search by name, Omang, phone, WhatsApp, email or application reference. See profile, saved documents (view only) and full application history; edit personal details (audited in `profile_edits`), never documents. |

**WhatsApp is not integrated.** `lib/whatsapp.ts` → `sendWhatsAppText` is a stub that returns `not_integrated`; set `WHATSAPP_MESSAGING_INTEGRATED = true` after implementing it (use an approved template: warnings are business-initiated). Warnings are never stored: there is no message history.

Old files are never deleted when a profile document is replaced, because earlier applications may still point at them.


## v2.1: cancel, application documents, admin self-profile (migration 005)

| Piece | What |
|---|---|
| Cancel | `POST /api/applications/[id]/cancel`. Owner only, **only while PENDING (Awaiting reply)**; one conditional UPDATE sets the status to **CANCELLED**. The applicant may then apply again. Confirmation step on `/dashboard/applications/[id]`. |
| Application page | Shows the signed PDF (`GET /api/applications/[id]/pdf`, owner-only short-lived link) and all five attached documents, **view only**. Proof of payment remains the only editable item (APPROVED only). |
| Admin profile | `/profile` for admins now includes Omang, date of birth, institution / employer and all next-of-kin fields. Monthly allowance / income is shown as **Confidential**, read-only, and never stored (`profiles.is_staff`; also enforced in `PUT /api/profile` and the admin edit route). |
| Admin dashboard | Clickable status tiles (filter) and **Export CSV** of the listed applications (formula-safe). |
| Small things | Copy-reference button, status-aware notices, `not-found` and `error` pages, shared API helpers in `lib/api.ts`. |
