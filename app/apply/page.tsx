'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut, ShieldCheck } from 'lucide-react';
import ApplicationForm from '@/components/ApplicationForm';
import { ACTIVE_STATUSES, LENDER_NAME, formatBwp, type LoanStatus } from '@/lib/config';
import { useSession } from '@/lib/use-session';

interface MyApplication {
  id: string;
  created_at: string;
  loan_amount_requested: number;
  loan_purpose: string;
  status: LoanStatus;
}

const STATUS_STYLES: Record<LoanStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  REJECTED: 'bg-red-100 text-red-800',
  DISBURSED: 'bg-indigo-100 text-indigo-800',
  REPAID: 'bg-green-100 text-green-800',
};

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Africa/Gaborone' }).format(new Date(iso));

export default function ApplyPage() {
  const router = useRouter();
  const { supabase, session, ready, isAdmin } = useSession();
  const [apps, setApps] = useState<MyApplication[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Decided once on first load so the form's success screen isn't replaced right after submitting.
  const [showForm, setShowForm] = useState<boolean | null>(null);

  useEffect(() => {
    if (ready && !session) router.replace('/');
  }, [ready, session, router]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('my_loan_applications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError('Could not load your applications. Please refresh the page.');
      setShowForm((prev) => prev ?? true);
      return;
    }
    const rows = (data ?? []) as MyApplication[];
    setApps(rows);
    setLoadError(null);
    setShowForm((prev) => prev ?? !rows.some((r) => (ACTIVE_STATUSES as readonly string[]).includes(r.status)));
  }, [supabase]);

  useEffect(() => {
    if (session) void load();
  }, [session, load]);

  if (!ready || !session) {
    return (
      <main className="min-h-screen grid place-items-center" role="status" aria-label="Loading">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="bg-white p-6 rounded-xl shadow-sm flex flex-wrap items-center justify-between gap-3 border">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-brand-600" aria-hidden="true" />
            <div>
              <h1 className="text-xl font-bold text-brand-900">{LENDER_NAME}</h1>
              <p className="text-xs text-gray-500">Signed in as {session.user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {isAdmin && (
              <a href="/admin" className="px-3 py-1.5 border rounded-md bg-white hover:bg-gray-50">
                Admin dashboard
              </a>
            )}
            <button
              onClick={() => void supabase.auth.signOut()}
              className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-md bg-white hover:bg-gray-50"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" /> Sign out
            </button>
          </div>
        </header>

        {loadError && (
          <p role="alert" className="text-sm text-red-600">
            {loadError}
          </p>
        )}

        {apps && apps.length > 0 && (
          <section className="bg-white border rounded-xl p-6 space-y-3" aria-labelledby="my-apps">
            <h2 id="my-apps" className="text-lg font-bold text-gray-900">
              Your applications
            </h2>
            <ul className="divide-y">
              {apps.map((a) => (
                <li key={a.id} className="py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-semibold text-gray-900">{formatBwp(Number(a.loan_amount_requested))}</span>
                    <span className="text-gray-500"> · {a.loan_purpose}</span>
                    <span className="block text-xs text-gray-500">
                      Ref {a.id.slice(0, 8).toUpperCase()} · {fmtDate(a.created_at)}
                    </span>
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[a.status]}`}>{a.status}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {showForm === null ? (
          <div className="flex justify-center py-6" role="status" aria-label="Loading">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : showForm ? (
          <ApplicationForm accessToken={session.access_token} defaultEmail={session.user.email ?? ''} onSubmitted={() => void load()} />
        ) : (
          <p className="bg-white border rounded-xl p-6 text-sm text-gray-700">
            You already have an application in progress. You can apply again once it has been rejected or repaid.
          </p>
        )}
      </div>
    </main>
  );
}
