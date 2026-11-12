import type { SupabaseClient } from '@supabase/supabase-js';
import { DOCUMENTS_BUCKET } from './config';

/** Opens a private file in a new tab through a short-lived signed link. Works for your own files (and any file, for admins). */
export async function openPrivateFile(supabase: SupabaseClient, path: string): Promise<string | null> {
  const tab = window.open('', '_blank');
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 300);
  if (error || !data) {
    tab?.close();
    return error?.message ?? 'Could not open the file.';
  }
  if (tab) {
    tab.opener = null;
    tab.location.href = data.signedUrl;
  } else {
    window.location.href = data.signedUrl;
  }
  return null;
}

/** Bearer token for the API routes, or null when the session is gone. */
export async function accessToken(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
