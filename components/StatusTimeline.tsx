import { Check, X } from 'lucide-react';
import type { LoanStatus } from '@/lib/config';
import { timelineSteps } from '@/lib/status';

/** Horizontal progress line for one application (stacks neatly on phones). */
export default function StatusTimeline({ status }: { status: LoanStatus }) {
  const steps = timelineSteps(status);
  return (
    <ol className="flex items-start" aria-label="Application progress">
      {steps.map((s, i) => (
        <li key={s.key} className="relative flex flex-1 flex-col items-center text-center" aria-current={s.state === 'current' ? 'step' : undefined}>
          {i > 0 && (
            <span
              aria-hidden="true"
              className={`absolute left-[-50%] top-3 h-0.5 w-full ${s.state === 'upcoming' ? 'bg-slate-200' : s.state === 'stopped' ? 'bg-slate-400' : 'bg-brand-500'}`}
            />
          )}
          <span
            className={`relative z-10 grid h-6 w-6 place-items-center rounded-full border-2 text-[10px] font-bold ${
              s.state === 'done'
                ? 'border-brand-600 bg-brand-600 text-white'
                : s.state === 'current'
                  ? 'border-brand-600 bg-white text-brand-700 ring-4 ring-brand-100'
                  : s.state === 'stopped'
                    ? 'border-slate-500 bg-slate-500 text-white'
                    : 'border-slate-300 bg-white text-slate-400'
            }`}
          >
            {s.state === 'done' ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : s.state === 'stopped' ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
          </span>
          <span className={`mt-1.5 text-[11px] leading-tight ${s.state === 'upcoming' ? 'text-slate-400' : 'font-semibold text-slate-800'}`}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
