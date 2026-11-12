# Implementation plan — v2.2 (polish, small features, codebase hygiene)

Analysis: Next.js 14 (App Router) + Supabase. Browser reads go through RLS / the `my_loan_applications` view; every write goes
through an API route using the service-role key. Shared rules live in `lib/`. **No database migration is needed for v2.2.**

Findings that drove the plan
- PLAN/README referred to `lib/status.ts`, which did not exist; status labels lived in a component and the 8-character reference was
  re-implemented in 8 places.
- The long apply form lost everything on refresh; no way to see progress of an application; admin list had no sorting, no money summary,
  no ageing signal and rendered every row at once; sign-up had no password visibility toggle.
- Missing basics: per-page titles, favicon/manifest, skip link, loading state, health probe, print view, public "how it works".

Implemented
1. `lib/status.ts`: labels, hints, plain-language help, `shortRef`, timeline model, waiting/stale helpers (used everywhere the reference was duplicated).
2. Applicant: progress timeline + "what happens next" on the application page, at-a-glance tiles and per-row hints on the dashboard, Print / Save as PDF.
3. Apply form: draft autosave (`lib/draft.ts`: whitelisted non-sensitive fields only, 7-day expiry, per account, cleared on submit), restore banner with
   Discard, tap-to-fill amounts (min / mid / max), warning before leaving with an unsaved signature or fresh uploads.
4. Auth: show/hide password and a strength meter on sign-up. Home page: How it works + FAQ (driven by the configured loan limits).
5. Admin: sort (newest, oldest, amount, name), money summary (awaiting / approved / out on loan / repaid), "waiting N days" badge and a stale banner
   (3+ days), "Show more" paging (25 at a time), WhatsApp click-to-chat links (wa.me, no API needed).
6. Platform: per-page titles, favicon + web manifest, theme colour, skip-to-content link, global loading state, `/api/health`, print stylesheet, `/profile` in robots disallow.
7. Tests: status, stats/sorting, WhatsApp link, password strength, draft privacy and expiry (71 tests total).

Ideas for later: real WhatsApp sending, Upstash rate limiting, email notification on status change, applicant notification preferences, audit export for admins.
