'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase-browser';

type Mode = 'signin' | 'signup' | 'forgot';

const TITLES: Record<Mode, string> = {
  signin: 'Sign in',
  signup: 'Create your account',
  forgot: 'Reset your password',
};

export default function AuthForm() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
    setConfirm('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);

    if (mode !== 'forgot' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (mode === 'signup' && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const supabase = getBrowserClient();

      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) {
          setError(
            err.message.toLowerCase().includes('email not confirmed')
              ? 'Please confirm your email first. Check your inbox for the confirmation link.'
              : 'Incorrect email or password.',
          );
        }
        // On success the page's session listener redirects.
      } else if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (err) setError(err.message);
        else if (!data.session) {
          setNotice('Almost done. Check your email and click the confirmation link, then come back and sign in.');
          setMode('signin');
          setPassword('');
          setConfirm('');
        }
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (err) setError(err.message);
        else setNotice('If that email has an account, a reset link is on its way.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full mt-1 p-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600';

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-xl shadow-sm p-6 space-y-4 w-full max-w-sm mx-auto">
      <h2 className="text-lg font-bold text-gray-900">{TITLES[mode]}</h2>

      <label className="block text-xs font-semibold text-gray-700">
        Email address
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
      </label>

      {mode !== 'forgot' && (
        <label className="block text-xs font-semibold text-gray-700">
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
        </label>
      )}

      {mode === 'signup' && (
        <label className="block text-xs font-semibold text-gray-700">
          Confirm password
          <input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
        </label>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-green-700">
          {notice}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
      </button>

      <div className="text-xs text-gray-600 flex flex-wrap justify-between gap-2">
        {mode === 'signin' ? (
          <>
            <button type="button" onClick={() => switchMode('signup')} className="text-brand-600 hover:underline">
              New here? Create an account
            </button>
            <button type="button" onClick={() => switchMode('forgot')} className="text-brand-600 hover:underline">
              Forgot password?
            </button>
          </>
        ) : (
          <button type="button" onClick={() => switchMode('signin')} className="text-brand-600 hover:underline">
            Back to sign in
          </button>
        )}
      </div>
    </form>
  );
}
