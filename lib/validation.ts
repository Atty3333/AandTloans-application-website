import { z } from 'zod';
import { LOAN_MAX, LOAN_MIN } from './config';
import { DOCUMENT_KINDS, DOCUMENT_PATH_RE } from './documents';

/** Collapse control chars/whitespace so values are safe to store and render in a PDF. */
export const cleanText = (s: string): string =>
  s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

/** Normalise a Botswana number to +267XXXXXXX(X). Returns null when invalid. */
export function normalizePhone(raw: string): string | null {
  let s = raw.replace(/[\s()-]/g, '');
  if (s.startsWith('+267')) s = s.slice(4);
  else if (s.startsWith('00267')) s = s.slice(5);
  else if (s.startsWith('267') && s.length > 8) s = s.slice(3);
  return /^\d{7,8}$/.test(s) ? `+267${s}` : null;
}

/** Omang: 9 digits, 5th digit is the gender marker (1 = male, 2 = female). */
export function isValidOmang(value: string): boolean {
  return /^\d{9}$/.test(value) && (value[4] === '1' || value[4] === '2');
}

/** Age in whole years on `now`, or null when `dob` (YYYY-MM-DD) is not a real date. */
export function ageFrom(dob: string, now: Date = new Date()): number | null {
  const [y, m, d] = dob.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() < m - 1 || (now.getUTCMonth() === m - 1 && now.getUTCDate() < d)) age -= 1;
  return age;
}

const text = (label: string, min: number, max: number) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} is required` })
    .transform(cleanText)
    .pipe(z.string().min(min, `${label} is required`).max(max, `${label} is too long`));

const phone = (label: string) =>
  z.string({ required_error: `${label} is required` }).transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: `Enter a valid Botswana number for ${label.toLowerCase()} (e.g. 71234567)` });
      return z.NEVER;
    }
    return n;
  });

const money = (label: string, min: number, max: number, minMsg?: string) =>
  z
    .preprocess(
      (v) => (typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v)) : v),
      z
        .number({ required_error: `${label} is required`, invalid_type_error: `${label} is required` })
        .finite(`${label} is required`)
        .min(min, minMsg ?? `${label} must be at least P${min}`)
        .max(max, `${label} must be at most P${max.toLocaleString('en-US')}`),
    )
    .transform((n) => Math.round(n * 100) / 100);

const optionalText = (label: string, max: number) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      const t = v ? cleanText(v) : '';
      if (!t) return undefined;
      if (t.length < 2) ctx.addIssue({ code: 'custom', message: `${label} is too short` });
      if (t.length > max) ctx.addIssue({ code: 'custom', message: `${label} is too long` });
      return t;
    });

const optionalPhone = (message: string) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v || !v.trim()) return undefined;
      const n = normalizePhone(v);
      if (!n) {
        ctx.addIssue({ code: 'custom', message });
        return z.NEVER;
      }
      return n;
    });

/** Every field the applicant types (and an admin may later edit). */
const detailsShape = {
  fullName: text('Full name', 2, 120),
  dob: z
    .string({ required_error: 'Date of birth is required' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth is required')
    .refine((v) => {
      const age = ageFrom(v);
      return age !== null && age >= 18 && age <= 100;
    }, 'You must be 18 or older to apply'),
  idNumber: z
    .string({ required_error: 'Omang number is required' })
    .transform((v) => v.replace(/\s/g, ''))
    .refine(isValidOmang, 'Enter a valid 9-digit Omang number'),
  phone: phone('Phone number'),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Enter a valid email address')
    .max(254),
  address: text('Residential address', 5, 300),
  institution: text('Institution / employer', 2, 160),
  income: money('Monthly income', 0, 1_000_000),
  loanAmount: money('Loan amount', LOAN_MIN, LOAN_MAX, `Minimum loan is P${LOAN_MIN.toLocaleString('en-US')}`),
  loanPurpose: text('Loan purpose', 3, 300),

  guarantorName: optionalText('Guarantor name', 120),
  guarantorPhone: optionalPhone('Enter a valid Botswana number for the guarantor (e.g. 71234567)'),

  kinName: text('Next of kin name', 2, 120),
  kinRelationship: text('Relationship', 2, 60),
  kinId: z
    .string({ required_error: 'Next of kin ID number is required' })
    .transform((v) => v.replace(/\s/g, ''))
    .pipe(z.string().regex(/^[A-Za-z0-9]{6,20}$/, 'Enter a valid ID number')),
  kinPhone: phone('Next of kin mobile'),
  kinAltPhone: optionalPhone('Enter a valid Botswana number (e.g. 71234567)'),
  kinAddress: text('Next of kin address', 5, 300),
};

const SIGNATURE_MSG = 'Please sign the application';

const documentPath = z
  .string({ required_error: 'Please upload this document', invalid_type_error: 'Please upload this document' })
  .regex(DOCUMENT_PATH_RE, 'Please upload this document');

const documentsShape = Object.fromEntries(DOCUMENT_KINDS.map((k) => [k, documentPath])) as Record<(typeof DOCUMENT_KINDS)[number], typeof documentPath>;

type DetailsCheck = {
  kinId: string;
  idNumber: string;
  guarantorName?: string;
  guarantorPhone?: string;
};

/** Cross-field rules shared by the applicant form and the admin editor. */
const crossChecks = (v: DetailsCheck, ctx: z.RefinementCtx) => {
  if (v.kinId.toLowerCase() === v.idNumber.toLowerCase()) {
    ctx.addIssue({ code: 'custom', path: ['kinId'], message: 'Next of kin cannot be the applicant' });
  }
  if (v.guarantorName && !v.guarantorPhone) {
    ctx.addIssue({ code: 'custom', path: ['guarantorPhone'], message: 'Enter the guarantor phone number' });
  }
  if (v.guarantorPhone && !v.guarantorName) {
    ctx.addIssue({ code: 'custom', path: ['guarantorName'], message: 'Enter the guarantor name' });
  }
};

export const applicationSchema = z
  .object({
    ...detailsShape,
    consent: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the declaration and terms to apply' }),
    }),
    signatureDataUrl: z
      .string({ required_error: SIGNATURE_MSG, invalid_type_error: SIGNATURE_MSG })
      .max(700_000, 'Signature image is too large')
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/, SIGNATURE_MSG),
    turnstileToken: z.string().max(4096).optional(),
    documents: z.object(documentsShape, { required_error: 'Please upload all required documents', invalid_type_error: 'Please upload all required documents' }),
  })
  .superRefine(crossChecks);

/** What an admin may edit: all applicant details, never the signature, consent or documents. */
export const adminEditSchema = z.object(detailsShape).superRefine(crossChecks);
export type AdminEditInput = z.output<typeof adminEditSchema>;

export type ApplicationInput = z.output<typeof applicationSchema>;

/** Flatten zod issues to { field: firstMessage }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 1 && issue.path[0] === 'documents' ? String(issue.path[1]) : String(issue.path[0] ?? 'form');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
