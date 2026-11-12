'use client';

import { Printer } from 'lucide-react';

/** Opens the browser print dialog (also "Save as PDF"). Page chrome is hidden by the print rules in globals.css. */
export default function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary no-print">
      <Printer className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </button>
  );
}
