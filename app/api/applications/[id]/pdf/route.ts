import { NextRequest, NextResponse } from 'next/server';
import { UUID_RE, authFailureResponse, authenticateRequest, fail } from '@/lib/api';
import { STORAGE_BUCKET } from '@/lib/config';
import { rateLimit } from '@/lib/rate-limit';
import { getServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Short-lived download link for the applicant's OWN signed application PDF (the bucket itself is admin-only). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const applicationId = params.id.toLowerCase();
  if (!UUID_RE.test(applicationId)) return fail(400, 'Invalid application id.');

  const auth = await authenticateRequest(req);
  const denied = authFailureResponse(auth);
  if (denied || !auth.user) return denied ?? fail(401, 'Your session has expired. Please sign out and sign in again.');
  const user = auth.user;

  const limit = rateLimit(`pdf:${user.id}`, 60, 60 * 60 * 1000);
  if (!limit.ok) return fail(429, 'Too many requests. Please try again later.');

  try {
    const supabase = getServiceClient();
    const { data: app, error } = await supabase.from('loan_applications').select('user_id, pdf_path').eq('id', applicationId).maybeSingle();
    if (error) throw error;
    if (!app || app.user_id !== user.id) return fail(404, 'Application not found.');

    const { data, error: signError } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(app.pdf_path, 300);
    if (signError || !data) throw signError ?? new Error('no signed url');
    return NextResponse.json({ success: true, url: data.signedUrl });
  } catch (err) {
    console.error('[pdf] could not create link', err);
    return fail(500, 'Could not open the document. Please try again.');
  }
}
