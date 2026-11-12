import { NextRequest, NextResponse } from 'next/server';
import { UUID_RE, authFailureResponse, authenticateRequest, fail } from '@/lib/api';
import { canApplicantCancel } from '@/lib/config';
import { rateLimit } from '@/lib/rate-limit';
import { getServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Applicant cancels their OWN application, only while it is still awaiting a reply (PENDING).
 * The status change is a single conditional UPDATE, so a concurrent admin reply can never be overwritten.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const applicationId = params.id.toLowerCase();
  if (!UUID_RE.test(applicationId)) return fail(400, 'Invalid application id.');

  const auth = await authenticateRequest(req);
  const denied = authFailureResponse(auth);
  if (denied || !auth.user) return denied ?? fail(401, 'Your session has expired. Please sign out and sign in again.');
  const user = auth.user;

  const limit = rateLimit(`cancel:${user.id}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return fail(429, 'Too many requests. Please try again later.');

  try {
    const supabase = getServiceClient();
    const { data: cancelled, error } = await supabase
      .from('loan_applications')
      .update({ status: 'CANCELLED' })
      .eq('id', applicationId)
      .eq('user_id', user.id)
      .eq('status', 'PENDING')
      .select('id, status, status_updated_at')
      .maybeSingle();
    if (error) throw error;
    if (cancelled) return NextResponse.json({ success: true, application: cancelled });

    // Nothing updated: explain why (same answer for "not yours" and "does not exist").
    const { data: existing, error: readError } = await supabase
      .from('loan_applications')
      .select('status, user_id')
      .eq('id', applicationId)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing || existing.user_id !== user.id) return fail(404, 'Application not found.');
    if (existing.status === 'CANCELLED') return fail(409, 'This application has already been cancelled.');
    if (!canApplicantCancel(existing.status)) return fail(403, 'This application has already been replied to, so it can no longer be cancelled. Please contact us if you need help.');
    return fail(409, 'The application could not be cancelled. Please refresh and try again.');
  } catch (err) {
    console.error('[cancel] unexpected error', err);
    return fail(500, 'Something went wrong. Please try again.');
  }
}
