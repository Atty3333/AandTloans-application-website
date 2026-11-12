'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Clock, Loader2, LogOut, Plus, ShieldCheck, Upload } from 'lucide-react';
import { DocFooter, DocHeader, SiteHeader } from '@/components/BrandHeader';
import ProfileLink from '@/components/ProfileLink';
import StatusBadge from '@/components/StatusBadge';
import { formatDate } from '@/lib/applications';
import { formatBwp, isAwaitingReply, type LoanStatus } from '@/lib/config';
import { parseProofs } from '@/lib/proofs';
import { shortRef, STATUS_HINTS } from '@/lib/status';
import { summarize } from '@/lib/stats';
import { useSession } from '@/lib/use-session';

interface MyApplication {
  id: string;
  created_at: string;
  loan_amount_requested: number;
  loan_purpose: string;
  status: LoanStatus;
  status_updated_at: string | null;
  proof_of_payments: unknown;
}

/** Applicant home page: current and past loan applications, and a way to apply again once the lender has replied. */
export default function DashboardPage() {
  const router = useRouter();
  const { supabase, session, ready, isAdmin } = useSession();
  const [apps, setApps] = useState<MyApplication[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !session) router.replace('/');
  }, [ready, session, router]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('my_loan_applications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[dashboard] could not load applications', error);
      setLoadError('Could not load your applications. Please refresh the page.');
      setApps([]);
      return;
    }
    setApps((data ?? []) as MyApplication[]);
    setLoadError(null);
  }, [supabase]);

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

  const awaiting = apps?.find((a) => isAwaitingReply(a.status));
  const latest = apps?.[0];
  const canApply = apps !== null && !loadError && !awaiting;
  const summary = apps ? summarize(apps) : null;
  const needsProof = apps?.filter((a) => a.status === 'APPROVED' && parseProofs(a.proof_of_payments).length === 0) ?? [];

  return (
    <main id="main" className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <SiteHeader subtitle={session.user.email ?? undefined} href="/dashboard">
          {isAdmin && (
            <Link href="/admin" className="btn-secondary">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Admin
            </Link>
          )}
          <ProfileLink />
          <button onClick={() => void supabase.auth.signOut()} className="btn-secondary">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out
          </button>
        </SiteHeader>

        <section className="paper p-5 sm:p-7" aria-labelledby="my-loans">
          <DocHeader lines={['MY LOAN APPLICATIONS']} />
          <h1 id="my-loans" className="sr-only">
            My loan applications
          </h1>

          {loadError && (
            <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {loadError}
            </p>
          )}

          {apps === null ? (
            <div className="flex justify-center py-8" role="status" aria-label="Loading">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : (
            <>
              {awaiting ? (
                <div className="notice mb-5 flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
                  <p>
                    <span className="font-bold text-brand-900">Awaiting reply:</span> your application for{' '}
                    <span className="font-semibold">{formatBwp(Number(awaiting.loan_amount_requested))}</span> (Ref{' '}
                    {shortRef(awaiting.id)}) was received on {formatDate(awaiting.created_at)}. You can apply for another loan once
                    we have replied, or{' '}
                    <Link href={`/dashboard/applications/${awaiting.id}`} className="font-semibold text-brand-800 underline">
                      open it to view your documents or cancel it
                    </Link>
                    .
                  </p>
                </div>
              ) : latest ? (
                <p className="notice mb-5">
                  <span className="font-bold text-brand-900">{latest.status === 'CANCELLED' ? 'Cancelled:' : 'Replied:'}</span>{' '}
                  {latest.status === 'CANCELLED' ? 'you cancelled your latest application' : 'your latest application was'}{' '}
                  {latest.status === 'CANCELLED' ? '' : <span className="font-semibold">{latest.status.toLowerCase()}</span>}
                  {latest.status_updated_at ? ` on ${formatDate(latest.status_updated_at)}` : ''}. You can apply for another loan whenever you are
                  ready.
                </p>
              ) : (
                <p className="notice mb-5">
                  <span className="font-bold text-brand-900">Welcome.</span> You have not applied yet. Apply below. You will need your bank
                  statement, Omang (front and back), registration letter and student ID.
                </p>
              )}

              {needsProof.map((a) => (
                <Link key={a.id} href={`/dashboard/applications/${a.id}`} className="notice mb-5 flex items-start gap-3 hover:bg-brand-100">
                  <Upload className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
                  <span>
                    <span className="font-bold text-brand-900">Your loan was approved.</span> Paid it back? Open application{' '}
                    {shortRef(a.id)} ({formatBwp(Number(a.loan_amount_requested))}) and upload your proof of payment.
                  </span>
                </Link>
              ))}

              {summary && summary.total > 0 && (
                <ul className="mb-5 grid grid-cols-3 gap-2 text-center" aria-label="Your loans at a glance">
                  {[
                    ['Applications', String(summary.total)],
                    ['Active', String(summary.byStatus.APPROVED + summary.byStatus.DISBURSED)],
                    ['Repaid', String(summary.byStatus.REPAID)],
                  ].map(([label, value]) => (
                    <li key={label} className="rounded-lg border border-brand-100 bg-brand-50/60 p-2">
                      <span className="block text-lg font-bold text-brand-900">{value}</span>
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
                    </li>
                  ))}
                </ul>
              )}

              {canApply ? (
                <Link href="/apply" className="btn-primary w-full sm:w-auto">
                  <Plus className="h-4 w-4" aria-hidden="true" /> {latest ? 'Apply for another loan' : 'Start a loan application'}
                </Link>
              ) : (
                <button type="button" disabled className="btn-primary w-full sm:w-auto" title="Available once your current application has been replied to">
                  <Plus className="h-4 w-4" aria-hidden="true" /> Apply for another loan
                </button>
              )}

              <h2 className="section-title mt-8">Application history</h2>
              {apps.length === 0 ? (
                <p className="text-sm text-slate-500">No applications yet.</p>
              ) : (
                <ul className="divide-y divide-brand-100">
                  {apps.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/dashboard/applications/${a.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md py-3 text-sm hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-300"
                      >
                        <span>
                          <span className="font-semibold text-slate-900">{formatBwp(Number(a.loan_amount_requested))}</span>
                          <span className="text-slate-500"> · {a.loan_purpose}</span>
                          <span className="block text-xs text-slate-500">
                            Ref {shortRef(a.id)} · Applied {formatDate(a.created_at)}
                            {!isAwaitingReply(a.status) && a.status_updated_at ? ` · ${a.status === 'CANCELLED' ? 'Cancelled' : 'Replied'} ${formatDate(a.status_updated_at)}` : ''}
                            {a.status === 'APPROVED' ? ` · ${parseProofs(a.proof_of_payments).length} proof(s) of payment` : ''}
                          </span>
                          <span className="mt-0.5 block max-w-md text-xs text-slate-500">{STATUS_HINTS[a.status]}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <StatusBadge status={a.status} />
                          <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <DocFooter label="My Applications" page={1} pages={1} />
        </section>
      </div>
    </main>
  );
}
