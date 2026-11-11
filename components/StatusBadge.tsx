import type { LoanStatus } from '@/lib/config';

const STYLES: Record<LoanStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  REJECTED: 'bg-red-100 text-red-800',
  DISBURSED: 'bg-brand-100 text-brand-800',
  REPAID: 'bg-green-100 text-green-800',
};

const LABELS: Record<LoanStatus, string> = {
  PENDING: 'Awaiting reply',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  DISBURSED: 'Disbursed',
  REPAID: 'Repaid',
};

export default function StatusBadge({ status, plain = false }: { status: LoanStatus; plain?: boolean }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status]}`}>
      {plain ? status : LABELS[status]}
    </span>
  );
}
