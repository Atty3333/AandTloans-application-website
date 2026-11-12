'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app] unhandled error', error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div role="alert" className="paper max-w-sm space-y-3 p-6 text-center">
        <h1 className="section-title">Something went wrong</h1>
        <p className="text-sm text-slate-600">An unexpected error occurred. Your data has not been changed. Please try again.</p>
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
      </div>
    </main>
  );
}
