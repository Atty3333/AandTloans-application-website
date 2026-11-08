'use client';

import React, { useCallback, useState } from 'react';
import { CheckCircle2, Loader2, Send, AlertCircle } from 'lucide-react';
import Field from '@/components/Field';
import SignatureCanvas from '@/components/SignatureCanvas';
import TurnstileWidget from '@/components/TurnstileWidget';
import { CONSENT_LABEL, TERMS_CLAUSES } from '@/lib/terms';
import { CONTACT_EMAIL, LOAN_MAX, LOAN_MIN } from '@/lib/config';
import { applicationSchema, fieldErrors } from '@/lib/validation';

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

interface Props {
  /** Supabase access token of the signed-in applicant, sent to the API to prove who is applying. */
  accessToken: string;
  defaultEmail?: string;
}

export default function ApplicationForm({ accessToken, defaultEmail = '' }: Props) {
  const [values, setValues] = useState<Values>({ ...INITIAL, email: defaultEmail });
  const [errors, setErrors] = useState<Errors>({});
  const [consent, setConsent] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const handleChange = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

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

    const payload = {
      ...values,
      consent,
      signatureDataUrl: signature ?? undefined,
      turnstileToken: turnstileToken ?? undefined,
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
      const res = await fetch('/api/submit-loan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        reference?: string;
        fieldErrors?: Errors;
      };

      if (res.ok && data.success && data.reference) {
        setReference(data.reference);
        window.scrollTo({ top: 0 });
        return;
      }
      if (data.fieldErrors) showErrors(data.fieldErrors, data.error);
      else setFormError(data.error ?? 'Submission failed. Please try again.');
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
      <div className="max-w-md w-full mx-auto bg-white rounded-xl shadow-lg p-8 text-center space-y-4" role="status">
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" aria-hidden="true" />
        <h2 className="text-2xl font-bold text-gray-900">Application submitted</h2>
        <p className="text-sm text-gray-600">
          Thank you, <span className="font-semibold">{values.fullName}</span>. Your signed application has been received and
          will be reviewed. We will contact you on {values.phone}.
        </p>
        <p className="text-sm text-gray-700">
          Reference: <span className="font-mono font-bold">{reference}</span>
        </p>
        {CONTACT_EMAIL && <p className="text-xs text-gray-500">Questions? {CONTACT_EMAIL}</p>}
      </div>
    );
  }

  const f = (name: keyof Values) => ({ name, value: values[name], onChange: handleChange, error: errors[name] });

  return (
    <form onSubmit={handleSubmit} noValidate className="bg-white shadow-sm rounded-xl border p-6 space-y-6">
      <fieldset className="space-y-4">
        <legend className="text-lg font-bold text-gray-900 border-b pb-2 w-full">1. Borrower information</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field {...f('fullName')} label="Full name" autoComplete="name" maxLength={120} />
          <Field {...f('dob')} label="Date of birth" type="date" autoComplete="bday" />
          <Field {...f('idNumber')} label="Omang number" inputMode="numeric" maxLength={9} hint="9 digits" />
          <Field {...f('phone')} label="Phone number" type="tel" autoComplete="tel" inputMode="tel" placeholder="71234567" />
          <Field {...f('email')} label="Email address" type="email" autoComplete="email" />
          <Field {...f('institution')} label="Institution / college" autoComplete="organization" />
          <Field {...f('address')} label="Residential address" autoComplete="street-address" wide />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-bold text-gray-900 border-b pb-2 w-full">2. Loan request details</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            {...f('loanAmount')}
            label="Loan amount requested (BWP)"
            type="number"
            inputMode="decimal"
            min={LOAN_MIN}
            max={LOAN_MAX}
            hint={`P${LOAN_MIN.toLocaleString('en-US')} – P${LOAN_MAX.toLocaleString('en-US')}`}
          />
          <Field {...f('income')} label="Monthly allowance / income (BWP)" type="number" inputMode="decimal" min={0} />
          <Field {...f('loanPurpose')} label="Loan purpose" wide />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-bold text-gray-900 border-b pb-2 w-full">3. Next of kin details</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field {...f('kinName')} label="Next of kin full name" />
          <Field {...f('kinRelationship')} label="Relationship" placeholder="e.g. Mother" />
          <Field {...f('kinId')} label="Omang / ID number" maxLength={20} />
          <Field {...f('kinPhone')} label="Mobile number" type="tel" inputMode="tel" placeholder="71234567" />
          <Field {...f('kinAltPhone')} label="Alternative phone (optional)" type="tel" inputMode="tel" required={false} />
          <Field {...f('kinAddress')} label="Residential address" wide />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-bold text-gray-900 border-b pb-2 w-full">4. Declaration, terms &amp; signature</legend>
        <div className="max-h-56 overflow-y-auto rounded-lg border bg-gray-50 p-4 text-xs text-gray-700 space-y-3" tabIndex={0} aria-label="Terms and declaration">
          {TERMS_CLAUSES.map((c) => (
            <div key={c.title}>
              <p className="font-semibold text-gray-900">{c.title}</p>
              <p>{c.body}</p>
            </div>
          ))}
        </div>

        <div>
          <label className="flex items-start gap-2 text-sm text-gray-800">
            <input
              id="field-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setErrors(({ consent: _c, ...rest }) => rest);
              }}
              aria-invalid={errors.consent ? true : undefined}
              className="mt-1 h-4 w-4"
            />
            <span>{CONSENT_LABEL}</span>
          </label>
          {errors.consent && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {errors.consent}
            </p>
          )}
        </div>

        <SignatureCanvas
          error={errors.signatureDataUrl}
          onSignatureChange={(url) => {
            setSignature(url);
            if (url) setErrors(({ signatureDataUrl: _s, ...rest }) => rest);
          }}
        />
      </fieldset>

      {TURNSTILE_SITE_KEY && <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onToken={setTurnstileToken} resetKey={turnstileReset} />}

      {formError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>Submitting…</span>
          </>
        ) : (
          <>
            <Send className="w-4 h-4" aria-hidden="true" />
            <span>Submit loan application</span>
          </>
        )}
      </button>
    </form>
  );
}
