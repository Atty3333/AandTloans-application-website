import { NextRequest, NextResponse } from 'next/server';
import { FIELD_TO_COLUMN, diffRows, toRow, type DetailRow } from '@/lib/applications';
import { authenticateAdmin, getServiceClient } from '@/lib/supabase-server';
import { adminEditSchema, fieldErrors } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 50_000;
const DETAIL_COLUMNS = Object.values(FIELD_TO_COLUMN);

const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error, ...extra }, { status });

/**
 * Admin-only: edit an applicant's details (never the signature, consent or uploaded documents).
 * The signed PDF stays exactly as the applicant signed it; every change is recorded in application_edits.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return fail(400, 'Invalid application id.');

  const auth = await authenticateAdmin(req);
  if (!auth.user) {
    if (auth.failure === 'misconfigured') return fail(500, 'The server is not configured correctly.');
    if (auth.failure === 'forbidden') return fail(403, 'Admin access is required.');
    return fail(401, 'Your session has expired. Please sign in again.');
  }
  const admin = auth.user;

  let raw: unknown;
  try {
    const body = await req.text();
    if (body.length > MAX_BODY_BYTES) return fail(413, 'Request too large.');
    raw = JSON.parse(body);
  } catch {
    return fail(400, 'Invalid request body.');
  }

  const parsed = adminEditSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'Please correct the highlighted fields.', { fieldErrors: fieldErrors(parsed.error) });

  try {
    const supabase = getServiceClient();

    const { data: existing, error: readError } = await supabase
      .from('loan_applications')
      .select(DETAIL_COLUMNS.join(', '))
      .eq('id', params.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) return fail(404, 'Application not found.');

    const before = existing as unknown as DetailRow;
    const next = toRow(parsed.data);
    const changes = diffRows(before, next);
    if (Object.keys(changes).length === 0) return NextResponse.json({ success: true, changed: false });

    const { data: updated, error: updateError } = await supabase
      .from('loan_applications')
      .update({ ...next, last_edited_at: new Date().toISOString(), last_edited_by: admin.id })
      .eq('id', params.id)
      .select('*')
      .single();
    if (updateError) {
      if (updateError.code === '23505') {
        return fail(409, 'Another application waiting for a reply already uses this Omang number.', {
          fieldErrors: { idNumber: 'This Omang already has an application waiting for a reply' },
        });
      }
      throw updateError;
    }

    const { error: auditError } = await supabase.from('application_edits').insert({
      application_id: params.id,
      edited_by: admin.id,
      edited_by_email: admin.email ?? null,
      changes,
    });
    if (auditError) {
      // Never keep an edit that has no audit record: put the previous values back.
      console.error('[admin-edit] audit insert failed, reverting edit', auditError);
      await supabase.from('loan_applications').update({ ...before, last_edited_at: null, last_edited_by: null }).eq('id', params.id);
      return fail(500, 'Could not record the edit history, so the change was not saved. Please try again.');
    }

    return NextResponse.json({ success: true, changed: true, application: updated, changes });
  } catch (err) {
    console.error('[admin-edit] unexpected error', err);
    return fail(500, 'Something went wrong while saving. Please try again.');
  }
}
