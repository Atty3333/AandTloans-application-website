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
          const msg = err.message.toLowerCase();
          if (msg.includes('email not confirmed')) {
            setError('Please confirm your email first. Check your inbox for the confirmation link.');
          } else if (err.code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
            setError('Incorrect email or password.');
          } else {
            // Surface the real cause (bad API key, rate limit, paused project...) instead of hiding it.
            setError(`Sign-in failed: ${err.message}`);
          }
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

  const input = 'input-box';

  return (
    <form onSubmit={handleSubmit} className="paper mx-auto w-full max-w-sm space-y-4 p-6">
      <h2 className="section-title">{TITLES[mode]}</h2>

      <label className="label-caps">
        Email address
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
      </label>

      {mode !== 'forgot' && (
        <label className="label-caps">
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
        <label className="label-caps">
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
        className="btn-primary w-full"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
      </button>

      <div className="text-xs text-gray-600 flex flex-wrap justify-between gap-2">
        {mode === 'signin' ? (
          <>
            <button type="button" onClick={() => switchMode('signup')} className="text-brand-700 hover:underline">
              New here? Create an account
            </button>
            <button type="button" onClick={() => switchMode('forgot')} className="text-brand-700 hover:underline">
              Forgot password?
            </button>
          </>
        ) : (
          <button type="button" onClick={() => switchMode('signin')} className="text-brand-700 hover:underline">
            Back to sign in
          </button>
        )}
      </div>
    </form>
  );
}