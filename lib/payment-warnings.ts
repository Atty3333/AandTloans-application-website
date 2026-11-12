import { shortRef } from './status';
import { z } from 'zod';
import { formatBwp } from './config';
import { parseProofs } from './proofs';

export interface WarningCandidate {
  id: string;
  full_name: string;
  status: string;
  loan_amount_requested: number | string;
  whatsapp_number: string | null;
  proof_of_payments: unknown;
}

export interface WarningRecipient {
  applicationId: string;
  reference: string;
  name: string;
  amountLabel: string;
  to: string;
}

export interface WarningTargets {
  recipients: WarningRecipient[];
  /** Approved, no proof, but no WhatsApp number on file: cannot be messaged. */
  withoutNumber: { reference: string; name: string }[];
}

export const DEFAULT_WARNING_TEMPLATE =
  'Hello {name}, your A&T Student Loans loan of {amount} (Ref {reference}) was approved but we have not received your proof of payment. Please log in and upload it as soon as possible.';

export const warningMessageSchema = z.object({
  message: z
    .string({ required_error: 'Enter the message to send' })
    .transform((v) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim())
    .pipe(z.string().min(10, 'Message is too short').max(900, 'Message is too long (max 900 characters)')),
});

/** One warning goes to EVERY application that is APPROVED and has no proof of payment yet. */
export function selectWarningTargets(rows: readonly WarningCandidate[]): WarningTargets {
  const recipients: WarningRecipient[] = [];
  const withoutNumber: WarningTargets['withoutNumber'] = [];
  for (const r of rows) {
    if (r.status !== 'APPROVED' || parseProofs(r.proof_of_payments).length > 0) continue;
    const reference = shortRef(r.id);
    if (!r.whatsapp_number) {
      withoutNumber.push({ reference, name: r.full_name });
      continue;
    }
    recipients.push({ applicationId: r.id, reference, name: r.full_name, amountLabel: formatBwp(Number(r.loan_amount_requested)), to: r.whatsapp_number });
  }
  return { recipients, withoutNumber };
}

/** Replaces {name}, {amount} and {reference}. Unknown placeholders are left untouched. */
export function renderWarning(template: string, r: Pick<WarningRecipient, 'name' | 'amountLabel' | 'reference'>): string {
  return template.replace(/\{(name|amount|reference)\}/g, (_m, key: 'name' | 'amount' | 'reference') =>
    key === 'name' ? r.name : key === 'amount' ? r.amountLabel : r.reference,
  );
}
