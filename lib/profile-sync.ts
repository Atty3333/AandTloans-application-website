import type { SupabaseClient } from '@supabase/supabase-js';
import { DOCUMENT_KINDS, type StoredDocument } from './documents';
import { fillBlankColumns, profileToRow, type ProfileColumns, type ProfileInputLike } from './profile';

/**
 * Server-only. After a successful application, copy its details into the applicant's profile wherever the profile is
 * still blank (never overwrites what the user already saved) and keep any document kind the profile does not have yet.
 * Best effort: a failure here must never fail the application.
 */
export async function seedProfileFromApplication(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
  details: ProfileInputLike,
  documents: readonly StoredDocument[],
): Promise<void> {
  try {
    const { data: existing, error } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
    if (error) throw error;

    const columns = fillBlankColumns(existing as Partial<ProfileColumns> | null, profileToRow(details));
    if (existing?.is_staff) columns.monthly_income = null; // admin accounts never store income
    const savedDocs = ((existing?.documents ?? []) as StoredDocument[]).filter((d) => DOCUMENT_KINDS.includes(d.kind));
    const have = new Set(savedDocs.map((d) => d.kind));
    const mergedDocs = [...savedDocs, ...documents.filter((d) => !have.has(d.kind))];

    const { error: upsertError } = await supabase.from('profiles').upsert(
      { user_id: user.id, email: user.email ?? existing?.email ?? null, ...columns, documents: mergedDocs, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (upsertError) throw upsertError;
  } catch (err) {
    console.error('[profile-sync] could not seed profile from application', err);
  }
}
