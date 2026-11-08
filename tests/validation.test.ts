import { describe, expect, it } from 'vitest';
import { validPayload } from './fixtures';
import { ageFrom, applicationSchema, fieldErrors, isValidOmang, normalizePhone } from '@/lib/validation';

describe('normalizePhone', () => {
  it.each([
    ['71234567', '+26771234567'],
    ['71 234 567', '+26771234567'],
    ['+267 71234567', '+26771234567'],
    ['26771234567', '+26771234567'],
    ['0026771234567', '+26771234567'],
    ['3123456', '+2673123456'],
  ])('%s -> %s', (input, expected) => expect(normalizePhone(input)).toBe(expected));

  it.each(['', 'abc', '12345', '123456789012'])('rejects %s', (input) => expect(normalizePhone(input)).toBeNull());
});

describe('isValidOmang', () => {
  it('accepts 9 digits with gender digit 1 or 2', () => {
    expect(isValidOmang('123411234')).toBe(true);
    expect(isValidOmang('123421234')).toBe(true);
  });
  it('rejects wrong length, letters and gender digit', () => {
    expect(isValidOmang('12345123')).toBe(false);
    expect(isValidOmang('12345123a')).toBe(false);
    expect(isValidOmang('123401234')).toBe(false);
  });
});

describe('ageFrom', () => {
  it('computes whole years and rejects impossible dates', () => {
    expect(ageFrom('2000-06-15', new Date('2026-06-14T00:00:00Z'))).toBe(25);
    expect(ageFrom('2000-06-15', new Date('2026-06-15T00:00:00Z'))).toBe(26);
    expect(ageFrom('2001-02-30')).toBeNull();
  });
});

describe('applicationSchema', () => {
  it('accepts and normalises a valid application', () => {
    const r = applicationSchema.safeParse(validPayload);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.fullName).toBe('Thato Moeng');
      expect(r.data.phone).toBe('+26771234567');
      expect(r.data.email).toBe('thato@example.com');
      expect(r.data.loanAmount).toBe(2000);
      expect(r.data.kinAltPhone).toBeUndefined();
    }
  });

  it('rejects under-18 applicants', () => {
    const year = new Date().getUTCFullYear() - 10;
    const r = applicationSchema.safeParse({ ...validPayload, dob: `${year}-01-01` });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).dob).toMatch(/18/);
  });

  it('enforces loan limits and rejects blank amounts', () => {
    expect(applicationSchema.safeParse({ ...validPayload, loanAmount: '1' }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...validPayload, loanAmount: '99999999' }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...validPayload, loanAmount: '' }).success).toBe(false);
  });

  it('requires consent and a PNG signature', () => {
    expect(applicationSchema.safeParse({ ...validPayload, consent: false }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...validPayload, signatureDataUrl: undefined }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...validPayload, signatureDataUrl: 'data:text/html;base64,AAAA' }).success).toBe(false);
  });

  it('rejects next of kin equal to the applicant', () => {
    const r = applicationSchema.safeParse({ ...validPayload, kinId: validPayload.idNumber });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).kinId).toBeDefined();
  });
});
