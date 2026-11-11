/**
 * Wording of the three signed documents (taken from the A&T Student Loans legal templates).
 * Used on the website AND in the generated PDF so they always match.
 * IMPORTANT: have a Botswana-qualified lawyer review any change, then bump TERMS_VERSION in lib/config.ts.
 */
export const FORM_TITLES = {
  application: { lines: ['LOAN APPLICATION FORM'], footer: 'Official Application Form' },
  nextOfKin: { lines: ['NEXT OF KIN DETAILS'], footer: 'Next of Kin Form' },
  consent: { lines: ['ACKNOWLEDGEMENT, CONSENT &', 'DECLARATION'], footer: 'Consent & Declaration' },
} as const;

export const KIN_NOTICE = 'Please provide details of a close relative or trusted contact. This person is not responsible for the loan.';

export const KIN_DECLARATION =
  'I confirm that the information provided above is true and accurate. The person named above is my Next of Kin and is not liable for this loan unless a separate Guarantor Agreement is executed.';

export const CONSENT_PARAGRAPHS: readonly string[] = [
  'I hereby solemnly declare, warrant, and certify that all information, statements, documents, and particulars provided by me in connection with this loan application are true, accurate, complete, and not misleading in any respect.',
  'I acknowledge and agree that the Lender shall be entitled to rely upon the information furnished by me for the purpose of assessing my application and determining my eligibility for financial assistance.',
  'I authorise the Lender to verify information relevant to this application and acknowledge that false, incomplete, or misleading information may result in rejection of the application or legal action.',
  'By signing below, I confirm that I have read, understood, and voluntarily accepted the terms and conditions governing this application and any loan facility that may be granted.',
];

export const CONSENT_LABEL =
  'I have read and accept the declarations above, I confirm my next of kin agrees to be contacted, and I agree that my drawn signature, with the date, time and network address recorded at submission, is my binding electronic signature. I understand my personal data will be processed to assess this application in line with the Botswana Data Protection Act.';

export const ESIGN_NOTE =
  'Signed electronically. The date, time and network address recorded at submission form part of this signature. A SHA-256 fingerprint of this document is kept by the Lender to detect later alteration.';
