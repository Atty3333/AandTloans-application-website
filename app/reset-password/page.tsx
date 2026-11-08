'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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

  const input = 'w-full mt-1 p-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600';

  return (
    <main className="min-h-screen grid place-items-center bg-gray-50 p-4">
      {session ? (
        <form onSubmit={submit} className="w-full max-w-sm bg-white border rounded-xl shadow-sm p-6 space-y-4">
          <h1 className="text-lg font-bold text-gray-900">Choose a new password</h1>
          <label className="block text-xs font-semibold text-gray-700">
            New password
            <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
          </label>
          <label className="block text-xs font-semibold text-gray-700">
            Confirm password
            <input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
          </label>
          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
          <button disabled={busy} className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-lg">
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </form>
      ) : expired ? (
        <div className="max-w-sm bg-white border rounded-xl p-6 text-sm text-gray-700 space-y-3">
          <p>This reset link is invalid or has expired.</p>
          <a href="/" className="text-brand-600 hover:underline">
            Back to sign in
          </a>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Checking your reset link…</p>
      )}
    </main>
  );
}
