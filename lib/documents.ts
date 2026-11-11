/** Supporting documents the applicant must upload before signing. Shared by the form, the API and the admin page. */
export const DOCUMENT_KINDS = ['bank_statement', 'omang_front', 'omang_back', 'registration_letter', 'student_id'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface DocumentSpec {
  kind: DocumentKind;
  label: string;
  hint: string;
}

export const DOCUMENT_SPECS: readonly DocumentSpec[] = [
  { kind: 'bank_statement', label: 'Recent bank statement', hint: 'Your latest statement (last 3 months). PDF or clear photo.' },
  { kind: 'omang_front', label: 'Omang — front', hint: 'Photo of the FRONT of your valid Omang. All four corners visible.' },
  { kind: 'omang_back', label: 'Omang — back', hint: 'Photo of the BACK of your valid Omang. All four corners visible.' },
  { kind: 'registration_letter', label: 'Registration letter', hint: 'Your current registration / admission letter from your institution.' },
  { kind: 'student_id', label: 'Student ID', hint: 'Photo of your valid student ID card (or a scan).' },
];

export const DOCUMENT_LABELS = Object.fromEntries(DOCUMENT_SPECS.map((d) => [d.kind, d.label])) as Record<DocumentKind, string>;

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const ALLOWED_DOCUMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type AllowedDocumentType = (typeof ALLOWED_DOCUMENT_TYPES)[number];

export const EXTENSION_BY_TYPE: Record<AllowedDocumentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export const isAllowedDocumentType = (t: string): t is AllowedDocumentType => (ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(t);
export const isDocumentKind = (k: unknown): k is DocumentKind => typeof k === 'string' && (DOCUMENT_KINDS as readonly string[]).includes(k);

/** Returns an error message when the file is not acceptable, otherwise null. */
export function checkDocumentFile(file: { type: string; size: number }): string | null {
  if (!isAllowedDocumentType(file.type)) return 'Use a JPG, PNG, WebP or PDF file. (iPhone HEIC photos: choose "Most Compatible" or take a screenshot of the photo.)';
  if (file.size <= 0) return 'This file is empty.';
  if (file.size > MAX_DOCUMENT_BYTES) return `File is too large (max ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB).`;
  return null;
}

/** Storage path issued by /api/upload-url: `<userId>/<kind>-<8 hex>.<ext>` */
export const DOCUMENT_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/([a-z_]+)-[0-9a-f]{8}\.(jpg|png|webp|pdf)$/;

export function pathMatchesKind(path: string, kind: DocumentKind, userId: string): boolean {
  const m = DOCUMENT_PATH_RE.exec(path);
  return !!m && m[1] === kind && path.startsWith(`${userId}/`);
}

export interface StoredDocument {
  kind: DocumentKind;
  path: string;
  contentType: string;
  size: number;
}
