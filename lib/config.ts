const positiveNumber = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? n : fallback;
};

export const LENDER_NAME = 'AAndTee Student Loans';
export const TERMS_VERSION = '2026-11-v1';
export const TIME_ZONE = 'Africa/Gaborone';
export const STORAGE_BUCKET = 'signed-documents';

// NEXT_PUBLIC_* must be referenced literally so Next can inline them in the client bundle.
export const LOAN_MIN = positiveNumber(process.env.NEXT_PUBLIC_LOAN_MIN, 500);
export const LOAN_MAX = positiveNumber(process.env.NEXT_PUBLIC_LOAN_MAX, 20000);
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? '';

export const ACTIVE_STATUSES = ['PENDING', 'APPROVED', 'DISBURSED'] as const;
export const ALL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'DISBURSED', 'REPAID'] as const;
export type LoanStatus = (typeof ALL_STATUSES)[number];

export const formatBwp = (n: number): string =>
  `P${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
