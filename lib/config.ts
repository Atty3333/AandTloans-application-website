const positiveNumber = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? n : fallback;
};

export const LENDER_NAME = 'A&T Student Loans';
export const TERMS_VERSION = '2026-11-v2';
export const TIME_ZONE = 'Africa/Gaborone';
export const STORAGE_BUCKET = 'signed-documents';
export const DOCUMENTS_BUCKET = 'application-documents';

// NEXT_PUBLIC_* must be referenced literally so Next can inline them in the client bundle.
export const LOAN_MIN = positiveNumber(process.env.NEXT_PUBLIC_LOAN_MIN, 100);
export const LOAN_MAX = positiveNumber(process.env.NEXT_PUBLIC_LOAN_MAX, 200);
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? '';

/** While an application is in one of these statuses the applicant has not been replied to and cannot apply again. */
export const AWAITING_REPLY_STATUSES = ['PENDING'] as const;
export const isAwaitingReply = (status: string): boolean => (AWAITING_REPLY_STATUSES as readonly string[]).includes(status);
export const ALL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'DISBURSED', 'REPAID', 'CANCELLED'] as const;
export type LoanStatus = (typeof ALL_STATUSES)[number];

/** The applicant may cancel their own application only while it is still awaiting a reply. */
export const canApplicantCancel = (status: string): boolean => isAwaitingReply(status);

/** Placeholder shown instead of an admin account's monthly income. */
export const CONFIDENTIAL_LABEL = 'Confidential';

/** Proof of payment: how many files an application may hold, and the only status in which the applicant may change them. */
export const MAX_PROOFS = 3;
export const PROOF_EDITABLE_STATUS: LoanStatus = 'APPROVED';
export const canApplicantEditProofs = (status: string): boolean => status === PROOF_EDITABLE_STATUS;

export const formatBwp = (n: number): string =>
  `P${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
