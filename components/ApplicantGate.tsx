'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Loader2, LogOut } from 'lucide-react';
import ApplicationForm from '@/components/ApplicationForm';
import { getBrowserClient, isBrowserClientConfigured } from '@/lib/supabase-browser';

/** Requires applicants to create an account / sign in before the application form is shown. */
export default function ApplicantGate() {
  if (!isBrowserClientConfigured()) {
    return (
      <div role="alert" className="bg-white border rounded-xl shadow-sm p-6 text-sm text-amber-800 space-y-2">
        <h2 className="text-lg font-bold text-gray-900">Applications are temporarily unavailable</h2>
        <p>
          Applicant sign-in has not been configured yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY,
          then redeploy.
        </p>
      </div>
    );
  }
  return <AuthenticatedApplication />;
}

function AuthenticatedApplication() {
  const supabase = useMemo(() => getBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  if (!ready) {
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-gray-500 py-10">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading…
      </p>
    );
  }

  if (!session) return <AuthForm />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-white border rounded-xl shadow-sm px-4 py-3 text-sm">
        <span className="text-gray-600">
          Signed in as <span className="font-semibold text-gray-900">{session.user.email}</span>
        </span>
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-md bg-white hover:bg-gray-50"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" /> Sign out
        </button>
      </div>
      <ApplicationForm key={session.user.id} accessToken={session.access_token} defaultEmail={session.user.email ?? ''} />
    </div>
  );
}

function AuthForm() {
  const supabase = useMemo(() => getBrowserClient(), []);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
    setConfirm('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === 'signup') {
      if (password.length < 8) return setError('Password must be at least 8 characters.');
      if (password !== confirm) return setError('Passwords do not match.');
    }

    setBusy(true);
    if (mode === 'signin') {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
    } else {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (err) setError(err.message);
      else if (!data.session) {
        setNotice('Account created. Check your email for a confirmation link, then sign in to start your application.');
        setMode('signin');
      }
    }
    setPassword('');
    setConfirm('');
    setBusy(false);
  };

  const isSignup = mode === 'signup';

  return (
    <form onSubmit={submit} className="max-w-md w-full mx-auto bg-white border rounded-xl shadow-sm p-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-brand-900">{isSignup ? 'Create your account' : 'Sign in to apply'}</h2>
        <p className="text-xs text-gray-500 mt-1">
          {isSignup
            ? 'Create an account to start your loan application.'
            : 'You need an account to apply for a loan.'}
        </p>
      </div>
      <label className="block text-xs font-semibold text-gray-700">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mt-1 p-2 border rounded-md text-sm"
        />
      </label>
      <label className="block text-xs font-semibold text-gray-700">
        Password
        <input
          type="password"
          required
          minLength={isSignup ? 8 : undefined}
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mt-1 p-2 border rounded-md text-sm"
        />
      </label>
      {isSignup && (
        <label className="block text-xs font-semibold text-gray-700">
          Confirm password
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full mt-1 p-2 border rounded-md text-sm"
          />
        </label>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {notice && <p role="status" className="text-xs text-green-700">{notice}</p>}
      <button disabled={busy} className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-2 rounded-lg">
        {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
      </button>
      <p className="text-xs text-center text-gray-600">
        {isSignup ? 'Already have an account? ' : "Don't have an account? "}
        <button type="button" onClick={() => switchMode(isSignup ? 'signin' : 'signup')} className="font-semibold text-brand-700 hover:underline">
          {isSignup ? 'Sign in' : 'Create one'}
        </button>
      </p>
    </form>
  );
}
