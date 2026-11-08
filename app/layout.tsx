import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LENDER_NAME } from '@/lib/config';

export const metadata: Metadata = {
  title: LENDER_NAME,
  description: 'Fast, flexible student loan applications.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
