import { ShieldCheck } from 'lucide-react';
import ApplicationForm from '@/components/ApplicationForm';
import { LENDER_NAME } from '@/lib/config';

export default function LoanApplicationPage() {
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
        <ApplicationForm />
      </div>
    </main>
  );
}
