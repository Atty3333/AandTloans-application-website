'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import AuthForm from '@/components/AuthForm';
import HowItWorks from '@/components/HowItWorks';
import { SiteHeader } from '@/components/BrandHeader';
import { useSession } from '@/lib/use-session';

export default function HomePage() {
  const router = useRouter();
  const { session, ready, isAdmin } = useSession();

  useEffect(() => {
    if (ready && session) router.replace(isAdmin ? '/admin' : '/dashboard');
  }, [ready, session, isAdmin, router]);

  const waiting = !ready || session;

  return (
    <main id="main" className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <SiteHeader subtitle="Fast & transparent financial assistance" />

        {waiting ? (
          <div className="flex justify-center py-10" role="status" aria-label="Loading">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        ) : (
          <>
            <section className="space-y-1 text-center text-sm text-slate-600">
              <p className="font-heading text-sm font-bold uppercase tracking-widest text-brand-900">Student loan applications</p>
              <p>Sign in or create an account to apply and to track your applications.</p>
            </section>
            <AuthForm />
            <HowItWorks />
          </>
        )}
      </div>
    </main>
  );
}
