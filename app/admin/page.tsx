'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Download, Hourglass, LogOut, RefreshCw } from 'lucide-react';
import AdminUsersTab from '@/components/AdminUsersTab';
import AdminWarningPanel from '@/components/AdminWarningPanel';
import ProfileLink from '@/components/ProfileLink';
import AdminApplicationPanel from '@/components/AdminApplicationPanel';
import { SiteHeader } from '@/components/BrandHeader';
import StatusBadge from '@/components/StatusBadge';
import { formatDateTime, type LoanRow } from '@/lib/applications';
import { ALL_STATUSES, formatBwp, type LoanStatus } from '@/lib/config';
import { parseProofs } from '@/lib/proofs';
import { isStale, shortRef, STALE_AFTER_DAYS, waitingLabel } from '@/lib/status';
import { SORT_LABELS, sortRows, summarize, type SortKey } from '@/lib/stats';
import { applicationsToCsv } from '@/lib/export';
import { getBrowserClient } from '@/lib/supabase-browser';

const PAGE_SIZE = 25;

export default function AdminPage() {
  const supabase = useMemo(() => getBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rows, setRows] = useState<LoanRow[]>([]);
  const [filter, setFilter] = useState<LoanStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('newest');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [tab, setTab] = useState<'applications' | 'users'>('applications');

  const isAdmin = session?.user.app_metadata?.role === 'admin';

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  const load = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase
      .from('loan_applications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) setMessage(`Could not load applications: ${error.message}`);
    else setRows((data ?? []) as LoanRow[]);
    setBusy(false);
  }, [supabase]);

  useEffect(() => {
    if (session && isAdmin) void load();
    else setRows([]);
  }, [session, isAdmin, load]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    setPassword('');
    setBusy(false);
  };

  const replaceRow = (next: LoanRow) => setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)));

  /** Confirm, update the status, and return the updated row (null when cancelled or failed). */
  const changeStatus = async (row: LoanRow, status: LoanStatus): Promise<LoanRow | null> => {
    if (status === row.status) return null;
    if (!window.confirm(`Change ${row.full_name} from ${row.status} to ${status}?`)) return null;
    const { data, error } = await supabase.from('loan_applications').update({ status }).eq('id', row.id).select('*').single();
    if (error) {
      setMessage(
        error.code === '23505'
          ? 'Another application waiting for a reply already exists for this Omang number.'
          : `Could not update status: ${error.message}`,
      );
      return null;
    }
    const next = { ...row, ...(data as LoanRow) };
    replaceRow(next);
    setMessage(null);
    return next;
  };

  const matching = rows.filter((r) => {
    if (filter !== 'ALL' && r.status !== filter) return false;
    const q = search.trim().toLowerCase();
    return !q || [r.full_name, r.id_number, r.phone_number, r.whatsapp_number, r.email, shortRef(r.id)].some((v) => String(v ?? '').toLowerCase().includes(q));
  });
  const visible = sortRows(matching, sort);
  const page = visible.slice(0, shown);
  const summary = summarize(rows);
  const staleCount = rows.filter((r) => isStale(r.status, r.created_at)).length;

  const counts = ALL_STATUSES.map((s) => [s, summary.byStatus[s]] as const);

  const exportCsv = () => {
    const blob = new Blob([applicationsToCsv(visible)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `applications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const missingProof = rows.filter((r) => r.status === 'APPROVED' && parseProofs(r.proof_of_payments).length === 0).length;

  if (!ready) return <main className="grid min-h-screen place-items-center text-sm text-slate-500">Loading…</main>;

  if (!session) {
    return (
      <main id="main" className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <SiteHeader subtitle="Admin" />
          <form onSubmit={signIn} className="paper mx-auto w-full max-w-sm space-y-4 p-6">
            <h1 className="section-title">Admin sign in</h1>
            <label className="label-caps">
              Email
              <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="input-box" />
            </label>
            <label className="label-caps">
              Password
              <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-box" />
            </label>
            {message && (
              <p role="alert" className="text-xs text-red-600">
                {message}
              </p>
            )}
            <button disabled={busy} className="btn-primary w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main id="main" className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <SiteHeader subtitle="Admin — loan applications" href="/admin">
          <span className="hidden text-slate-500 sm:inline">{session.user.email}</span>
          <ProfileLink />
          <button onClick={() => void load()} disabled={busy || !isAdmin} className="btn-secondary">
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
          </button>
          <button onClick={() => void supabase.auth.signOut()} className="btn-secondary">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out
          </button>
        </SiteHeader>

        {!isAdmin ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            This account does not have admin access. Ask the owner to grant the admin role, then sign out and in again.
          </p>
        ) : (
          <>
            <div role="tablist" aria-label="Admin sections" className="flex gap-1 border-b border-brand-200">
              {(['applications', 'users'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`-mb-px rounded-t-md border px-4 py-2 text-sm font-semibold ${tab === t ? 'border-brand-200 border-b-white bg-white text-brand-900' : 'border-transparent text-slate-500 hover:text-brand-800'}`}
                >
                  {t === 'applications' ? 'Applications' : 'Users'}
                </button>
              ))}
            </div>

            {message && (
              <p role="status" className="text-sm text-brand-800">
                {message}
              </p>
            )}

            {tab === 'users' ? (
              <AdminUsersTab supabase={supabase} onMessage={setMessage} onStatusChange={changeStatus} />
            ) : (
            <>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Applications by status">
              {counts.map(([s, n]) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => {
                      setFilter(filter === s ? 'ALL' : s);
                      setShown(PAGE_SIZE);
                    }}
                    aria-pressed={filter === s}
                    className={`paper w-full p-2 text-center transition hover:bg-brand-50 ${filter === s ? 'ring-2 ring-brand-400' : ''}`}
                  >
                    <span className="block text-lg font-bold text-slate-900">{n}</span>
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">{s}</span>
                  </button>
                </li>
              ))}
            </ul>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Money summary">
              {[
                ['Awaiting reply', formatBwp(summary.awaiting)],
                ['Approved', formatBwp(summary.amountByStatus.APPROVED)],
                ['Out on loan', formatBwp(summary.outstanding)],
                ['Repaid', formatBwp(summary.amountByStatus.REPAID)],
              ].map(([label, value]) => (
                <div key={label} className="paper p-3">
                  <dt className="label-caps">{label}</dt>
                  <dd className="mt-0.5 text-base font-bold text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
            {staleCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setFilter('PENDING');
                  setSort('oldest');
                  setShown(PAGE_SIZE);
                }}
                className="notice flex w-full items-center gap-2 text-left hover:bg-brand-100"
              >
                <Hourglass className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
                <span>
                  <span className="font-bold text-brand-900">{staleCount} application{staleCount === 1 ? '' : 's'}</span> waiting for a reply for {STALE_AFTER_DAYS}+ days. Click to
                  show the oldest first.
                </span>
              </button>
            )}
            <AdminWarningPanel supabase={supabase} pendingCount={missingProof} onMessage={setMessage} />
            <div className="flex flex-wrap gap-2">
              <input
                type="search"
                placeholder="Search name, Omang, phone, WhatsApp, email or reference"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShown(PAGE_SIZE);
                }}
                className="input-box !mt-0 min-w-[220px] flex-1"
                aria-label="Search applications"
              />
              <select value={filter} onChange={(e) => {
                  setFilter(e.target.value as LoanStatus | 'ALL');
                  setShown(PAGE_SIZE);
                }} className="rounded-md border border-indigo-200 bg-white p-2 text-sm" aria-label="Filter by status">
                <option value="ALL">All statuses</option>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-md border border-indigo-200 bg-white p-2 text-sm" aria-label="Sort applications">
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABELS[k]}
                  </option>
                ))}
              </select>
              <button type="button" onClick={exportCsv} disabled={visible.length === 0} className="btn-secondary" title="Download the listed applications as a CSV file">
                <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export CSV
              </button>
            </div>

            <ul className="space-y-2">
              {page.map((r) => (
                <li key={r.id} className="paper">
                  <button
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                    aria-expanded={open === r.id}
                    className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left"
                  >
                    <span>
                      <span className="font-semibold text-slate-900">{r.full_name}</span>
                      <span className="block text-xs text-slate-500">
                        {shortRef(r.id)} · {formatDateTime(r.created_at)}
                        {r.status === 'PENDING' && (
                          <span className={isStale(r.status, r.created_at) ? 'ml-2 font-semibold text-amber-700' : 'ml-2'}>· waiting {waitingLabel(r.created_at)}</span>
                        )}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-semibold">{formatBwp(Number(r.loan_amount_requested))}</span>
                      {r.status === 'APPROVED' && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${parseProofs(r.proof_of_payments).length ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                          {parseProofs(r.proof_of_payments).length ? `${parseProofs(r.proof_of_payments).length} proof` : 'No proof'}
                        </span>
                      )}
                      <StatusBadge status={r.status} plain />
                    </span>
                  </button>
                  {open === r.id && (
                    <AdminApplicationPanel row={r} supabase={supabase} onRowChange={replaceRow} onStatusChange={changeStatus} onMessage={setMessage} />
                  )}
                </li>
              ))}
            </ul>
            {visible.length > page.length && (
              <button type="button" onClick={() => setShown((n) => n + PAGE_SIZE)} className="btn-secondary w-full">
                Show {Math.min(PAGE_SIZE, visible.length - page.length)} more ({page.length} of {visible.length})
              </button>
            )}
            {!busy && visible.length === 0 && <p className="text-sm text-slate-500">No applications found.</p>}
            </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
