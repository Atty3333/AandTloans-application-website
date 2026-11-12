import type { LoanStatus } from './config';
import { ALL_STATUSES } from './config';

export interface StatRow {
  status: LoanStatus;
  loan_amount_requested: number | string | null;
  created_at: string;
}

export interface LoanSummary {
  total: number;
  byStatus: Record<LoanStatus, number>;
  /** Sum of requested amounts per status (BWP). */
  amountByStatus: Record<LoanStatus, number>;
  /** Money currently out of the door and not yet repaid: DISBURSED. */
  outstanding: number;
  /** Money requested by applications still waiting for a reply. */
  awaiting: number;
}

const zero = (): Record<LoanStatus, number> => Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<LoanStatus, number>;

export function summarize(rows: readonly StatRow[]): LoanSummary {
  const byStatus = zero();
  const amountByStatus = zero();
  for (const r of rows) {
    byStatus[r.status] += 1;
    const n = Number(r.loan_amount_requested);
    if (Number.isFinite(n)) amountByStatus[r.status] += n;
  }
  return {
    total: rows.length,
    byStatus,
    amountByStatus,
    outstanding: amountByStatus.DISBURSED,
    awaiting: amountByStatus.PENDING,
  };
}

export type SortKey = 'newest' | 'oldest' | 'amount-high' | 'amount-low' | 'name';
export const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  'amount-high': 'Amount: high to low',
  'amount-low': 'Amount: low to high',
  name: 'Name A–Z',
};

/** Returns a sorted copy; ties fall back to newest first so the order is stable. */
export function sortRows<T extends StatRow & { full_name?: string | number | null }>(rows: readonly T[], key: SortKey): T[] {
  const time = (r: T) => new Date(r.created_at).getTime() || 0;
  const amount = (r: T) => Number(r.loan_amount_requested) || 0;
  const byNewest = (a: T, b: T) => time(b) - time(a);
  const compare: Record<SortKey, (a: T, b: T) => number> = {
    newest: byNewest,
    oldest: (a, b) => time(a) - time(b),
    'amount-high': (a, b) => amount(b) - amount(a) || byNewest(a, b),
    'amount-low': (a, b) => amount(a) - amount(b) || byNewest(a, b),
    name: (a, b) => String(a.full_name ?? '').localeCompare(String(b.full_name ?? ''), 'en', { sensitivity: 'base' }) || byNewest(a, b),
  };
  return [...rows].sort(compare[key]);
}
