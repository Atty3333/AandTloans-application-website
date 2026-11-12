import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center" role="status" aria-label="Loading">
      <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
    </main>
  );
}
