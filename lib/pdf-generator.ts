import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { LENDER_NAME, TERMS_VERSION, TIME_ZONE, formatBwp } from './config';
import { TERMS_CLAUSES } from './terms';
import type { ApplicationInput } from './validation';

export interface PdfMeta {
  applicationId: string;
  submittedAt: Date;
  ipAddress: string;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LABEL_W = 170;
const BOTTOM = 70;
const BRAND = rgb(0.23, 0.19, 0.52);
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.4, 0.4, 0.4);

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

export class InvalidSignatureError extends Error {}

/** Replace characters the built-in Helvetica (WinAnsi) font cannot encode. */
function safe(font: PDFFont, input: string): string {
  let out = '';
  for (const ch of input.replace(/\t/g, ' ').replace(/\r/g, '')) {
    if (ch === '\n') {
      out += ch;
      continue;
    }
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += '?';
    }
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of safe(font, text).split('\n')) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(' ').filter(Boolean)) {
      let w = word;
      // Hard-break words longer than a full line.
      while (font.widthOfTextAtSize(w, size) > maxWidth) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut -= 1;
        if (line) {
          lines.push(line);
          line = '';
        }
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export const formatDateTime = (d: Date): string =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: TIME_ZONE }).format(d);

export const formatDate = (d: Date): string =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: TIME_ZONE }).format(d);

async function loadLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  for (const [file, embed] of [
    ['logo.png', (b: Buffer) => pdf.embedPng(b)],
    ['logo.jpg', (b: Buffer) => pdf.embedJpg(b)],
  ] as const) {
    try {
      const bytes = await readFile(path.join(process.cwd(), 'public', file));
      return await embed(bytes);
    } catch {
      /* try next / fall back to text header */
    }
  }
  return null;
}

async function embedSignature(pdf: PDFDocument, dataUrl: string): Promise<PDFImage> {
  const bytes = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
  if (bytes.length < 8 || !PNG_MAGIC.every((b, i) => bytes[i] === b)) {
    throw new InvalidSignatureError('Signature is not a valid PNG');
  }
  try {
    return await pdf.embedPng(bytes);
  } catch {
    throw new InvalidSignatureError('Signature image could not be read');
  }
}

export async function buildLoanPdf(data: ApplicationInput, meta: PdfMeta): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf);
  const signature = await embedSignature(pdf, data.signatureDataUrl);
  const ref = meta.applicationId.slice(0, 8).toUpperCase();

  pdf.setTitle(`Loan application ${ref}`);
  pdf.setAuthor(LENDER_NAME);
  pdf.setProducer(LENDER_NAME);
  pdf.setCreationDate(meta.submittedAt);

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 120;
  let currentTitle = '';

  const drawHeader = (title: string) => {
    currentTitle = title;
    let textX = MARGIN;
    if (logo) {
      const scaled = logo.scaleToFit(100, 40);
      page.drawImage(logo, { x: MARGIN, y: PAGE_H - 40 - scaled.height, ...scaled });
      textX = MARGIN + scaled.width + 16;
    } else {
      page.drawText(safe(bold, LENDER_NAME), { x: MARGIN, y: PAGE_H - 55, size: 12, font: bold, color: BRAND });
    }
    page.drawText(safe(bold, title), { x: textX === MARGIN ? MARGIN : textX, y: logo ? PAGE_H - 62 : PAGE_H - 78, size: 14, font: bold, color: BRAND });
    page.drawLine({
      start: { x: MARGIN, y: PAGE_H - 95 },
      end: { x: PAGE_W - MARGIN, y: PAGE_H - 95 },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85),
    });
    y = PAGE_H - 120;
  };

  const newPage = (title: string) => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    drawHeader(title);
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < BOTTOM) newPage(`${currentTitle.replace(/ \(cont\.\)$/, '')} (cont.)`);
  };

  const section = (label: string) => {
    ensureSpace(34);
    y -= 6;
    page.drawText(safe(bold, label.toUpperCase()), { x: MARGIN, y, size: 9, font: bold, color: MUTED });
    y -= 16;
  };

  const field = (label: string, value: string | undefined) => {
    const lines = wrap(value && value.trim() ? value : 'N/A', font, 10, CONTENT_W - LABEL_W);
    ensureSpace(lines.length * 14 + 6);
    page.drawText(safe(bold, `${label}:`), { x: MARGIN, y, size: 10, font: bold, color: rgb(0.2, 0.2, 0.2) });
    lines.forEach((line, i) => {
      page.drawText(line, { x: MARGIN + LABEL_W, y: y - i * 14, size: 10, font, color: INK });
    });
    y -= lines.length * 14 + 6;
  };

  const paragraph = (text: string, opts: { size?: number; fontRef?: PDFFont; gap?: number } = {}) => {
    const size = opts.size ?? 9;
    const f = opts.fontRef ?? font;
    const lh = size + 4;
    for (const line of wrap(text, f, size, CONTENT_W)) {
      ensureSpace(lh);
      if (line) page.drawText(line, { x: MARGIN, y, size, font: f, color: INK });
      y -= lh;
    }
    y -= opts.gap ?? 4;
  };

  const signatureBlock = () => {
    ensureSpace(100);
    page.drawText('Applicant digital signature:', { x: MARGIN, y, size: 10, font: bold });
    const box = signature.scaleToFit(160, 55);
    page.drawImage(signature, { x: MARGIN + LABEL_W, y: y - box.height + 10, ...box });
    y -= Math.max(box.height, 40) + 4;
    page.drawLine({
      start: { x: MARGIN + LABEL_W, y: y + 4 },
      end: { x: MARGIN + LABEL_W + 170, y: y + 4 },
      thickness: 0.5,
      color: MUTED,
    });
    y -= 12;
    page.drawText(`Date signed: ${formatDate(meta.submittedAt)}`, { x: MARGIN, y, size: 10, font });
    y -= 24;
  };

  // --- PAGE 1: APPLICATION FORM -------------------------------------------------
  drawHeader('LOAN APPLICATION FORM');
  section('Applicant details');
  field('Full name', data.fullName);
  field('Date of birth', data.dob);
  field('Omang / ID number', data.idNumber);
  field('Phone number', data.phone);
  field('Email address', data.email);
  field('Residential address', data.address);
  field('Institution / employer', data.institution);
  field('Monthly allowance / income', formatBwp(data.income));
  section('Loan request');
  field('Loan amount requested', formatBwp(data.loanAmount));
  field('Loan purpose', data.loanPurpose);
  signatureBlock();

  // --- PAGE 2: TERMS, DECLARATION & CONSENT ------------------------------------
  newPage('TERMS, DECLARATION & CONSENT');
  paragraph(`Terms version ${TERMS_VERSION}`, { size: 8, fontRef: font, gap: 8 });
  for (const clause of TERMS_CLAUSES) {
    paragraph(clause.title, { size: 9.5, fontRef: bold, gap: 0 });
    paragraph(clause.body, { size: 9, gap: 6 });
  }
  y -= 4;
  field('Applicant', data.fullName);
  field('Omang / ID number', data.idNumber);
  paragraph('The applicant ticked the consent box confirming acceptance of the terms and declaration above.', { size: 9, fontRef: font });
  signatureBlock();

  // --- PAGE 3: NEXT OF KIN + SUBMISSION RECORD ---------------------------------
  newPage('NEXT OF KIN DETAILS');
  field('Full name', data.kinName);
  field('Relationship to applicant', data.kinRelationship);
  field('National ID / Omang number', data.kinId);
  field('Mobile number', data.kinPhone);
  field('Alternative phone number', data.kinAltPhone);
  field('Residential address', data.kinAddress);
  signatureBlock();

  section('Electronic submission record');
  field('Reference', ref);
  field('Submitted', `${formatDateTime(meta.submittedAt)} (${TIME_ZONE})`);
  field('Network address', meta.ipAddress);
  field('Terms version', TERMS_VERSION);
  paragraph('A SHA-256 fingerprint of this document is recorded by the Lender at submission to detect later alteration.', { size: 8, fontRef: font });

  // --- Footers -------------------------------------------------------------------
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(`${LENDER_NAME}  |  Ref ${ref}  |  Page ${i + 1} of ${pages.length}`, {
      x: MARGIN,
      y: 36,
      size: 8,
      font,
      color: MUTED,
    });
  });

  return pdf.save();
}
