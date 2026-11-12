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
/** Everything the applicant may upload through /api/upload-url: the five loan documents plus the profile picture. */
export const UPLOAD_KINDS = [...DOCUMENT_KINDS, 'avatar'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];
export const isUploadKind = (k: unknown): k is UploadKind => typeof k === 'string' && (UPLOAD_KINDS as readonly string[]).includes(k);
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const isImageType = (t: string): boolean => (IMAGE_TYPES as readonly string[]).includes(t);

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

export function pathMatchesKind(path: string, kind: UploadKind, userId: string): boolean {
  const m = DOCUMENT_PATH_RE.exec(path);
  return !!m && m[1] === kind && path.startsWith(`${userId}/`);
}

/** Short label for a stored path, e.g. `bank_statement-1a2b3c4d.pdf`. */
export const fileNameFromPath = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

export interface StoredDocument {
  kind: DocumentKind;
  path: string;
  contentType: string;
  size: number;
}

/** Defensive read of a documents JSONB column: malformed entries are dropped, known kinds only, in display order. */
export function parseDocuments(value: unknown): StoredDocument[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((d): d is StoredDocument => !!d && typeof d === 'object' && isDocumentKind((d as StoredDocument).kind) && typeof (d as StoredDocument).path === 'string')
    .sort((a, b) => DOCUMENT_KINDS.indexOf(a.kind) - DOCUMENT_KINDS.indexOf(b.kind));
}
