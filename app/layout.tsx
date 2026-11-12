import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LENDER_NAME } from '@/lib/config';

export const metadata: Metadata = {
  title: { default: LENDER_NAME, template: `%s · ${LENDER_NAME}` },
  description: 'Fast, flexible student loan applications.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4c1d95',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-900 focus:shadow">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
