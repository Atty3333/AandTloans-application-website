'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Loader2, LogOut, XCircle } from 'lucide-react';
import { DocFooter, DocHeader, SiteHeader } from '@/components/BrandHeader';
import CopyButton from '@/components/CopyButton';
import PrintButton from '@/components/PrintButton';
import StatusTimeline from '@/components/StatusTimeline';
import ProfileLink from '@/components/ProfileLink';
import ProofOfPaymentPanel from '@/components/ProofOfPaymentPanel';
import StatusBadge from '@/components/StatusBadge';
import { formatDate } from '@/lib/applications';
import { accessToken, openPrivateFile } from '@/lib/client-files';
import { canApplicantCancel, canApplicantEditProofs, formatBwp, type LoanStatus } from '@/lib/config';
import { DOCUMENT_SPECS, fileNameFromPath, parseDocuments, type StoredDocument } from '@/lib/documents';
import { parseProofs, type ProofOfPayment } from '@/lib/proofs';
import { shortRef, statusHelp } from '@/lib/status';
import { useSession } from '@/lib/use-session';

interface MyApplication {
  id: string;
  created_at: string;
  loan_amount_requested: number;
  loan_purpose: string;
  status: LoanStatus;
  status_updated_at: string | null;
  whatsapp_number: string | null;
  proof_of_payments: unknown;
  documents: unknown;
}

/**
 * One application. The applicant cannot change the loan or its documents (they can view them): the ONLY thing they can edit
 * is the proof of payment (up to 3 files, while APPROVED). They may cancel the application while it is awaiting a reply.
 */
export default function ApplicationDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { supabase, session, ready } = useSession();
  const [app, setApp] = useState<MyApplication | null>(null);
  const [proofs, setProofs] = useState<ProofOfPayment[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !session) router.replace('/');
  }, [ready, session, router]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('my_loan_applications').select('*').eq('id', params.id).maybeSingle();
    if (error) {
      console.error('[application] could not load', error);
      setState('error');
      return;
    }
    if (!data) {
      setState('missing');
      return;
    }
    const row = data as MyApplication;
    setApp(row);
    setProofs(parseProofs(row.proof_of_payments));
    setState('ready');
  }, [supabase, params.id]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  if (!ready || !session) {
    return (
      <main className="grid min-h-screen place-items-center" role="status" aria-label="Loading">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </main>
    );
  }

  const canEdit = app ? canApplicantEditProofs(app.status) : false;
  const canCancel = app ? canApplicantCancel(app.status) : false;
  const documents: StoredDocument[] = app ? parseDocuments(app.documents) : [];

  const viewDocument = async (path: string) => {
    setActionError(null);
    const problem = await openPrivateFile(supabase, path);
    if (problem) setActionError(`Could not open the file: ${problem}`);
  };

  const viewSignedPdf = async () => {
    if (!app) return;
    setActionError(null);
    const token = await accessToken(supabase);
    if (!token) {
      setActionError('Your session has expired. Please sign out and sign in again.');
      return;
    }
    const tab = window.open('', '_blank');
    try {
      const res = await fetch(`/api/applications/${app.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        tab?.close();
        setActionError(json.error ?? 'Could not open the document.');
        return;
      }
      if (tab) {
        tab.opener = null;
        tab.location.href = json.url;
      } else window.location.href = json.url;
    } catch {
      tab?.close();
      setActionError('Network error. Check your connection and try again.');
    }
  };

  const cancelApplication = async () => {
    if (!app || cancelling) return;
    setCancelling(true);
    setActionError(null);
    try {
      const token = await accessToken(supabase);
      if (!token) {
        setActionError('Your session has expired. Please sign out and sign in again.');
        return;
      }
      const res = await fetch(`/api/applications/${app.id}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        setActionError(json.error ?? 'Could not cancel the application.');
        await load();
        return;
      }
      setNotice('Your application has been cancelled. You can apply again whenever you are ready.');
      await load();
    } catch {
      setActionError('Network error. Check your connection and try again.');
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  };

  return (
    <main id="main" className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <SiteHeader subtitle={session.user.email ?? undefined} href="/dashboard">
          <Link href="/dashboard" className="btn-secondary">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> My applications
          </Link>
          <ProfileLink />
          <PrintButton label="Print" />
          <button onClick={() => void supabase.auth.signOut()} className="btn-secondary no-print">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out
          </button>
        </SiteHeader>

        <section className="paper p-5 sm:p-7" aria-labelledby="app-title">
          <DocHeader lines={['LOAN APPLICATION']} />
          <h1 id="app-title" className="sr-only">
            Loan application
          </h1>

          {state === 'loading' && (
            <div className="flex justify-center py-8" role="status" aria-label="Loading">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          )}
          {state === 'error' && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Could not load this application. Please refresh the page.
            </p>
          )}
          {state === 'missing' && <p className="text-sm text-slate-600">We could not find this application.</p>}

          {state === 'ready' && app && (
            <div className="space-y-6">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="label-caps">Reference</dt>
                  <dd className="flex items-center gap-3">
                    <span className="font-mono font-bold text-slate-900">{shortRef(app.id)}</span>
                    <CopyButton text={shortRef(app.id)} />
                  </dd>
                </div>
                <div>
                  <dt className="label-caps">Status</dt>
                  <dd>
                    <StatusBadge status={app.status} />
                  </dd>
                </div>
                <div>
                  <dt className="label-caps">Amount requested</dt>
                  <dd className="text-slate-900">{formatBwp(Number(app.loan_amount_requested))}</dd>
                </div>
                <div>
                  <dt className="label-caps">Applied</dt>
                  <dd className="text-slate-900">{formatDate(app.created_at)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="label-caps">Purpose</dt>
                  <dd className="text-slate-900">{app.loan_purpose}</dd>
                </div>
                <div>
                  <dt className="label-caps">WhatsApp number</dt>
                  <dd className="text-slate-900">{app.whatsapp_number ?? '—'}</dd>
                </div>
                {app.status_updated_at && (
                  <div>
                    <dt className="label-caps">{app.status === 'CANCELLED' ? 'Cancelled' : 'Replied'}</dt>
                    <dd className="text-slate-900">{formatDate(app.status_updated_at)}</dd>
                  </div>
                )}
              </dl>

              <div className="space-y-3 rounded-lg border border-brand-100 bg-brand-50/50 p-4">
                <StatusTimeline status={app.status} />
                <p className="text-center text-xs text-slate-700">{statusHelp(app.status, proofs.length)}</p>
              </div>

              {notice && (
                <p role="status" className="notice">
                  {notice}
                </p>
              )}
              {actionError && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {actionError}
                </p>
              )}

              {/* ---------- Documents: view only ---------- */}
              <section aria-labelledby="my-docs">
                <h2 id="my-docs" className="section-title">
                  Documents attached to this application
                </h2>
                <ul className="space-y-2">
                  <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
                    <span className="text-sm font-semibold text-brand-900">Signed application (PDF)</span>
                    <button type="button" onClick={() => void viewSignedPdf()} className="btn-primary !px-3 !py-1.5">
                      <FileText className="h-4 w-4" aria-hidden="true" /> View
                    </button>
                  </li>
                  {DOCUMENT_SPECS.map((spec) => {
                    const doc = documents.find((d) => d.kind === spec.kind);
                    return (
                      <li key={spec.kind} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-slate-50 px-3 py-2">
                        <span className="text-sm">
                          <span className="font-medium text-slate-900">{spec.label}</span>
                          {doc ? <span className="ml-2 text-xs text-slate-500">{fileNameFromPath(doc.path)}</span> : <span className="ml-2 text-xs text-slate-500">Not provided</span>}
                        </span>
                        {doc && (
                          <button type="button" onClick={() => void viewDocument(doc.path)} className="btn-secondary !py-1">
                            <FileText className="h-3.5 w-3.5" aria-hidden="true" /> View
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-slate-500">These documents were submitted with your application and cannot be changed. Only proof of payment can be added or replaced (while the loan is approved).</p>
              </section>

              {canCancel && (
                <section aria-labelledby="cancel-title" className="rounded-lg border border-red-200 bg-red-50/60 p-4">
                  <h2 id="cancel-title" className="text-sm font-bold text-red-800">
                    Cancel this application
                  </h2>
                  <p className="mt-1 text-xs text-slate-700">You can cancel while we have not replied yet. Once cancelled, it cannot be reopened, but you can submit a new application.</p>
                  {confirmCancel ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-red-800">Cancel this application?</span>
                      <button type="button" onClick={() => void cancelApplication()} disabled={cancelling} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-60">
                        {cancelling && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Yes, cancel it
                      </button>
                      <button type="button" onClick={() => setConfirmCancel(false)} disabled={cancelling} className="btn-secondary">
                        Keep it
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmCancel(true)} className="btn-secondary mt-3 !border-red-300 !text-red-700 hover:!bg-red-100">
                      <XCircle className="h-4 w-4" aria-hidden="true" /> Cancel application
                    </button>
                  )}
                </section>
              )}

              {canEdit && (
                <p className="notice">
                  <span className="font-bold text-brand-900">Your loan is approved.</span> When you have paid the money back, upload your proof of payment
                  below. You can upload up to 3 files and replace them while the loan is approved.
                </p>
              )}

              {(canEdit || proofs.length > 0 || canCancel) && (
                <ProofOfPaymentPanel
                  applicationId={app.id}
                  proofs={proofs}
                  canEdit={canEdit}
                  mode="user"
                  supabase={supabase}
                  onChange={setProofs}
                  emptyHint="You can upload proof of payment once your loan has been approved."
                />
              )}
              {!canEdit && proofs.length > 0 && <p className="text-xs text-slate-500">Proof of payment can only be changed while the loan is approved.</p>}
            </div>
          )}
          <DocFooter label="Loan Application" page={1} pages={1} />
        </section>
      </div>
    </main>
  );
}
