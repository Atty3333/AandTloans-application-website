import { z } from 'zod';
import { MAX_PROOFS } from './config';
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from './documents';

/** Proof-of-payment files live in the private documents bucket under `proofs/<applicationId>/`. */
export const PROOF_PATH_RE = /^proofs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/proof_of_payment-[0-9a-f]{8}\.(jpg|png|webp|pdf)$/;

export interface ProofOfPayment {
  path: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: 'user' | 'admin';
}

export const proofPath = (applicationId: string, hex: string, ext: string): string => `proofs/${applicationId}/proof_of_payment-${hex}.${ext}`;

export function proofPathBelongsTo(path: string, applicationId: string): boolean {
  const m = PROOF_PATH_RE.exec(path);
  return !!m && m[1] === applicationId.toLowerCase();
}

/** Defensive read of the JSONB column: anything malformed is dropped rather than crashing a page. */
export function parseProofs(value: unknown): ProofOfPayment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (p): p is ProofOfPayment => !!p && typeof p === 'object' && typeof (p as ProofOfPayment).path === 'string' && typeof (p as ProofOfPayment).contentType === 'string',
  );
}

export const proofSlotsLeft = (proofs: readonly unknown[]): number => Math.max(0, MAX_PROOFS - proofs.length);

const proofFilePath = z.string().regex(PROOF_PATH_RE, 'Invalid proof of payment file.');

export const proofRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('sign'),
    contentType: z.enum(ALLOWED_DOCUMENT_TYPES),
    size: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
    replacing: z.boolean().optional(),
  }),
  z.object({ action: z.literal('attach'), path: proofFilePath }),
  z.object({ action: z.literal('replace'), path: proofFilePath, oldPath: proofFilePath }),
  z.object({ action: z.literal('remove'), path: proofFilePath }),
  z.object({ action: z.literal('view'), path: proofFilePath }),
]);
export type ProofRequest = z.infer<typeof proofRequestSchema>;
