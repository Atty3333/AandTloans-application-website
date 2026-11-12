'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  describedBy?: string;
}

/** Password field with a show/hide toggle (helps on phones, where typos are common). */
export default function PasswordInput({ label, value, onChange, autoComplete, describedBy }: Props) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label-caps">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required
          minLength={8}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          className="input-box pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 mt-1 flex items-center px-3 text-slate-500 hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-300"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
