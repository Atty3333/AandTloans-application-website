import type { SupabaseClient } from '@supabase/supabase-js';
import { DOCUMENTS_BUCKET } from './config';
import {
  DOCUMENT_KINDS,
  MAX_DOCUMENT_BYTES,
  isAllowedDocumentType,
  isImageType,
  pathMatchesKind,
  type DocumentKind,
  type StoredDocument,
} from './documents';

export type DocumentCheck =
  | { ok: true; documents: StoredDocument[] }
  | { ok: false; errors: Partial<Record<DocumentKind, string>> };

/**
 * Confirms each submitted path was issued to THIS user for THAT document type, that the object really
 * exists in the private bucket, and that its stored size and content type are acceptable.
 */
export async function verifyDocuments(
  supabase: SupabaseClient,
  userId: string,
  paths: Record<DocumentKind, string>,
): Promise<DocumentCheck> {
  return verifyDocumentPaths(supabase, userId, paths);
}

/** Same checks for any subset of the document kinds (used by the profile, which is filled in over time). */
export async function verifyDocumentPaths(
  supabase: SupabaseClient,
  userId: string,
  paths: Partial<Record<DocumentKind, string>>,
): Promise<DocumentCheck> {
  const errors: Partial<Record<DocumentKind, string>> = {};
  const documents: StoredDocument[] = [];

  await Promise.all(
    DOCUMENT_KINDS.map(async (kind) => {
      const path = paths[kind];
      if (path === undefined) return;
      if (!pathMatchesKind(path, kind, userId)) {
        errors[kind] = 'Please upload this document again.';
        return;
      }
      const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).info(path);
      if (error || !data) {
        errors[kind] = 'This upload was not received. Please upload it again.';
        return;
      }
      const contentType = data.contentType ?? '';
      const size = data.size ?? 0;
      if (!isAllowedDocumentType(contentType)) {
        errors[kind] = 'Unsupported file type. Use JPG, PNG, WebP or PDF.';
        return;
      }
      if (size <= 0 || size > MAX_DOCUMENT_BYTES) {
        errors[kind] = 'File size is not acceptable (max 10 MB).';
        return;
      }
      documents.push({ kind, path, contentType, size });
    }),
  );

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  documents.sort((a, b) => DOCUMENT_KINDS.indexOf(a.kind) - DOCUMENT_KINDS.indexOf(b.kind));
  return { ok: true, documents };
}

/** Confirms a profile picture path was issued to this user, exists, and is an image. Returns an error message or null. */
export async function verifyAvatar(supabase: SupabaseClient, userId: string, path: string): Promise<string | null> {
  if (!pathMatchesKind(path, 'avatar', userId)) return 'Please upload the picture again.';
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).info(path);
  if (error || !data) return 'This upload was not received. Please upload it again.';
  if (!isImageType(data.contentType ?? '')) return 'Profile pictures must be a JPG, PNG or WebP image.';
  if (!data.size || data.size > MAX_DOCUMENT_BYTES) return 'File size is not acceptable (max 10 MB).';
  return null;
}
