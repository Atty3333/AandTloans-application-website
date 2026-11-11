'use client';

import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Send, AlertCircle } from 'lucide-react';
import { DocFooter, DocHeader } from '@/components/BrandHeader';
import DocumentUpload, { type UploadedDocument } from '@/components/DocumentUpload';
import Field from '@/components/Field';
import SignatureCanvas from '@/components/SignatureCanvas';
import TurnstileWidget from '@/components/TurnstileWidget';
import { CONSENT_LABEL, CONSENT_PARAGRAPHS, FORM_TITLES, KIN_DECLARATION, KIN_NOTICE } from '@/lib/terms';
import { CONTACT_EMAIL, LOAN_MAX, LOAN_MIN } from '@/lib/config';
import { DOCUMENT_SPECS, type DocumentKind } from '@/lib/documents';
import { uploadDocument } from '@/lib/upload-client';
import { applicationSchema, fieldErrors } from '@/lib/validation';
import { createClient } from '@/lib/supabase-browser';

const INITIAL = {
  fullName: '',
  dob: '',
  idNumber: '',
  phone: '',
  email: '',
  address: '',
  institution: '',
  income: '',
  loanAmount: '',
  loanPurpose: '',
  guarantorName: '',
  guarantorPhone: '',
  kinName: '',
  kinRelationship: '',
  kinId: '',
  kinPhone: '',
  kinAltPhone: '',
  kinAddress: '',
};

type Values = typeof INITIAL;
type Errors = Record<string, string>;

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

interface ApplicationFormProps {
  defaultEmail: string;
  onSubmitted?: () => void;
}

export default function ApplicationForm({ defaultEmail, onSubmitted }: ApplicationFormProps) {
  const [values, setValues] = useState<Values>({ ...INITIAL, email: defaultEmail });
  const [errors, setErrors] = useState<Errors>({});
  const [consent, setConsent] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Partial<Record<DocumentKind, UploadedDocument>>>({});
  const [uploadsInFlight, setUploadsInFlight] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const supabase = createClient();

  const clearError = useCallback((name: string) => {
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const handleChange = useCallback(
    (name: string, value: string) => {
      setValues((prev) => ({ ...prev, [name]: value }));
      clearError(name);
    },
    [clearError],
  );

  const focusFirstError = (errs: Errors) => {
    const first = Object.keys(errs)[0];
    if (first) document.getElementById(`field-${first}`)?.focus();
  };

  const showErrors = (errs: Errors, message = 'Please correct the highlighted fields.') => {
    setErrors(errs);
    setFormError(message);
    requestAnimationFrame(() => focusFirstError(errs));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFormError(null);

    if (uploadsInFlight > 0) {
      setFormError('Please wait for your documents to finish uploading.');
      return;
    }

    const payload = {
      ...values,
      consent,
      signatureDataUrl: signature ?? undefined,
      turnstileToken: turnstileToken ?? undefined,
      documents: Object.fromEntries(Object.entries(documents).map(([kind, doc]) => [kind, doc?.path])),
    };

    const parsed = applicationSchema.safeParse(payload);
    if (!parsed.success) {
      showErrors(fieldErrors(parsed.error));
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setErrors({});
      setFormError('Please complete the verification check below.');
      return;
    }

    setLoading(true);
    try {
      const submit = async (token: string) =>
        fetch('/api/submit-loan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });

      // getSession() returns the stored session and refreshes it automatically when it is about to expire.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setFormError('Your session has expired. Please sign out and sign in again, then resubmit.');
        return;
      }

      let res = await submit(token);
      if (res.status === 401) {
        // One retry with an explicitly refreshed token, in case it expired in transit.
        const { data: refreshed } = await supabase.auth.refreshSession();
        const fresh = refreshed.session?.access_token;
        if (fresh && fresh !== token) res = await submit(fresh);
      }
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        reference?: string;
        fieldErrors?: Errors;
      };

      if (res.ok && data.success && data.reference) {
        setReference(data.reference);
        window.scrollTo({ top: 0 });
        onSubmitted?.();
        return;
      }
      if (res.status === 401) {
        setFormError('Your session has expired. Please sign out and sign in again, then resubmit.');
        return;
      }
      if (data.fieldErrors) {
        // A rejected upload must be uploaded again: forget it so the applicant sees the red state.
        for (const kind of Object.keys(data.fieldErrors)) {
          if (DOCUMENT_SPECS.some((d) => d.kind === kind)) setDocuments((prev) => ({ ...prev, [kind]: undefined }));
        }
        showErrors(data.fieldErrors, data.error);
      } else setFormError(data.error ?? 'Submission failed. Please try again.');
      setTurnstileReset((n) => n + 1);
    } catch {
      setFormError('Network error. Check your connection and try again.');
      setTurnstileReset((n) => n + 1);
    } finally {
      setLoading(false);
    }
  };

  if (reference) {
    return (
      <div className="paper mx-auto w-full max-w-md space-y-4 p-8 text-center" role="status">
        <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" aria-hidden="true" />
        <h2 className="font-heading text-xl font-bold uppercase tracking-wide text-brand-900">Application submitted</h2>
        <p className="text-sm text-slate-600">
          Thank you, <span className="font-semibold">{values.fullName}</span>. Your signed application and documents have been received and
          will be reviewed. We will contact you on {values.phone}.
        </p>
        <p className="text-sm text-slate-700">
          Reference: <span className="font-mono font-bold">{reference}</span>
        </p>
        <Link href="/dashboard" className="btn-primary w-full">
          Go to my applications
        </Link>
        {CONTACT_EMAIL && <p className="text-xs text-slate-500">Questions? {CONTACT_EMAIL}</p>}
      </div>
    );
  }

  const f = (name: keyof Values) => ({ name, value: values[name], onChange: handleChange, error: errors[name] });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* ---------------- Form 1: Loan application ---------------- */}
      <section className="paper p-5 sm:p-7" aria-labelledby="form-application">
        <DocHeader lines={FORM_TITLES.application.lines} />
        <h3 id="form-application" className="sr-only">
          Loan application form
        </h3>
        <fieldset className="space-y-4">
          <legend className="section-title w-full">Personal details</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field {...f('fullName')} label="Full name" autoComplete="name" maxLength={120} wide />
            <Field {...f('dob')} label="Date of birth" type="date" autoComplete="bday" max={today} />
            <Field {...f('idNumber')} label="Omang / ID number" inputMode="numeric" maxLength={9} hint="9 digits" />
            <Field {...f('phone')} label="Phone number" type="tel" autoComplete="tel" inputMode="tel" placeholder="71234567" />
            <Field {...f('email')} label="Email address" type="email" autoComplete="email" />
            <Field {...f('address')} label="Residential address" autoComplete="street-address" wide />
          </div>
        </fieldset>

        <fieldset className="mt-6 space-y-4">
          <legend className="section-title w-full">Employment &amp; financial details</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field {...f('institution')} label="Institution / employer" autoComplete="organization" />
            <Field {...f('income')} label="Monthly allowance / income (BWP)" type="number" inputMode="decimal" min={0} />
            <Field
              {...f('loanAmount')}
              label="Loan amount requested (BWP)"
              type="number"
              inputMode="decimal"
              min={LOAN_MIN}
              max={LOAN_MAX}
              hint={`P${LOAN_MIN.toLocaleString('en-US')} – P${LOAN_MAX.toLocaleString('en-US')}`}
            />
            <Field {...f('loanPurpose')} label="Loan purpose" />
          </div>
        </fieldset>

        <fieldset className="mt-6 space-y-4">
          <legend className="section-title w-full">Guarantor information (optional)</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field {...f('guarantorName')} label="Guarantor name" required={false} maxLength={120} />
            <Field {...f('guarantorPhone')} label="Guarantor phone" type="tel" inputMode="tel" placeholder="71234567" required={false} />
          </div>
        </fieldset>
        <DocFooter label={FORM_TITLES.application.footer} page={1} pages={4} />
      </section>

      {/* ---------------- Form 2: Next of kin ---------------- */}
      <section className="paper p-5 sm:p-7" aria-labelledby="form-kin">
        <DocHeader lines={FORM_TITLES.nextOfKin.lines} />
        <h3 id="form-kin" className="sr-only">
          Next of kin details
        </h3>
        <p className="notice mb-5">
          <span className="font-bold text-brand-900">Notice:</span> {KIN_NOTICE}
        </p>
        <fieldset className="space-y-4">
          <legend className="section-title w-full">Next of kin information</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field {...f('kinName')} label="Full name" wide />
            <Field {...f('kinRelationship')} label="Relationship to applicant" placeholder="e.g. Mother" />
            <Field {...f('kinId')} label="National ID / Omang number" maxLength={20} />
            <Field {...f('kinPhone')} label="Mobile number" type="tel" inputMode="tel" placeholder="71234567" />
            <Field {...f('kinAltPhone')} label="Alternative number" type="tel" inputMode="tel" required={false} />
            <Field {...f('kinAddress')} label="Residential address" wide />
          </div>
        </fieldset>
        <div className="mt-6">
          <p className="section-title">Applicant declaration</p>
          <p className="text-xs leading-relaxed text-slate-700">{KIN_DECLARATION}</p>
        </div>
        <DocFooter label={FORM_TITLES.nextOfKin.footer} page={2} pages={4} />
      </section>

      {/* ---------------- Supporting documents ---------------- */}
      <section className="paper p-5 sm:p-7" aria-labelledby="form-docs">
        <DocHeader lines={['SUPPORTING DOCUMENTS']} />
        <h3 id="form-docs" className="sr-only">
          Supporting documents
        </h3>
        <p className="notice mb-5">
          <span className="font-bold text-brand-900">Notice:</span> Upload all five documents before signing. They are stored privately and are
          only seen by the Lender. Use clear photos or scans (JPG, PNG, WebP or PDF, up to 10 MB each).
        </p>
        <div className="space-y-3">
          {DOCUMENT_SPECS.map((spec) => (
            <DocumentUpload
              key={spec.kind}
              spec={spec}
              value={documents[spec.kind]}
              error={errors[spec.kind]}
              onUpload={(file) => uploadDocument(supabase, spec.kind, file)}
              onChange={(doc) => {
                setDocuments((prev) => ({ ...prev, [spec.kind]: doc }));
                clearError(spec.kind);
              }}
              onBusyChange={(busy) => setUploadsInFlight((n) => Math.max(0, n + (busy ? 1 : -1)))}
            />
          ))}
        </div>
        <DocFooter label="Supporting Documents" page={3} pages={4} />
      </section>

      {/* ---------------- Form 3: Consent & declaration ---------------- */}
      <section className="paper p-5 sm:p-7" aria-labelledby="form-consent">
        <DocHeader lines={FORM_TITLES.consent.lines} />
        <h3 id="form-consent" className="sr-only">
          Acknowledgement, consent and declaration
        </h3>
        <div className="space-y-3 text-sm leading-relaxed text-slate-800">
          {CONSENT_PARAGRAPHS.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>

        <fieldset className="mt-6 space-y-4">
          <legend className="section-title w-full">Applicant details</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className="label-caps">Full name</span>
              <div className="input-box min-h-[38px] !bg-slate-100 text-slate-700">{values.fullName || '—'}</div>
            </div>
            <div>
              <span className="label-caps">Omang / identity number</span>
              <div className="input-box min-h-[38px] !bg-slate-100 text-slate-700">{values.idNumber || '—'}</div>
            </div>
            <div>
              <span className="label-caps">Date</span>
              <div className="input-box min-h-[38px] !bg-slate-100 text-slate-700">
                {new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Gaborone' }).format(new Date())}
              </div>
            </div>
          </div>
        </fieldset>

        <div className="mt-6 space-y-5">
          <SignatureCanvas
            error={errors.signatureDataUrl}
            onSignatureChange={(url) => {
              setSignature(url);
              if (url) clearError('signatureDataUrl');
            }}
          />

          <div>
            <label className="flex items-start gap-2 text-sm text-slate-800">
              <input
                id="field-consent"
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  clearError('consent');
                }}
                aria-invalid={errors.consent ? true : undefined}
                className="mt-1 h-4 w-4 accent-brand-700"
              />
              <span className="text-xs leading-relaxed">{CONSENT_LABEL}</span>
            </label>
            {errors.consent && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {errors.consent}
              </p>
            )}
          </div>
        </div>
        <DocFooter label={FORM_TITLES.consent.footer} page={4} pages={4} />
      </section>

      {TURNSTILE_SITE_KEY && <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onToken={setTurnstileToken} resetKey={turnstileReset} />}

      {formError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}

      <button type="submit" disabled={loading || uploadsInFlight > 0} className="btn-primary w-full py-3">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Submitting…</span>
          </>
        ) : uploadsInFlight > 0 ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Uploading documents…</span>
          </>
        ) : (
          <>
            <Send className="h-4 w-4" aria-hidden="true" />
            <span>Sign &amp; submit loan application</span>
          </>
        )}
      </button>
    </form>
  );
}
