import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="paper max-w-sm space-y-3 p-6 text-center">
        <h1 className="section-title">Page not found</h1>
        <p className="text-sm text-slate-600">We could not find the page you were looking for.</p>
        <Link href="/" className="btn-primary">
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
