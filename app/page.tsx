'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck } from 'lucide-react';
import AuthForm from '@/components/AuthForm';
import { LENDER_NAME } from '@/lib/config';
import { useSession } from '@/lib/use-session';

export default function HomePage() {
  const router = useRouter();
  const { session, ready, isAdmin } = useSession();

  useEffect(() => {
    if (ready && session) router.replace(isAdmin ? '/admin' : '/apply');
  }, [ready, session, isAdmin, router]);

  const waiting = !ready || session;

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="bg-white p-6 rounded-xl shadow-sm flex items-center justify-between border">
          <div>
            <h1 className="text-2xl font-bold text-brand-900">{LENDER_NAME}</h1>
            <p className="text-xs text-gray-500">Fast &amp; transparent financial assistance</p>
          </div>
          <ShieldCheck className="w-10 h-10 text-brand-600" aria-hidden="true" />
        </header>

        {waiting ? (
          <div className="flex justify-center py-10" role="status" aria-label="Loading">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : (
          <>
            <section className="text-center text-sm text-gray-600 space-y-1">
              <p className="font-semibold text-gray-900">Sign in or create an account to apply.</p>
              <p>Your account lets you submit one application and track its status.</p>
            </section>
            <AuthForm />
          </>
        )}
      </div>
    </main>
  );
}
