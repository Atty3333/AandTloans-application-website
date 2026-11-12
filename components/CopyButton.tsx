'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Small "copy to clipboard" button (e.g. for an application reference). Fails silently when the clipboard is unavailable. */
export default function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  };
  return (
    <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900" aria-label={`${label} ${text}`}>
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? 'Copied' : label}
    </button>
  );
}
