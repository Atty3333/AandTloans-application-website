'use client';

import React, { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, Loader2, Send, X } from 'lucide-react';
import { accessToken } from '@/lib/client-files';
import { DEFAULT_WARNING_TEMPLATE } from '@/lib/payment-warnings';

interface Preview {
  integrated: boolean;
  recipients: { reference: string; name: string }[];
  withoutNumber: { reference: string; name: string }[];
}

interface Props {
  supabase: SupabaseClient;
  /** Approved applications without proof, counted from the loaded list (for the button label). */
  pendingCount: number;
  onMessage: (message: string | null) => void;
}

/**
 * One custom WhatsApp warning, sent in a single action to EVERY approved application that has no proof of payment.
 * WhatsApp is not integrated yet, so nothing is delivered. Nothing is stored: there is no message history.
 */
export default function AdminWarningPanel({ supabase, pendingCount, onMessage }: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(DEFAULT_WARNING_TEMPLATE);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const call = async (init: RequestInit) => {
    const token = await accessToken(supabase);
    if (!token) throw new Error('Your session has expired. Please sign in again.');
    const res = await fetch('/api/admin/payment-warnings', { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { success?: boolean; error?: string };
    if (!res.ok || !json.success) throw new Error(json.error ?? 'Something went wrong. Please try again.');
    return json;
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    call({ method: 'GET' })
      .then((json) => active && setPreview(json as unknown as Preview))
      .catch((err: unknown) => active && setError(err instanceof Error ? err.message : 'Could not load the recipients.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || !preview) return;
    const n = preview.recipients.length;
    if (n === 0) return;
    if (!window.confirm(`Send this warning to ${n} applicant${n === 1 ? '' : 's'} now?`)) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const json = (await call({ method: 'POST', body: JSON.stringify({ message }) })) as unknown as {
        integrated: boolean;
        targeted: number;
        sent: number;
        failed: number;
        withoutNumber: number;
      };
      const text = json.integrated
        ? `Sent to ${json.sent} of ${json.targeted} applicants${json.failed ? ` (${json.failed} failed)` : ''}.`
        : `WhatsApp is not connected yet, so nothing was sent. ${json.targeted} applicant${json.targeted === 1 ? '' : 's'} would have received the warning.`;
      setResult(text);
      onMessage(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="btn-secondary">
        <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" /> Send payment warnings ({pendingCount})
      </button>

      {open && (
        <form onSubmit={send} className="paper space-y-4 border-amber-300 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="section-title !mb-1">Payment warning (WhatsApp)</h2>
              <p className="text-xs text-slate-600">
                Goes to every application that is <strong>Approved</strong> and has <strong>no proof of payment</strong>, in one action.
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary !p-1.5" aria-label="Close">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Finding recipients…
            </p>
          ) : (
            preview && (
              <div className="text-sm text-slate-800">
                <p>
                  <span className="font-semibold">{preview.recipients.length}</span> applicant{preview.recipients.length === 1 ? '' : 's'} will receive it
                  {preview.recipients.length > 0 && ': '}
                  <span className="text-slate-600">
                    {preview.recipients
                      .slice(0, 8)
                      .map((r) => r.name)
                      .join(', ')}
                    {preview.recipients.length > 8 ? ` and ${preview.recipients.length - 8} more` : ''}
                  </span>
                </p>
                {preview.withoutNumber.length > 0 && (
                  <p className="mt-1 text-xs text-amber-800">
                    {preview.withoutNumber.length} approved applicant{preview.withoutNumber.length === 1 ? ' has' : 's have'} no WhatsApp number and will be skipped:{' '}
                    {preview.withoutNumber.map((r) => r.name).join(', ')}.
                  </p>
                )}
                {!preview.integrated && (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    WhatsApp is not integrated yet. Sending runs the full flow but delivers nothing, and nothing is saved.
                  </p>
                )}
              </div>
            )
          )}

          <label className="label-caps">
            Message
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={900} className="input-box normal-case tracking-normal" />
          </label>
          <p className="-mt-2 text-xs text-slate-500">
            Placeholders: <code>{'{name}'}</code>, <code>{'{amount}'}</code>, <code>{'{reference}'}</code> are filled in for each person. {message.length}/900
          </p>

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {error}
            </p>
          )}
          {result && (
            <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-800">
              {result}
            </p>
          )}

          <button type="submit" disabled={sending || loading || !preview || preview.recipients.length === 0 || message.trim().length < 10} className="btn-primary">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            {sending ? 'Sending…' : `Send to all${preview ? ` (${preview.recipients.length})` : ''}`}
          </button>
        </form>
      )}
    </div>
  );
}
