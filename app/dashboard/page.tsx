'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, Loader2, LogOut, Plus, ShieldCheck } from 'lucide-react';
import { DocFooter, DocHeader, SiteHeader } from '@/components/BrandHeader';
import StatusBadge from '@/components/StatusBadge';
import { formatDate } from '@/lib/applications';
import { formatBwp, isAwaitingReply, type LoanStatus } from '@/lib/config';
import { useSession } from '@/lib/use-session';

interface MyApplication {
  id: string;
  created_at: string;
  loan_amount_requested: number;
  loan_purpose: string;
  status: LoanStatus;
  status_updated_at: string | null;
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

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <SiteHeader subtitle={session.user.email ?? undefined} href="/dashboard">
          {isAdmin && (
            <Link href="/admin" className="btn-secondary">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Admin
            </Link>
          )}
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
                    {awaiting.id.slice(0, 8).toUpperCase()}) was received on {formatDate(awaiting.created_at)}. You can apply for another loan once
                    we have replied.
                  </p>
                </div>
              ) : latest ? (
                <p className="notice mb-5">
                  <span className="font-bold text-brand-900">Replied:</span> your latest application was{' '}
                  <span className="font-semibold">{latest.status.toLowerCase()}</span>
                  {latest.status_updated_at ? ` on ${formatDate(latest.status_updated_at)}` : ''}. You can apply for another loan whenever you are
                  ready.
                </p>
              ) : (
                <p className="notice mb-5">
                  <span className="font-bold text-brand-900">Welcome.</span> You have not applied yet. Apply below. You will need your bank
                  statement, Omang (front and back), registration letter and student ID.
                </p>
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
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <span>
                        <span className="font-semibold text-slate-900">{formatBwp(Number(a.loan_amount_requested))}</span>
                        <span className="text-slate-500"> · {a.loan_purpose}</span>
                        <span className="block text-xs text-slate-500">
                          Ref {a.id.slice(0, 8).toUpperCase()} · Applied {formatDate(a.created_at)}
                          {!isAwaitingReply(a.status) && a.status_updated_at ? ` · Replied ${formatDate(a.status_updated_at)}` : ''}
                        </span>
                      </span>
                      <StatusBadge status={a.status} />
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
