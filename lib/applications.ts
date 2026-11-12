import type { ApplicationInput, AdminEditInput } from './validation';

/** Form field -> database column. Single source of truth for inserts, admin edits and audit diffs. */
export const FIELD_TO_COLUMN = {
  fullName: 'full_name',
  dob: 'date_of_birth',
  idNumber: 'id_number',
  phone: 'phone_number',
  whatsappNumber: 'whatsapp_number',
  email: 'email',
  address: 'address',
  institution: 'institution',
  income: 'monthly_income',
  loanAmount: 'loan_amount_requested',
  loanPurpose: 'loan_purpose',
  guarantorName: 'guarantor_name',
  guarantorPhone: 'guarantor_phone',
  kinName: 'kin_full_name',
  kinRelationship: 'kin_relationship',
  kinId: 'kin_id_number',
  kinPhone: 'kin_phone',
  kinAltPhone: 'kin_alt_phone',
  kinAddress: 'kin_address',
} as const satisfies Record<string, string>;

export type DetailField = keyof typeof FIELD_TO_COLUMN;
export type DetailColumn = (typeof FIELD_TO_COLUMN)[DetailField];
export type DetailRow = Record<DetailColumn, string | number | null>;

export const DETAIL_COLUMN_LABELS: Record<DetailColumn, string> = {
  full_name: 'Full name',
  date_of_birth: 'Date of birth',
  id_number: 'Omang / ID number',
  phone_number: 'Phone number (Pay2Cell)',
  whatsapp_number: 'WhatsApp number',
  email: 'Email address',
  address: 'Residential address',
  institution: 'Institution / employer',
  monthly_income: 'Monthly allowance / income',
  loan_amount_requested: 'Loan amount requested',
  loan_purpose: 'Loan purpose',
  guarantor_name: 'Guarantor name',
  guarantor_phone: 'Guarantor phone',
  kin_full_name: 'Next of kin name',
  kin_relationship: 'Relationship to applicant',
  kin_id_number: 'Next of kin ID / Omang',
  kin_phone: 'Next of kin mobile',
  kin_alt_phone: 'Next of kin alternative number',
  kin_address: 'Next of kin address',
};

/** Validated form data -> database columns (optional fields become null). */
export function toRow(data: ApplicationInput | AdminEditInput): DetailRow {
  const row = {} as DetailRow;
  for (const [field, column] of Object.entries(FIELD_TO_COLUMN) as [DetailField, DetailColumn][]) {
    const v = data[field];
    row[column] = v === undefined || v === '' ? null : (v as string | number);
  }
  return row;
}

const NUMERIC_COLUMNS: ReadonlySet<string> = new Set(['monthly_income', 'loan_amount_requested']);

const same = (column: string, a: unknown, b: unknown): boolean => {
  if (NUMERIC_COLUMNS.has(column)) return Number(a ?? 0) === Number(b ?? 0);
  return (a ?? null) === (b ?? null);
};

export type Changes = Partial<Record<DetailColumn, { from: string | number | null; to: string | number | null }>>;

/** Columns whose value differs between the stored row and the new values. Empty object = nothing changed. */
export function diffRows(existing: Partial<DetailRow>, next: DetailRow): Changes {
  const changes: Changes = {};
  for (const column of Object.values(FIELD_TO_COLUMN)) {
    const from = (existing[column] ?? null) as string | number | null;
    const to = next[column];
    if (!same(column, from, to)) changes[column] = { from, to };
  }
  return changes;
}

/** Database row -> the string values the edit form uses. */
export function rowToFormValues(row: Partial<DetailRow>): Record<DetailField, string> {
  const out = {} as Record<DetailField, string>;
  for (const [field, column] of Object.entries(FIELD_TO_COLUMN) as [DetailField, DetailColumn][]) {
    const v = row[column];
    out[field] = v === null || v === undefined ? '' : String(v);
  }
  return out;
}

/** A row of public.loan_applications as the admin dashboard reads it (select '*'). */
export type LoanRow = DetailRow & {
  id: string;
  created_at: string;
  status: import('./config').LoanStatus;
  status_updated_at: string | null;
  pdf_path: string;
  pdf_sha256: string;
  whatsapp_notified_at: string | null;
  documents: import('./documents').StoredDocument[] | null;
  proof_of_payments: import('./proofs').ProofOfPayment[] | null;
  user_id: string | null;
  last_edited_at: string | null;
};

export interface EditHistoryEntry {
  id: string;
  edited_at: string;
  edited_by_email: string | null;
  changes: Changes;
}

export const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Gaborone' }).format(new Date(iso));

export const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Africa/Gaborone' }).format(new Date(iso));
