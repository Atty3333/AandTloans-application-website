import type { LoanRow } from './applications';
import { shortRef } from './status';

/** Neutralise spreadsheet formulas (CSV injection) and quote the value when needed. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLUMNS: ReadonlyArray<readonly [string, (r: LoanRow) => unknown]> = [
  ['Reference', (r) => shortRef(r.id)],
  ['Applied', (r) => r.created_at],
  ['Status', (r) => r.status],
  ['Replied / cancelled', (r) => r.status_updated_at],
  ['Full name', (r) => r.full_name],
  ['Omang', (r) => r.id_number],
  ['Phone', (r) => r.phone_number],
  ['WhatsApp', (r) => r.whatsapp_number],
  ['Email', (r) => r.email],
  ['Institution', (r) => r.institution],
  ['Amount requested (BWP)', (r) => r.loan_amount_requested],
  ['Purpose', (r) => r.loan_purpose],
  ['Proofs of payment', (r) => (Array.isArray(r.proof_of_payments) ? r.proof_of_payments.length : 0)],
];

/** Applications as CSV text (header + one line per row). Personal data: only ever generated in the admin's browser. */
export function applicationsToCsv(rows: readonly LoanRow[]): string {
  const lines = [COLUMNS.map(([h]) => csvCell(h)).join(',')];
  for (const r of rows) lines.push(COLUMNS.map(([, get]) => csvCell(get(r))).join(','));
  return lines.join('\r\n') + '\r\n';
}
