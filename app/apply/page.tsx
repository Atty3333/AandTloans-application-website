'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import ApplicationForm from '@/components/ApplicationForm';
import { SiteHeader } from '@/components/BrandHeader';
import { isAwaitingReply } from '@/lib/config';
import { useSession } from '@/lib/use-session';

/** New loan application. Applicants with an application still awaiting a reply are sent back to their home page. */
export default function ApplyPage() {
  const router = useRouter();
  const { supabase, session, ready } = useSession();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (ready && !session) router.replace('/');
  }, [ready, session, router]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void supabase
      .from('my_loan_applications')
      .select('status')
      .then(({ data }) => {
        if (!active) return;
        if ((data ?? []).some((r: { status: string }) => isAwaitingReply(r.status))) router.replace('/dashboard');
        else setChecked(true);
      });
    return () => {
      active = false;
    };
  }, [session, supabase, router]);

  if (!ready || !session || !checked) {
    return (
      <main className="grid min-h-screen place-items-center" role="status" aria-label="Loading">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <SiteHeader subtitle={session.user.email ?? undefined} href="/dashboard">
          <Link href="/dashboard" className="btn-secondary">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> My applications
          </Link>
        </SiteHeader>
        <ApplicationForm defaultEmail={session.user.email ?? ''} />
      </div>
    </main>
  );
}
