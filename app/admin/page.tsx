'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { FileText, LogOut, RefreshCw } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase-browser';
import { ALL_STATUSES, STORAGE_BUCKET, formatBwp, type LoanStatus } from '@/lib/config';

interface LoanRow {
  id: string;
  created_at: string;
  full_name: string;
  date_of_birth: string;
  id_number: string;
  phone_number: string;
  email: string;
  address: string;
  institution: string;
  monthly_income: number;
  loan_amount_requested: number;
  loan_purpose: string;
  kin_full_name: string;
  kin_relationship: string;
  kin_id_number: string;
  kin_phone: string;
  kin_alt_phone: string | null;
  kin_address: string;
  pdf_path: string;
  pdf_sha256: string;
  whatsapp_notified_at: string | null;
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
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Gaborone' }).format(new Date(iso));

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

  const changeStatus = async (row: LoanRow, status: LoanStatus) => {
    if (status === row.status) return;
    if (!window.confirm(`Change ${row.full_name} from ${row.status} to ${status}?`)) return;
    const { error } = await supabase.from('loan_applications').update({ status }).eq('id', row.id);
    if (error) {
      setMessage(
        error.code === '23505'
          ? 'Another active application already exists for this Omang number.'
          : `Could not update status: ${error.message}`,
      );
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
  };

  const openPdf = async (row: LoanRow) => {
    const tab = window.open('', '_blank');
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(row.pdf_path, 300);
    if (error || !data) {
      tab?.close();
      setMessage(`Could not open document: ${error?.message ?? 'unknown error'}`);
      return;
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = data.signedUrl;
    } else {
      window.location.href = data.signedUrl;
    }
  };

  const visible = rows.filter((r) => {
    if (filter !== 'ALL' && r.status !== filter) return false;
    const q = search.trim().toLowerCase();
    return !q || [r.full_name, r.id_number, r.phone_number, r.id.slice(0, 8)].some((v) => v.toLowerCase().includes(q));
  });

  if (!ready) return <main className="min-h-screen grid place-items-center text-sm text-gray-500">Loading…</main>;

  if (!session) {
    return (
      <main className="min-h-screen grid place-items-center bg-gray-50 p-4">
        <form onSubmit={signIn} className="w-full max-w-sm bg-white border rounded-xl shadow-sm p-6 space-y-4">
          <h1 className="text-xl font-bold text-brand-900">Admin sign in</h1>
          <label className="block text-xs font-semibold text-gray-700">
            Email
            <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full mt-1 p-2 border rounded-md text-sm" />
          </label>
          <label className="block text-xs font-semibold text-gray-700">
            Password
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full mt-1 p-2 border rounded-md text-sm" />
          </label>
          {message && <p role="alert" className="text-xs text-red-600">{message}</p>}
          <button disabled={busy} className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-2 rounded-lg">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-brand-900">Loan applications</h1>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 hidden sm:inline">{session.user.email}</span>
            <button onClick={() => void load()} disabled={busy || !isAdmin} className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-md bg-white hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
            </button>
            <button onClick={() => void supabase.auth.signOut()} className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-md bg-white hover:bg-gray-50">
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" /> Sign out
            </button>
          </div>
        </header>

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
                className="flex-1 min-w-[220px] p-2 border rounded-md text-sm"
                aria-label="Search applications"
              />
              <select value={filter} onChange={(e) => setFilter(e.target.value as LoanStatus | 'ALL')} className="p-2 border rounded-md text-sm" aria-label="Filter by status">
                <option value="ALL">All statuses</option>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {message && <p role="alert" className="text-sm text-red-600">{message}</p>}

            <ul className="space-y-2">
              {visible.map((r) => (
                <li key={r.id} className="bg-white border rounded-lg">
                  <button
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                    aria-expanded={open === r.id}
                    className="w-full text-left p-4 flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      <span className="font-semibold text-gray-900">{r.full_name}</span>
                      <span className="block text-xs text-gray-500">
                        {r.id.slice(0, 8).toUpperCase()} · {fmtDate(r.created_at)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-semibold">{formatBwp(Number(r.loan_amount_requested))}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                    </span>
                  </button>

                  {open === r.id && (
                    <div className="border-t p-4 space-y-4 text-sm">
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        {([
                          ['Omang', r.id_number],
                          ['Date of birth', r.date_of_birth],
                          ['Phone', r.phone_number],
                          ['Email', r.email],
                          ['Address', r.address],
                          ['Institution', r.institution],
                          ['Monthly income', formatBwp(Number(r.monthly_income))],
                          ['Purpose', r.loan_purpose],
                          ['Next of kin', `${r.kin_full_name} (${r.kin_relationship})`],
                          ['Kin ID', r.kin_id_number],
                          ['Kin phone', [r.kin_phone, r.kin_alt_phone].filter(Boolean).join(' / ')],
                          ['Kin address', r.kin_address],
                          ['WhatsApp sent', r.whatsapp_notified_at ? fmtDate(r.whatsapp_notified_at) : 'No'],
                          ['PDF SHA-256', r.pdf_sha256.slice(0, 16) + '…'],
                        ] as const).map(([k, v]) => (
                          <div key={k}>
                            <dt className="text-xs text-gray-500">{k}</dt>
                            <dd className="text-gray-900 break-words">{v}</dd>
                          </div>
                        ))}
                      </dl>

                      <div className="flex flex-wrap items-center gap-3">
                        <button onClick={() => void openPdf(r)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-md">
                          <FileText className="w-4 h-4" aria-hidden="true" /> View signed PDF
                        </button>
                        <label className="text-xs text-gray-600">
                          Status{' '}
                          <select value={r.status} onChange={(e) => void changeStatus(r, e.target.value as LoanStatus)} className="ml-1 p-1.5 border rounded-md text-sm">
                            {ALL_STATUSES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!busy && visible.length === 0 && <p className="text-sm text-gray-500">No applications found.</p>}
          </>
        )}
      </div>
    </main>
  );
}
