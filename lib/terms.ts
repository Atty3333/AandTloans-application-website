import { LENDER_NAME } from './config';

/**
 * Agreement wording used on the website AND in the signed PDF.
 * IMPORTANT: have a Botswana-qualified lawyer review this text before going live,
 * then bump TERMS_VERSION in lib/config.ts whenever it changes.
 * Rates, fees and repayment dates are intentionally NOT hard-coded: they are set in the
 * written loan offer issued on approval.
 */
export interface TermsClause {
  title: string;
  body: string;
}

export const TERMS_CLAUSES: TermsClause[] = [
  {
    title: '1. Application only',
    body: `Submitting this application does not guarantee approval. ${LENDER_NAME} (the "Lender") may approve, decline or approve a different amount at its discretion.`,
  },
  {
    title: '2. Loan terms',
    body: 'The approved amount, interest rate, fees, total repayable amount and repayment dates will be set out in a written loan offer. The offer forms part of this agreement once accepted by the applicant.',
  },
  {
    title: '3. Declaration of accuracy',
    body: 'I declare that all information and documents I have provided are true, accurate, complete and not misleading. I understand that false information may result in rejection of my application or legal action.',
  },
  {
    title: '4. Verification',
    body: 'I authorise the Lender to verify the information I have supplied, including by contacting my institution or employer and my next of kin.',
  },
  {
    title: '5. Next of kin',
    body: 'I confirm that my next of kin has agreed to be named and may be contacted by the Lender about this application and, if a loan is granted, about its repayment.',
  },
  {
    title: '6. Default',
    body: 'If a loan is granted and I fail to repay it as agreed, the Lender may take lawful steps to recover the amount owed, in accordance with the laws of Botswana.',
  },
  {
    title: '7. Personal data',
    body: 'My personal information, including my Omang number and signature, will be processed by the Lender to assess this application, verify my identity, administer and recover any loan, and meet legal obligations, in line with the Botswana Data Protection Act. It will be stored securely and kept only as long as necessary for those purposes. I may ask the Lender to access or correct my information.',
  },
  {
    title: '8. Electronic signature',
    body: 'I agree that my drawn signature, together with the date, time and network address recorded at submission, is my binding electronic signature on this document.',
  },
];

export const CONSENT_LABEL =
  'I have read and accept the declaration and terms above, and I confirm that my next of kin agrees to be contacted.';
