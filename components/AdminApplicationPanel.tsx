'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FileText, History, Loader2, MessageCircle, Pencil, X } from 'lucide-react';
import Field from '@/components/Field';
import ProofOfPaymentPanel from '@/components/ProofOfPaymentPanel';
import {
  DETAIL_COLUMN_LABELS,
  FIELD_TO_COLUMN,
  formatDateTime,
  rowToFormValues,
  type DetailColumn,
  type DetailField,
  type EditHistoryEntry,
  type LoanRow,
} from '@/lib/applications';
import { ALL_STATUSES, DOCUMENTS_BUCKET, LOAN_MAX, LOAN_MIN, STORAGE_BUCKET, formatBwp, type LoanStatus } from '@/lib/config';
import { DOCUMENT_LABELS, DOCUMENT_SPECS } from '@/lib/documents';
import { parseProofs } from '@/lib/proofs';
import { shortRef } from '@/lib/status';
import { whatsappChatUrl } from '@/lib/whatsapp-link';
import { adminEditSchema, fieldErrors } from '@/lib/validation';

interface Props {
  row: LoanRow;
  supabase: SupabaseClient;
  onRowChange: (row: LoanRow) => void;
  onStatusChange: (row: LoanRow, status: LoanStatus) => void | Promise<unknown>;
  onMessage: (message: string | null) => void;
}

type Errors = Record<string, string>;

const VIEW_ROWS: ReadonlyArray<readonly [DetailColumn, (v: string | number | null) => string]> = [
  ['id_number', (v) => String(v ?? '')],
  ['date_of_birth', (v) => String(v ?? '')],
  ['phone_number', (v) => String(v ?? '')],
  ['whatsapp_number', (v) => String(v ?? '—')],
  ['email', (v) => String(v ?? '')],
  ['address', (v) => String(v ?? '')],
  ['institution', (v) => String(v ?? '')],
  ['monthly_income', (v) => formatBwp(Number(v ?? 0))],
  ['loan_amount_requested', (v) => formatBwp(Number(v ?? 0))],
  ['loan_purpose', (v) => String(v ?? '')],
  ['guarantor_name', (v) => String(v ?? '—')],
  ['guarantor_phone', (v) => String(v ?? '—')],
  ['kin_full_name', (v) => String(v ?? '')],
  ['kin_relationship', (v) => String(v ?? '')],
  ['kin_id_number', (v) => String(v ?? '')],
  ['kin_phone', (v) => String(v ?? '')],
  ['kin_alt_phone', (v) => String(v ?? '—')],
  ['kin_address', (v) => String(v ?? '')],
];

const COLUMN_TO_FIELD = Object.fromEntries(Object.entries(FIELD_TO_COLUMN).map(([f, c]) => [c, f])) as Record<DetailColumn, DetailField>;

export default function AdminApplicationPanel({ row, supabase, onRowChange, onStatusChange, onMessage }: Props) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<DetailField, string>>(() => rowToFormValues(row));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [history, setHistory] = useState<EditHistoryEntry[] | null>(null);

  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('application_edits')
      .select('id, edited_at, edited_by_email, changes')
      .eq('application_id', row.id)
      .order('edited_at', { ascending: false })
      .limit(20);
    if (error) {
      console.error('[admin] could not load edit history', error);
      setHistory([]);
      return;
    }
    setHistory((data ?? []) as EditHistoryEntry[]);
  }, [supabase, row.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const startEdit = () => {
    setValues(rowToFormValues(row));
    setErrors({});
    setFormError(null);
    setEditing(true);
  };

  const handleChange = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);

    const parsed = adminEditSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setFormError('Please correct the highlighted fields.');
      return;
    }

    setSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setFormError('Your session has expired. Please sign in again.');
        return;
      }
      const res = await fetch(`/api/admin/applications/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(values),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        changed?: boolean;
        application?: LoanRow;
        error?: string;
        fieldErrors?: Errors;
      };
      if (!res.ok || !json.success) {
        if (json.fieldErrors) setErrors(json.fieldErrors);
        setFormError(json.error ?? 'Could not save the changes. Please try again.');
        return;
      }
      if (json.application) onRowChange({ ...row, ...json.application });
      onMessage(json.changed ? 'Changes saved.' : 'No changes to save.');
      setEditing(false);
      void loadHistory();
    } catch {
      setFormError('Network error. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const openFile = async (bucket: string, path: string) => {
    const tab = window.open('', '_blank');
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
    if (error || !data) {
      tab?.close();
      onMessage(`Could not open the file: ${error?.message ?? 'unknown error'}`);
      return;
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = data.signedUrl;
    } else {
      window.location.href = data.signedUrl;
    }
  };

  const f = (name: DetailField) => ({ name, value: values[name], onChange: handleChange, error: errors[name] });
  const docs = row.documents ?? [];

  return (
    <div className="space-y-5 border-t border-brand-100 p-4 text-sm">
      {/* ---------- Details ---------- */}
      {editing ? (
        <form onSubmit={save} noValidate className="space-y-5">
          <p className="notice">
            Editing applicant details. The signed PDF, signature and uploaded documents cannot be changed here, and every edit is recorded in the
            history.
          </p>
          <fieldset className="space-y-3">
            <legend className="section-title w-full">Personal details</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field {...f('fullName')} label="Full name" maxLength={120} wide />
              <Field {...f('dob')} label="Date of birth" type="date" />
              <Field {...f('idNumber')} label="Omang / ID number" inputMode="numeric" maxLength={9} />
              <Field {...f('phone')} label="Phone number (Pay2Cell)" type="tel" />
              <Field {...f('whatsappNumber')} label="WhatsApp number" type="tel" required={false} />
              <Field {...f('email')} label="Email address" type="email" />
              <Field {...f('address')} label="Residential address" wide />
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="section-title w-full">Employment &amp; loan</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field {...f('institution')} label="Institution / employer" />
              <Field {...f('income')} label="Monthly income (BWP)" type="number" min={0} />
              <Field {...f('loanAmount')} label="Loan amount (BWP)" type="number" min={LOAN_MIN} max={LOAN_MAX} />
              <Field {...f('loanPurpose')} label="Loan purpose" />
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="section-title w-full">Guarantor (optional)</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field {...f('guarantorName')} label="Guarantor name" required={false} />
              <Field {...f('guarantorPhone')} label="Guarantor phone" type="tel" required={false} />
            </div>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="section-title w-full">Next of kin</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field {...f('kinName')} label="Full name" wide />
              <Field {...f('kinRelationship')} label="Relationship" />
              <Field {...f('kinId')} label="ID / Omang number" maxLength={20} />
              <Field {...f('kinPhone')} label="Mobile number" type="tel" />
              <Field {...f('kinAltPhone')} label="Alternative number" type="tel" required={false} />
              <Field {...f('kinAddress')} label="Residential address" wide />
            </div>
          </fieldset>

          {formError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={saving} className="btn-secondary">
              <X className="h-4 w-4" aria-hidden="true" /> Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {VIEW_ROWS.map(([column, fmt]) => (
              <div key={column}>
                <dt className="label-caps">{DETAIL_COLUMN_LABELS[column]}</dt>
                <dd className="break-words text-slate-900">
                  {fmt(row[column])}
                  {(column === 'whatsapp_number' || column === 'phone_number') && whatsappChatUrl(String(row[column] ?? '')) && (
                    <a
                      href={whatsappChatUrl(String(row[column] ?? ''), `Hello ${row.full_name}, this is A&T Student Loans about your application ${shortRef(row.id)}.`) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900"
                    >
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Chat<span className="sr-only"> on WhatsApp</span>
                    </a>
                  )}
                </dd>
              </div>
            ))}
            <div>
              <dt className="label-caps">WhatsApp sent</dt>
              <dd className="text-slate-900">{row.whatsapp_notified_at ? formatDateTime(row.whatsapp_notified_at) : 'No'}</dd>
            </div>
            <div>
              <dt className="label-caps">PDF SHA-256</dt>
              <dd className="font-mono text-xs text-slate-900">{row.pdf_sha256.slice(0, 16)}…</dd>
            </div>
            {row.last_edited_at && (
              <div>
                <dt className="label-caps">Last edited</dt>
                <dd className="text-slate-900">{formatDateTime(row.last_edited_at)}</dd>
              </div>
            )}
          </dl>
          <button type="button" onClick={startEdit} className="btn-secondary">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit details
          </button>
        </>
      )}

      {/* ---------- Documents ---------- */}
      <section aria-labelledby={`docs-${row.id}`}>
        <h3 id={`docs-${row.id}`} className="section-title">
          Documents
        </h3>
        <ul className="space-y-2">
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
            <span className="font-semibold text-brand-900">Signed application (PDF)</span>
            <button type="button" onClick={() => void openFile(STORAGE_BUCKET, row.pdf_path)} className="btn-primary !px-3 !py-1.5">
              <FileText className="h-4 w-4" aria-hidden="true" /> View
            </button>
          </li>
          {DOCUMENT_SPECS.map((spec) => {
            const doc = docs.find((d) => d.kind === spec.kind);
            return (
              <li key={spec.kind} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-slate-50 px-3 py-2">
                <span>
                  <span className="font-medium text-slate-900">{DOCUMENT_LABELS[spec.kind]}</span>
                  {!doc && <span className="ml-2 text-xs text-slate-500">Not provided</span>}
                </span>
                {doc && (
                  <button type="button" onClick={() => void openFile(DOCUMENTS_BUCKET, doc.path)} className="btn-secondary !py-1">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" /> View
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------- Proof of payment (admins may add, replace or remove on any application) ---------- */}
      <ProofOfPaymentPanel
        applicationId={row.id}
        proofs={parseProofs(row.proof_of_payments)}
        canEdit
        mode="admin"
        supabase={supabase}
        onChange={(proofs) => onRowChange({ ...row, proof_of_payments: proofs })}
      />

      {/* ---------- Status ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold text-slate-600">
          Reply / status{' '}
          <select
            value={row.status}
            onChange={(e) => onStatusChange(row, e.target.value as LoanStatus)}
            className="ml-1 rounded-md border border-indigo-200 bg-white p-1.5 text-sm"
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ---------- Edit history ---------- */}
      {history && history.length > 0 && (
        <section aria-labelledby={`hist-${row.id}`}>
          <h3 id={`hist-${row.id}`} className="section-title flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" aria-hidden="true" /> Edit history
          </h3>
          <ul className="space-y-2 text-xs text-slate-700">
            {history.map((h) => (
              <li key={h.id} className="rounded-lg border border-brand-100 bg-white p-2">
                <p className="font-semibold text-brand-900">
                  {formatDateTime(h.edited_at)} · {h.edited_by_email ?? 'admin'}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {(Object.entries(h.changes) as [DetailColumn, { from: unknown; to: unknown }][]).map(([column, c]) => (
                    <li key={column}>
                      {DETAIL_COLUMN_LABELS[column] ?? COLUMN_TO_FIELD[column] ?? column}: <span className="text-slate-500 line-through">{String(c.from ?? '—')}</span>{' '}
                      → <span className="font-medium">{String(c.to ?? '—')}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
