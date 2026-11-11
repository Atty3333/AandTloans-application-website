'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/BrandHeader';
import { useSession } from '@/lib/use-session';

export default function ResetPasswordPage() {
  const router = useRouter();
  const { supabase, session, ready } = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);

  // The emailed link signs the user in via the URL hash; give it a moment before declaring it invalid.
  useEffect(() => {
    if (!ready || session) return;
    const t = setTimeout(() => setExpired(true), 2500);
    return () => clearTimeout(t);
  }, [ready, session]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(err.message);
    else router.replace('/');
  };

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <SiteHeader subtitle="Reset your password" />
        {session ? (
          <form onSubmit={submit} className="paper mx-auto w-full max-w-sm space-y-4 p-6">
            <h1 className="section-title">Choose a new password</h1>
            <label className="label-caps">
              New password
              <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-box" />
            </label>
            <label className="label-caps">
              Confirm password
              <input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input-box" />
            </label>
            {error && (
              <p role="alert" className="text-xs text-red-600">
                {error}
              </p>
            )}
            <button disabled={busy} className="btn-primary w-full">
              {busy ? 'Saving…' : 'Save password'}
            </button>
          </form>
        ) : expired ? (
          <div className="paper mx-auto max-w-sm space-y-3 p-6 text-sm text-slate-700">
            <p>This reset link is invalid or has expired.</p>
            <Link href="/" className="font-semibold text-brand-700 hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <p className="text-center text-sm text-slate-500">Checking your reset link…</p>
        )}
      </div>
    </main>
  );
}
