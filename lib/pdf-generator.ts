import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { LENDER_NAME, TERMS_VERSION, TIME_ZONE, formatBwp } from './config';
import { CONSENT_PARAGRAPHS, ESIGN_NOTE, FORM_TITLES, KIN_DECLARATION, KIN_NOTICE } from './terms';
import type { ApplicationInput } from './validation';

export interface PdfMeta {
  applicationId: string;
  submittedAt: Date;
  ipAddress: string;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const RIGHT = PAGE_W - MARGIN;
const CONTENT_W = PAGE_W - MARGIN * 2;
const COL_GAP = 15;
const COL_W = (CONTENT_W - COL_GAP) / 2;
const BOTTOM = 70;

// Palette sampled from the A&T Student Loans legal templates.
const INK = rgb(0.1, 0.1, 0.14);
const PURPLE_DARK = rgb(46 / 255, 16 / 255, 101 / 255);
const PURPLE = rgb(76 / 255, 29 / 255, 149 / 255);
const LAVENDER = rgb(243 / 255, 236 / 255, 254 / 255);
const PANEL_FILL = rgb(250 / 255, 245 / 255, 255 / 255);
const PANEL_BORDER = rgb(192 / 255, 132 / 255, 252 / 255);
const FIELD_FILL = rgb(248 / 255, 250 / 255, 252 / 255);
const FIELD_BORDER = rgb(199 / 255, 210 / 255, 254 / 255);
const RULE_LIGHT = rgb(221 / 255, 214 / 255, 254 / 255);
const SLATE = rgb(100 / 255, 116 / 255, 139 / 255);
const GREY_LINE = rgb(0.82, 0.82, 0.85);

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

/** YYYY-MM-DD -> DD/MM/YYYY (as on the paper forms). */
export const formatDobForForm = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

export const formatShortDate = (d: Date): string => {
  const parts = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TIME_ZONE }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')}`;
};

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

/** SVG path for a rounded rectangle whose top-left is the path origin (pdf-lib flips the y axis for SVG paths). */
const roundedRectPath = (w: number, h: number, r: number): string =>
  `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;

interface Cell {
  label: string;
  value?: string;
  /** Leave the box empty (for official-use fields completed by the Lender). */
  blank?: boolean;
}

export async function buildLoanPdf(data: ApplicationInput, meta: PdfMeta): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf);
  const signature = await embedSignature(pdf, data.signatureDataUrl);
  const ref = meta.applicationId.slice(0, 8).toUpperCase();
  const signedOn = formatShortDate(meta.submittedAt);

  pdf.setTitle(`Loan application ${ref}`);
  pdf.setAuthor(LENDER_NAME);
  pdf.setProducer(LENDER_NAME);
  pdf.setCreationDate(meta.submittedAt);

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 132;
  const pageFooters: string[] = [];
  let current: { lines: readonly string[]; footer: string } = FORM_TITLES.application;

  // --- low-level helpers ---------------------------------------------------------
  const spacedWidth = (text: string, f: PDFFont, size: number, spacing: number) =>
    [...text].reduce((w, ch) => w + f.widthOfTextAtSize(ch, size), 0) + spacing * Math.max(0, [...text].length - 1);

  const drawSpaced = (text: string, x: number, yy: number, size: number, f: PDFFont, color = INK, spacing = 0, align: 'left' | 'right' = 'left') => {
    const t = safe(f, text);
    let cx = align === 'right' ? x - spacedWidth(t, f, size, spacing) : x;
    for (const ch of t) {
      page.drawText(ch, { x: cx, y: yy, size, font: f, color });
      cx += f.widthOfTextAtSize(ch, size) + spacing;
    }
  };

  const drawHeader = (spec: { lines: readonly string[]; footer: string }) => {
    current = spec;
    pageFooters.push(spec.footer);
    if (logo) {
      const box = logo.scaleToFit(72, 58);
      page.drawImage(logo, { x: MARGIN, y: PAGE_H - 42 - box.height, ...box });
    } else {
      drawSpaced(LENDER_NAME.toUpperCase(), MARGIN, PAGE_H - 62, 11, bold, PURPLE_DARK, 0.6);
    }
    let baseline = PAGE_H - (spec.lines.length === 1 ? 66 : 58);
    for (const line of spec.lines) {
      drawSpaced(line, RIGHT, baseline, 17, bold, PURPLE_DARK, 0.8, 'right');
      baseline -= 20;
    }
    drawSpaced(LENDER_NAME.toUpperCase(), RIGHT, baseline + 2, 7.5, bold, PURPLE, 0.7, 'right');
    page.drawLine({ start: { x: MARGIN, y: PAGE_H - 112 }, end: { x: RIGHT, y: PAGE_H - 112 }, thickness: 1, color: PURPLE });
    y = PAGE_H - 132;
  };

  const newPage = (spec: { lines: readonly string[]; footer: string }) => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    drawHeader(spec);
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < BOTTOM) newPage(current);
  };

  const section = (label: string) => {
    ensureSpace(60);
    y -= 4;
    drawSpaced(label.toUpperCase(), MARGIN, y, 8.5, bold, PURPLE_DARK, 0.9);
    page.drawLine({ start: { x: MARGIN, y: y - 5 }, end: { x: RIGHT, y: y - 5 }, thickness: 0.6, color: RULE_LIGHT });
    y -= 20;
  };

  /** One row of 1 or 2 labelled boxes. Cells in a row share the same height. */
  const row = (cells: [Cell] | [Cell, Cell]) => {
    const width = cells.length === 1 ? CONTENT_W : COL_W;
    const prepared = cells.map((c) => ({
      c,
      lines: c.blank ? [''] : wrap(c.value && c.value.trim() ? c.value : '—', font, 9.5, width - 16),
    }));
    const boxH = Math.max(23, ...prepared.map((p) => p.lines.length * 12 + 11));
    ensureSpace(boxH + 22);
    prepared.forEach(({ c, lines }, i) => {
      const x = MARGIN + i * (COL_W + COL_GAP);
      drawSpaced(c.label.toUpperCase(), x, y, 6.5, bold, PURPLE, 0.55);
      page.drawSvgPath(roundedRectPath(width, boxH, 3), { x, y: y - 5, color: FIELD_FILL, borderColor: FIELD_BORDER, borderWidth: 0.7 });
      lines.forEach((line, li) => {
        if (line) page.drawText(line, { x: x + 8, y: y - 5 - 15 - li * 12, size: 9.5, font, color: line === '—' ? SLATE : INK });
      });
    });
    y -= 5 + boxH + 14;
  };

  const paragraph = (text: string, opts: { size?: number; gap?: number; color?: ReturnType<typeof rgb>; width?: number; x?: number } = {}) => {
    const size = opts.size ?? 9;
    const lh = size + 5;
    for (const line of wrap(text, font, size, opts.width ?? CONTENT_W)) {
      ensureSpace(lh);
      if (line) page.drawText(line, { x: opts.x ?? MARGIN, y, size, font, color: opts.color ?? INK });
      y -= lh;
    }
    y -= opts.gap ?? 6;
  };

  const signatureBlock = (opts: { withDateColumn: boolean }) => {
    ensureSpace(110);
    y -= 2;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: RIGHT, y }, thickness: 0.6, color: GREY_LINE, dashArray: [3, 3] });
    y -= 16;
    const sigW = opts.withDateColumn ? 320 : CONTENT_W;
    drawSpaced('APPLICANT SIGNATURE', MARGIN, y, 6.5, bold, PURPLE, 0.55);
    if (opts.withDateColumn) drawSpaced('DATE', MARGIN + 335, y, 6.5, bold, PURPLE, 0.55);
    const lineY = y - 58;
    const img = signature.scaleToFit(170, 46);
    page.drawImage(signature, { x: MARGIN + 4, y: lineY + 4, ...img });
    page.drawLine({ start: { x: MARGIN, y: lineY }, end: { x: MARGIN + sigW, y: lineY }, thickness: 0.9, color: PURPLE_DARK });
    if (opts.withDateColumn) {
      page.drawText(signedOn, { x: MARGIN + 345, y: lineY + 6, size: 10, font, color: INK });
      page.drawLine({ start: { x: MARGIN + 335, y: lineY }, end: { x: RIGHT, y: lineY }, thickness: 0.9, color: PURPLE_DARK });
    }
    y = lineY - 22;
  };

  // --- FORM 1: LOAN APPLICATION FORM --------------------------------------------
  drawHeader(FORM_TITLES.application);
  section('Personal details');
  row([{ label: 'Full name', value: data.fullName }]);
  row([
    { label: 'Date of birth', value: formatDobForForm(data.dob) },
    { label: 'Omang / ID number', value: data.idNumber },
  ]);
  row([
    { label: 'Phone number', value: data.phone },
    { label: 'Email address', value: data.email },
  ]);
  row([{ label: 'Residential address', value: data.address }]);
  section('Employment & financial details');
  row([
    { label: 'Institution / employer', value: data.institution },
    { label: 'Monthly allowance / income', value: formatBwp(data.income) },
  ]);
  row([
    { label: 'Loan amount requested', value: formatBwp(data.loanAmount) },
    { label: 'Loan purpose', value: data.loanPurpose },
  ]);
  section('Guarantor information');
  row([
    { label: 'Guarantor name', value: data.guarantorName },
    { label: 'Guarantor phone', value: data.guarantorPhone },
  ]);
  signatureBlock({ withDateColumn: true });

  // --- FORM 2: NEXT OF KIN DETAILS ----------------------------------------------
  newPage(FORM_TITLES.nextOfKin);
  {
    const noticeLines = wrap(KIN_NOTICE, font, 8.5, CONTENT_W - 36);
    const h = noticeLines.length * 12 + 16;
    page.drawRectangle({ x: MARGIN, y: y - h + 6, width: CONTENT_W, height: h, color: LAVENDER });
    page.drawRectangle({ x: MARGIN, y: y - h + 6, width: 3, height: h, color: rgb(124 / 255, 58 / 255, 237 / 255) });
    const prefix = 'Notice: ';
    const prefixW = bold.widthOfTextAtSize(prefix, 8.5);
    noticeLines.forEach((line, i) => {
      const x = MARGIN + 16;
      if (i === 0) {
        page.drawText(prefix, { x, y: y - 8 - 3, size: 8.5, font: bold, color: PURPLE_DARK });
        page.drawText(line, { x: x + prefixW, y: y - 11, size: 8.5, font, color: INK });
      } else {
        page.drawText(line, { x, y: y - 11 - i * 12, size: 8.5, font, color: INK });
      }
    });
    y -= h + 14;
  }
  section('Next of kin information');
  row([{ label: 'Full name', value: data.kinName }]);
  row([
    { label: 'Relationship to applicant', value: data.kinRelationship },
    { label: 'National ID / Omang number', value: data.kinId },
  ]);
  row([
    { label: 'Mobile number', value: data.kinPhone },
    { label: 'Alternative number', value: data.kinAltPhone },
  ]);
  row([{ label: 'Residential address', value: data.kinAddress }]);
  section('Applicant declaration');
  paragraph(KIN_DECLARATION, { size: 8.5, gap: 10 });
  signatureBlock({ withDateColumn: true });

  // --- FORM 3: ACKNOWLEDGEMENT, CONSENT & DECLARATION ----------------------------
  newPage(FORM_TITLES.consent);
  for (const p of CONSENT_PARAGRAPHS) paragraph(p, { size: 9, gap: 8 });
  y -= 4;
  section('Applicant details');
  row([{ label: 'Full name', value: data.fullName }]);
  row([
    { label: 'Omang / identity number', value: data.idNumber },
    { label: 'Date', value: signedOn },
  ]);
  signatureBlock({ withDateColumn: false });

  // For official use only (completed by the Lender after approval)
  {
    ensureSpace(170);
    const panelH = 150;
    const top = y;
    page.drawSvgPath(roundedRectPath(CONTENT_W, panelH, 5), { x: MARGIN, y: top, color: PANEL_FILL, borderColor: PANEL_BORDER, borderWidth: 0.8 });
    drawSpaced('FOR OFFICIAL USE ONLY', MARGIN + 14, top - 20, 8.5, bold, PURPLE_DARK, 0.9);
    page.drawLine({ start: { x: MARGIN + 14, y: top - 26 }, end: { x: RIGHT - 14, y: top - 26 }, thickness: 0.6, color: PANEL_BORDER });
    const innerW = (CONTENT_W - 28 - COL_GAP) / 2;
    const boxes: [string, number, number][] = [
      ['Authorised representative', MARGIN + 14, top - 42],
      ['Position', MARGIN + 14 + innerW + COL_GAP, top - 42],
    ];
    for (const [label, x, yy] of boxes) {
      drawSpaced(label.toUpperCase(), x, yy, 6.5, bold, PURPLE, 0.55);
      page.drawSvgPath(roundedRectPath(innerW, 23, 3), { x, y: yy - 5, color: rgb(1, 1, 1), borderColor: FIELD_BORDER, borderWidth: 0.7 });
    }
    drawSpaced('SIGNATURE', MARGIN + 14, top - 90, 6.5, bold, PURPLE, 0.55);
    drawSpaced('DATE', MARGIN + 14 + innerW + COL_GAP, top - 90, 6.5, bold, PURPLE, 0.55);
    for (const x of [MARGIN + 14, MARGIN + 14 + innerW + COL_GAP]) {
      page.drawLine({ start: { x, y: top - 128 }, end: { x: x + innerW, y: top - 128 }, thickness: 0.9, color: PURPLE_DARK });
    }
    y = top - panelH - 18;
  }

  paragraph(ESIGN_NOTE, { size: 7.5, gap: 4, color: SLATE });
  paragraph(`Reference ${ref}  |  Submitted ${formatDateTime(meta.submittedAt)} (${TIME_ZONE})  |  Network address ${meta.ipAddress}  |  Terms version ${TERMS_VERSION}`, {
    size: 7.5,
    gap: 0,
    color: SLATE,
  });

  // --- Footers ---------------------------------------------------------------------
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: MARGIN, y: 50 }, end: { x: RIGHT, y: 50 }, thickness: 0.5, color: rgb(0.9, 0.91, 0.93) });
    p.drawText(safe(font, `${LENDER_NAME} — ${pageFooters[i] ?? ''}  |  Ref ${ref}`), { x: MARGIN, y: 36, size: 7.5, font, color: SLATE });
    const right = `Page ${i + 1} of ${pages.length}`;
    p.drawText(right, { x: RIGHT - font.widthOfTextAtSize(right, 7.5), y: 36, size: 7.5, font, color: SLATE });
  });

  return pdf.save();
}
