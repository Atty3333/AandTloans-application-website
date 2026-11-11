'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogOut, RefreshCw } from 'lucide-react';
import AdminApplicationPanel from '@/components/AdminApplicationPanel';
import { SiteHeader } from '@/components/BrandHeader';
import StatusBadge from '@/components/StatusBadge';
import { formatDateTime, type LoanRow } from '@/lib/applications';
import { ALL_STATUSES, formatBwp, type LoanStatus } from '@/lib/config';
import { getBrowserClient } from '@/lib/supabase-browser';

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

  const changeStatus = async (row: LoanRow, status: LoanStatus) => {
    if (status === row.status) return;
    if (!window.confirm(`Change ${row.full_name} from ${row.status} to ${status}?`)) return;
    const { data, error } = await supabase.from('loan_applications').update({ status }).eq('id', row.id).select('*').single();
    if (error) {
      setMessage(
        error.code === '23505'
          ? 'Another application waiting for a reply already exists for this Omang number.'
          : `Could not update status: ${error.message}`,
      );
      return;
    }
    replaceRow({ ...row, ...(data as LoanRow) });
    setMessage(null);
  };

  const visible = rows.filter((r) => {
    if (filter !== 'ALL' && r.status !== filter) return false;
    const q = search.trim().toLowerCase();
    return !q || [r.full_name, r.id_number, r.phone_number, r.id.slice(0, 8)].some((v) => String(v ?? '').toLowerCase().includes(q));
  });

  if (!ready) return <main className="grid min-h-screen place-items-center text-sm text-slate-500">Loading…</main>;

  if (!session) {
    return (
      <main className="min-h-screen px-4 py-8">
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
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <SiteHeader subtitle="Admin — loan applications" href="/admin">
          <span className="hidden text-slate-500 sm:inline">{session.user.email}</span>
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
            <div className="flex flex-wrap gap-2">
              <input
                type="search"
                placeholder="Search name, Omang, phone or reference"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-box !mt-0 min-w-[220px] flex-1"
                aria-label="Search applications"
              />
              <select value={filter} onChange={(e) => setFilter(e.target.value as LoanStatus | 'ALL')} className="rounded-md border border-indigo-200 bg-white p-2 text-sm" aria-label="Filter by status">
                <option value="ALL">All statuses</option>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {message && (
              <p role="status" className="text-sm text-brand-800">
                {message}
              </p>
            )}

            <ul className="space-y-2">
              {visible.map((r) => (
                <li key={r.id} className="paper">
                  <button
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                    aria-expanded={open === r.id}
                    className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left"
                  >
                    <span>
                      <span className="font-semibold text-slate-900">{r.full_name}</span>
                      <span className="block text-xs text-slate-500">
                        {r.id.slice(0, 8).toUpperCase()} · {formatDateTime(r.created_at)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-semibold">{formatBwp(Number(r.loan_amount_requested))}</span>
                      <StatusBadge status={r.status} plain />
                    </span>
                  </button>
                  {open === r.id && (
                    <AdminApplicationPanel row={r} supabase={supabase} onRowChange={replaceRow} onStatusChange={changeStatus} onMessage={setMessage} />
                  )}
                </li>
              ))}
            </ul>
            {!busy && visible.length === 0 && <p className="text-sm text-slate-500">No applications found.</p>}
          </>
        )}
      </div>
    </main>
  );
}
