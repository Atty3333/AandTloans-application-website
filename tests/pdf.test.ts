import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { InvalidSignatureError, buildLoanPdf } from '@/lib/pdf-generator';
import { applicationSchema } from '@/lib/validation';
import { validPayload } from './fixtures';

const meta = { applicationId: '0a1b2c3d-1111-2222-3333-444455556666', submittedAt: new Date('2026-11-08T12:00:00Z'), ipAddress: '203.0.113.7' };

describe('buildLoanPdf', () => {
  it('produces a valid multi-page PDF', async () => {
    const data = applicationSchema.parse(validPayload);
    const bytes = await buildLoanPdf(data, meta);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it('survives unicode, very long values and newlines without throwing', async () => {
    const data = applicationSchema.parse({
      ...validPayload,
      fullName: 'Kgosi Ñandú 山田 🙂',
      address: 'x'.repeat(250),
      loanPurpose: `${'long purpose words '.repeat(15)}`.slice(0, 290),
      kinAddress: 'Averyveryveryverylongwordwithoutanyspaces'.repeat(6),
    });
    const bytes = await buildLoanPdf(data, meta);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it('rejects a signature that is not a real PNG', async () => {
    const data = applicationSchema.parse({ ...validPayload, signatureDataUrl: 'data:image/png;base64,AAAAAAAAAAAAAAAA' });
    await expect(buildLoanPdf(data, meta)).rejects.toBeInstanceOf(InvalidSignatureError);
  });
});
