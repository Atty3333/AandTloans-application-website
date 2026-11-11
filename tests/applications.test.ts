import { describe, expect, it } from 'vitest';
import { FIELD_TO_COLUMN, diffRows, rowToFormValues, toRow } from '@/lib/applications';
import { DOCUMENT_KINDS, checkDocumentFile, pathMatchesKind } from '@/lib/documents';
import { adminEditSchema, applicationSchema } from '@/lib/validation';
import { TEST_USER_ID, validPayload } from './fixtures';

const { consent: _c, signatureDataUrl: _s, documents: _d, ...details } = validPayload;

describe('admin edits', () => {
  it('maps every editable field to a column and back without loss', () => {
    const parsed = adminEditSchema.parse(details);
    const row = toRow(parsed);
    expect(Object.keys(row).sort()).toEqual(Object.values(FIELD_TO_COLUMN).sort());
    expect(row.full_name).toBe('Thato Moeng');
    expect(row.phone_number).toBe('+26771234567');
    expect(row.guarantor_name).toBeNull();
    // What the admin form shows for a stored row must re-validate cleanly.
    expect(adminEditSchema.safeParse(rowToFormValues(row)).success).toBe(true);
  });

  it('diffs only the changed columns and treats numeric strings as equal', () => {
    const before = toRow(adminEditSchema.parse(details));
    const storedLikeDb = { ...before, monthly_income: '1500.00', loan_amount_requested: '150.00' };
    const after = toRow(adminEditSchema.parse({ ...details, address: 'Plot 77, Maun', loanAmount: '200' }));
    const changes = diffRows(storedLikeDb, after);
    expect(Object.keys(changes).sort()).toEqual(['address', 'loan_amount_requested']);
    expect(changes.address).toEqual({ from: 'Plot 123, Gaborone', to: 'Plot 77, Maun' });
    expect(diffRows(storedLikeDb, before)).toEqual({});
  });

  it('rejects invalid edits (bad Omang, loan over the limit)', () => {
    const r = adminEditSchema.safeParse({ ...details, idNumber: '123', loanAmount: '5000' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(['idNumber', 'loanAmount']));
  });

  it('requires a guarantor phone when a guarantor name is given', () => {
    const r = adminEditSchema.safeParse({ ...details, guarantorName: 'Ann', guarantorPhone: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain('guarantorPhone');
  });

  it('never accepts signature or consent through the admin schema', () => {
    const r = adminEditSchema.parse({ ...details, signatureDataUrl: 'data:image/png;base64,AAAA', consent: true });
    expect(r).not.toHaveProperty('signatureDataUrl');
    expect(r).not.toHaveProperty('consent');
  });
});

describe('supporting documents', () => {
  it('requires all five documents', () => {
    for (const kind of DOCUMENT_KINDS) {
      const documents = { ...validPayload.documents } as Record<string, string | undefined>;
      delete documents[kind];
      const r = applicationSchema.safeParse({ ...validPayload, documents });
      expect(r.success, kind).toBe(false);
    }
  });

  it('only accepts storage paths issued to this user for that document type', () => {
    const ok = validPayload.documents.omang_front;
    expect(pathMatchesKind(ok, 'omang_front', TEST_USER_ID)).toBe(true);
    expect(pathMatchesKind(ok, 'omang_back', TEST_USER_ID)).toBe(false);
    expect(pathMatchesKind(ok, 'omang_front', '99999999-1111-4222-8333-444455556666')).toBe(false);
    expect(pathMatchesKind(`../${ok}`, 'omang_front', TEST_USER_ID)).toBe(false);
  });

  it('checks file type and size', () => {
    expect(checkDocumentFile({ type: 'application/pdf', size: 1000 })).toBeNull();
    expect(checkDocumentFile({ type: 'image/gif', size: 1000 })).not.toBeNull();
    expect(checkDocumentFile({ type: 'image/png', size: 11 * 1024 * 1024 })).not.toBeNull();
    expect(checkDocumentFile({ type: 'image/png', size: 0 })).not.toBeNull();
  });
});
