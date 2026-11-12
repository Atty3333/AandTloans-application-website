'use client';

import React, { useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CheckCircle2, FileText, Loader2, Replace, Trash2, Upload } from 'lucide-react';
import { accessToken } from '@/lib/client-files';
import { DOCUMENTS_BUCKET, MAX_PROOFS } from '@/lib/config';
import { ALLOWED_DOCUMENT_TYPES, checkDocumentFile } from '@/lib/documents';
import { formatDateTime } from '@/lib/applications';
import { parseProofs, proofSlotsLeft, type ProofOfPayment } from '@/lib/proofs';

interface Props {
  applicationId: string;
  proofs: ProofOfPayment[];
  /** Applicants: only while the loan is APPROVED. Admins: always true. */
  canEdit: boolean;
  mode: 'user' | 'admin';
  supabase: SupabaseClient;
  onChange: (proofs: ProofOfPayment[]) => void;
  /** Shown under the title when the panel is read-only and empty. */
  emptyHint?: string;
}

const sizeLabel = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const kindLabel = (contentType: string) => (contentType === 'application/pdf' ? 'PDF' : 'Image');

/** Upload / replace / remove up to 3 proofs of payment. Used by the applicant (APPROVED only) and by admins. */
export default function ProofOfPaymentPanel({ applicationId, proofs, canEdit, mode, supabase, onChange, emptyHint }: Props) {
  const input = useRef<HTMLInputElement | null>(null);
  const replacing = useRef<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // 'add' | path of the proof being changed
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const call = async <T extends object>(body: Record<string, unknown>): Promise<T & { success?: boolean; error?: string }> => {
    const token = await accessToken(supabase);
    if (!token) throw new Error('Your session has expired. Please sign out and sign in again.');
    const res = await fetch(`/api/applications/${applicationId}/proofs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T & { success?: boolean; error?: string };
    if (!res.ok || !json.success) throw new Error(json.error ?? 'Something went wrong. Please try again.');
    return json;
  };

  const run = async (key: string, task: () => Promise<string | void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const message = await task();
      if (message) setNotice(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleFile = async (file: File | undefined) => {
    const oldPath = replacing.current;
    replacing.current = null;
    if (input.current) input.current.value = '';
    if (!file) return;
    const problem = checkDocumentFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    await run(oldPath ?? 'add', async () => {
      const signed = await call<{ path: string; token: string }>({ action: 'sign', contentType: file.type, size: file.size, replacing: !!oldPath });
      const { error: uploadError } = await supabase.storage.from(DOCUMENTS_BUCKET).uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
      if (uploadError) throw new Error('Upload failed. Check your connection and try again.');
      const done = await call<{ proofs: unknown }>(oldPath ? { action: 'replace', path: signed.path, oldPath } : { action: 'attach', path: signed.path });
      onChange(parseProofs(done.proofs));
      return oldPath ? 'Proof of payment replaced.' : 'Proof of payment uploaded.';
    });
  };

  const choose = (oldPath: string | null) => {
    replacing.current = oldPath;
    input.current?.click();
  };

  const view = (path: string) =>
    void run(`view:${path}`, async () => {
      const tab = window.open('', '_blank');
      try {
        const { url } = await call<{ url: string }>({ action: 'view', path });
        if (tab) {
          tab.opener = null;
          tab.location.href = url;
        } else window.location.href = url;
      } catch (err) {
        tab?.close();
        throw err;
      }
    });

  const remove = (path: string) => {
    if (!window.confirm('Remove this proof of payment?')) return;
    void run(path, async () => {
      const done = await call<{ proofs: unknown }>({ action: 'remove', path });
      onChange(parseProofs(done.proofs));
      return 'Proof of payment removed.';
    });
  };

  const slots = proofSlotsLeft(proofs);
  const busyAny = busy !== null;

  return (
    <section aria-labelledby={`proof-${applicationId}`} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`proof-${applicationId}`} className="section-title !mb-0 flex-1">
          Proof of payment
        </h3>
        <span className="text-xs text-slate-500">
          {proofs.length} of {MAX_PROOFS} uploaded
        </span>
      </div>

      {proofs.length === 0 && (
        <p className="text-sm text-slate-600">
          {canEdit
            ? mode === 'user'
              ? 'Once you have paid back the money, upload a screenshot, photo or PDF of your proof of payment.'
              : 'No proof of payment has been uploaded yet.'
            : (emptyHint ?? 'No proof of payment uploaded.')}
        </p>
      )}

      <ul className="space-y-2">
        {proofs.map((p, i) => (
          <li key={p.path} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-300 bg-green-50/50 px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
              <span>
                <span className="font-medium text-slate-900">Proof {i + 1}</span>
                <span className="block text-xs text-slate-500">
                  {kindLabel(p.contentType)} · {sizeLabel(p.size)} · {p.uploadedAt ? formatDateTime(p.uploadedAt) : ''} · by {p.uploadedBy === 'admin' ? 'admin' : 'applicant'}
                </span>
              </span>
            </span>
            <span className="flex flex-wrap gap-2">
              <button type="button" onClick={() => view(p.path)} disabled={busyAny} className="btn-secondary !py-1">
                {busy === `view:${p.path}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <FileText className="h-3.5 w-3.5" aria-hidden="true" />} View
              </button>
              {canEdit && (
                <>
                  <button type="button" onClick={() => choose(p.path)} disabled={busyAny} className="btn-secondary !py-1">
                    {busy === p.path ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Replace className="h-3.5 w-3.5" aria-hidden="true" />} Replace
                  </button>
                  <button type="button" onClick={() => remove(p.path)} disabled={busyAny} className="btn-secondary !py-1">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      {canEdit && (
        <div>
          <input ref={input} type="file" accept={ALLOWED_DOCUMENT_TYPES.join(',')} className="sr-only" aria-label="Choose proof of payment file" onChange={(e) => void handleFile(e.target.files?.[0])} />
          {slots > 0 ? (
            <button type="button" onClick={() => choose(null)} disabled={busyAny} className="btn-primary">
              {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
              {busy === 'add' ? 'Uploading…' : proofs.length === 0 ? 'Upload proof of payment' : 'Add another proof'}
            </button>
          ) : (
            <p className="text-xs text-slate-500">Maximum of {MAX_PROOFS} proofs reached. Replace or remove one to change it.</p>
          )}
          <p className="mt-1 text-xs text-slate-500">JPG, PNG, WebP or PDF, up to 10 MB.</p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs font-medium text-green-700">
          {notice}
        </p>
      )}
    </section>
  );
}
