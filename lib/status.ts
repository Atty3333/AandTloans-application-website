import { ALL_STATUSES, type LoanStatus } from './config';

/** Single source of truth for how a loan status is named, explained and drawn on a timeline. */
export const STATUS_LABELS: Record<LoanStatus, string> = {
  PENDING: 'Awaiting reply',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  DISBURSED: 'Disbursed',
  REPAID: 'Repaid',
  CANCELLED: 'Cancelled',
};

export const isLoanStatus = (value: unknown): value is LoanStatus =>
  typeof value === 'string' && (ALL_STATUSES as readonly string[]).includes(value);

/** Short reference shown to applicants and admins (first 8 characters of the application id). */
export const shortRef = (id: string): string => id.slice(0, 8).toUpperCase();

/** Plain-language "what happens next" for the applicant. */
export function statusHelp(status: LoanStatus, proofCount = 0): string {
  switch (status) {
    case 'PENDING':
      return 'We have received your application and are reviewing it. You can open it to check your documents, or cancel it while it is awaiting a reply.';
    case 'APPROVED':
      return proofCount > 0
        ? 'Your loan is approved and your proof of payment is on file. You can replace it while the loan stays approved.'
        : 'Your loan is approved. Once you have paid it back, upload your proof of payment below.';
    case 'DISBURSED':
      return 'The money has been paid out. Please repay on the agreed date.';
    case 'REPAID':
      return 'This loan has been repaid in full. Thank you! You can apply again whenever you need.';
    case 'REJECTED':
      return 'This application was not approved. You are welcome to apply again.';
    case 'CANCELLED':
      return 'You cancelled this application. You can submit a new one whenever you are ready.';
  }
}

/** One short line for list rows. */
export const STATUS_HINTS: Record<LoanStatus, string> = {
  PENDING: 'Being reviewed.',
  APPROVED: 'Approved. Upload proof of payment when you have repaid.',
  DISBURSED: 'Paid out. Repay on the agreed date.',
  REPAID: 'Repaid in full.',
  REJECTED: 'Not approved. You can apply again.',
  CANCELLED: 'Cancelled by you.',
};

export type StepState = 'done' | 'current' | 'upcoming' | 'stopped';
export interface TimelineStep {
  key: string;
  label: string;
  state: StepState;
}

/**
 * The applicant-facing progress line. Happy path: Submitted -> Reviewed -> Paid out -> Repaid.
 * A rejected / cancelled application ends the line at the step where it stopped.
 */
export function timelineSteps(status: LoanStatus): TimelineStep[] {
  const happy: ReadonlyArray<readonly [string, string]> = [
    ['submitted', 'Submitted'],
    ['reviewed', 'Reviewed'],
    ['disbursed', 'Paid out'],
    ['repaid', 'Repaid'],
  ];
  if (status === 'REJECTED' || status === 'CANCELLED') {
    return [
      { key: 'submitted', label: 'Submitted', state: 'done' },
      { key: 'ended', label: STATUS_LABELS[status], state: 'stopped' },
    ];
  }
  // Index of the step that is "current" for each status.
  const currentIndex: Record<'PENDING' | 'APPROVED' | 'DISBURSED' | 'REPAID', number> = { PENDING: 1, APPROVED: 2, DISBURSED: 3, REPAID: 4 };
  const current = currentIndex[status];
  return happy.map(([key, label], i) => ({
    key,
    label: key === 'reviewed' ? (status === 'PENDING' ? 'Under review' : 'Approved') : label,
    state: i < current ? 'done' : i === current ? 'current' : 'upcoming',
  }));
}

/** Whole days between `from` and `now` (never negative). */
export function daysSince(iso: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : 0;
}

/** "today", "1 day", "5 days": how long an application has been waiting. */
export function waitingLabel(iso: string, now: Date = new Date()): string {
  const d = daysSince(iso, now);
  return d === 0 ? 'today' : d === 1 ? '1 day' : `${d} days`;
}

/** Applications still awaiting a reply for this many days (or more) are flagged to the admin. */
export const STALE_AFTER_DAYS = 3;
export const isStale = (status: LoanStatus, createdAt: string, now: Date = new Date()): boolean =>
  status === 'PENDING' && daysSince(createdAt, now) >= STALE_AFTER_DAYS;
