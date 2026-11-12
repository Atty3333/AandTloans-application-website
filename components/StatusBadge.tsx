import type { LoanStatus } from '@/lib/config';
import { STATUS_LABELS } from '@/lib/status';

const STYLES: Record<LoanStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  REJECTED: 'bg-red-100 text-red-800',
  DISBURSED: 'bg-brand-100 text-brand-800',
  REPAID: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-slate-200 text-slate-700',
};

export default function StatusBadge({ status, plain = false }: { status: LoanStatus; plain?: boolean }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status] ?? STYLES.PENDING}`}>
      {plain ? status : (STATUS_LABELS[status] ?? status)}
    </span>
  );
}
