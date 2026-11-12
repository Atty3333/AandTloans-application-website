import { NextRequest, NextResponse } from 'next/server';
import { UUID_RE, fail } from '@/lib/api';
import { PROFILE_FIELD_TO_COLUMN, diffProfile, profileToRow, type ProfileColumns } from '@/lib/profile';
import { authenticateAdmin, getServiceClient } from '@/lib/supabase-server';
import { fieldErrors, profileDetailsSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 20_000;
const COLUMNS = Object.values(PROFILE_FIELD_TO_COLUMN);

/**
 * Admin-only: edit a user's personal details. Admins never touch the saved loan documents or the picture here
 * (same rule as application documents). Every change is recorded in profile_edits.
 */
export async function PATCH(req: NextRequest, { params }: { params: { userId: string } }) {
  if (!UUID_RE.test(params.userId)) return fail(400, 'Invalid user id.');

  const auth = await authenticateAdmin(req);
  if (!auth.user) {
    if (auth.failure === 'misconfigured') return fail(500, 'The server is not configured correctly.');
    if (auth.failure === 'forbidden') return fail(403, 'Admin access is required.');
    return fail(401, 'Your session has expired. Please sign in again.');
  }
  const admin = auth.user;

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return fail(413, 'Request too large.');
    raw = JSON.parse(text);
  } catch {
    return fail(400, 'Invalid request body.');
  }
  const parsed = profileDetailsSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'Please correct the highlighted fields.', { fieldErrors: fieldErrors(parsed.error) });

  try {
    const supabase = getServiceClient();
    const { data: existing, error: readError } = await supabase.from('profiles').select([...COLUMNS, 'is_staff'].join(', ')).eq('user_id', params.userId).maybeSingle();
    if (readError) throw readError;
    if (!existing) return fail(404, 'Profile not found.');

    const before = existing as unknown as ProfileColumns & { is_staff?: boolean };
    const next = profileToRow(parsed.data);
    // Admin accounts: income is confidential, so it is neither editable nor stored.
    if (before.is_staff) next.monthly_income = null;
    const changes = diffProfile(before, next);
    if (Object.keys(changes).length === 0) return NextResponse.json({ success: true, changed: false });

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update({ ...next, updated_at: now, last_edited_at: now, last_edited_by: admin.id })
      .eq('user_id', params.userId)
      .select('*')
      .single();
    if (updateError) throw updateError;

    const { error: auditError } = await supabase.from('profile_edits').insert({
      user_id: params.userId,
      edited_by: admin.id,
      edited_by_email: admin.email ?? null,
      changes,
    });
    if (auditError) {
      console.error('[admin-profile-edit] audit insert failed, reverting edit', auditError);
      const { is_staff: _isStaff, ...previous } = before;
      await supabase.from('profiles').update({ ...previous, last_edited_at: null, last_edited_by: null }).eq('user_id', params.userId);
      return fail(500, 'Could not record the edit history, so the change was not saved. Please try again.');
    }

    return NextResponse.json({ success: true, changed: true, profile: updated, changes });
  } catch (err) {
    console.error('[admin-profile-edit] unexpected error', err);
    return fail(500, 'Something went wrong while saving. Please try again.');
  }
}
