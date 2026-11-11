-- A&T Student Loans — migration 003. Run ONCE in the Supabase SQL editor (safe to re-run).
-- Works on a database created from ANY earlier schema.sql: it also adds everything migration 002 added.
-- Adds: applicant accounts, supporting-document storage, optional guarantor, admin edit audit trail,
--       and "one PENDING application at a time" (a new loan can be requested once the last one is replied to).

-- ---------------------------------------------------------------------------
-- Applicant accounts (was migration 002)
-- ---------------------------------------------------------------------------
ALTER TABLE public.loan_applications
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS loan_applications_user_id_idx ON public.loan_applications (user_id);

-- ---------------------------------------------------------------------------
-- New columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.loan_applications
    ADD COLUMN IF NOT EXISTS guarantor_name  TEXT,
    ADD COLUMN IF NOT EXISTS guarantor_phone TEXT,
    ADD COLUMN IF NOT EXISTS documents       JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{kind, path, contentType, size}]
    ADD COLUMN IF NOT EXISTS last_edited_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_edited_by  UUID REFERENCES auth.users (id);

ALTER TABLE public.loan_applications DROP CONSTRAINT IF EXISTS loan_applications_guarantor_phone_check;
ALTER TABLE public.loan_applications
    ADD CONSTRAINT loan_applications_guarantor_phone_check
    CHECK (guarantor_phone IS NULL OR guarantor_phone ~ '^\+267[0-9]{7,8}$');

-- ---------------------------------------------------------------------------
-- "Replied to" rule: only ONE pending application per Omang and per account.
-- Once the lender replies (approved / rejected / disbursed / repaid) the applicant may apply again.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.loan_applications_one_active_per_id;
CREATE UNIQUE INDEX IF NOT EXISTS loan_applications_one_pending_per_id
    ON public.loan_applications (id_number) WHERE status = 'PENDING';
CREATE UNIQUE INDEX IF NOT EXISTS loan_applications_one_pending_per_user
    ON public.loan_applications (user_id) WHERE status = 'PENDING' AND user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Applicant's own read-only view (adds status_updated_at = "replied on")
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.my_loan_applications AS
SELECT id, created_at, loan_amount_requested, loan_purpose, status, status_updated_at
FROM public.loan_applications
WHERE user_id = auth.uid();

REVOKE ALL ON public.my_loan_applications FROM anon, authenticated;
GRANT SELECT ON public.my_loan_applications TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin edit audit trail (written only by the server with the service-role key)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_edits (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES public.loan_applications (id) ON DELETE CASCADE,
    edited_by      UUID REFERENCES auth.users (id),
    edited_by_email TEXT,
    edited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changes        JSONB NOT NULL            -- { "full_name": {"from": "...", "to": "..."}, ... }
);
CREATE INDEX IF NOT EXISTS application_edits_application_idx ON public.application_edits (application_id, edited_at DESC);

ALTER TABLE public.application_edits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.application_edits FROM anon, authenticated;
GRANT SELECT ON public.application_edits TO authenticated;

DROP POLICY IF EXISTS "Admins can read edit history" ON public.application_edits;
CREATE POLICY "Admins can read edit history"
ON public.application_edits FOR SELECT TO authenticated
USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- Private bucket for supporting documents (bank statement, Omang, letters, student ID)
-- Uploads happen through short-lived signed upload URLs issued by the API route.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'application-documents', 'application-documents', FALSE, 10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

DROP POLICY IF EXISTS "Admins can read application documents" ON storage.objects;
CREATE POLICY "Admins can read application documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'application-documents' AND public.is_admin());

-- ---------------------------------------------------------------------------
-- Check (run after the migration; every line should say true / have rows)
-- ---------------------------------------------------------------------------
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'loan_applications'
--   AND column_name IN ('user_id','documents','guarantor_name','guarantor_phone','last_edited_at');   -- 5 rows
-- SELECT id, public FROM storage.buckets WHERE id IN ('signed-documents','application-documents'); -- both public = false
