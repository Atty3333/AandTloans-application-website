import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LENDER_NAME } from '@/lib/config';

/** Top bar used on every page: logo left, actions right, purple rule underneath (as on the legal documents). */
export function SiteHeader({ children, subtitle, href = '/' }: { children?: ReactNode; subtitle?: string; href?: string }) {
  return (
    <header className="border-b-2 border-brand-700 pb-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={href} className="flex items-center gap-3" aria-label={`${LENDER_NAME} home`}>
          <Image src="/logo.jpg" alt="" width={72} height={58} priority className="rounded-sm" />
          <span className="hidden sm:block">
            <span className="block font-heading text-sm font-bold uppercase tracking-widest text-brand-900">{LENDER_NAME}</span>
            {subtitle && <span className="block text-xs text-slate-500">{subtitle}</span>}
          </span>
        </Link>
        {children && <div className="flex flex-wrap items-center gap-2 text-sm">{children}</div>}
      </div>
    </header>
  );
}

/** Heading block for a "document" card: title right-aligned with the lender name beneath, like the PDFs. */
export function DocHeader({ lines }: { lines: readonly string[] }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4 border-b border-brand-700 pb-4">
      <Image src="/logo.jpg" alt="" width={72} height={58} className="shrink-0 rounded-sm" />
      <div className="text-right">
        {lines.map((l) => (
          <h2 key={l} className="font-heading text-lg font-bold uppercase leading-tight tracking-wide text-brand-900 sm:text-xl">
            {l}
          </h2>
        ))}
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-700">{LENDER_NAME}</p>
      </div>
    </div>
  );
}

export function DocFooter({ label, page, pages }: { label: string; page: number; pages: number }) {
  return (
    <div className="mt-6 flex justify-between border-t border-slate-200 pt-2 text-[10px] text-slate-500">
      <span>
        {LENDER_NAME} — {label}
      </span>
      <span>
        Page {page} of {pages}
      </span>
    </div>
  );
}
