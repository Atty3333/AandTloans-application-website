import type { SupabaseClient } from '@supabase/supabase-js';
import { DOCUMENTS_BUCKET } from './config';
import { checkDocumentFile, type DocumentKind } from './documents';

/** Uploads one supporting document straight to the private bucket via a server-issued signed URL. Returns its storage path. */
export async function uploadDocument(supabase: SupabaseClient, kind: DocumentKind, file: File): Promise<string> {
  const problem = checkDocumentFile(file);
  if (problem) throw new Error(problem);

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Your session has expired. Please sign out and sign in again.');

  const res = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind, contentType: file.type, size: file.size }),
  });
  const json = (await res.json().catch(() => ({}))) as { path?: string; token?: string; error?: string };
  if (!res.ok || !json.path || !json.token) throw new Error(json.error ?? 'Could not start the upload. Please try again.');

  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).uploadToSignedUrl(json.path, json.token, file, { contentType: file.type });
  if (error) throw new Error('Upload failed. Check your connection and try again.');
  return json.path;
}
