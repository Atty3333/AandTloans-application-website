import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { DOCUMENTS_BUCKET } from '@/lib/config';
import { EXTENSION_BY_TYPE, MAX_DOCUMENT_BYTES, isAllowedDocumentType, isImageType, isUploadKind } from '@/lib/documents';
import { rateLimit } from '@/lib/rate-limit';
import { authenticateRequest, getServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (status: number, error: string) => NextResponse.json({ success: false, error }, { status });

/**
 * Issues a short-lived signed upload URL for ONE supporting document.
 * The file goes straight from the browser to the private bucket; the bucket itself enforces the size and type limits.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    if (auth.failure === 'misconfigured') return fail(500, 'The server is not configured correctly. Please contact support.');
    return fail(401, 'Your session has expired. Please sign out and sign in again.');
  }
  if (!auth.user.email_confirmed_at) return fail(403, 'Please confirm your email address before applying.');

  const limit = rateLimit(`upload:${auth.user.id}`, 60, 60 * 60 * 1000);
  if (!limit.ok) return fail(429, 'Too many uploads. Please try again later.');

  let body: { kind?: unknown; contentType?: unknown; size?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Invalid request body.');
  }

  if (!isUploadKind(body.kind)) return fail(400, 'Unknown document type.');
  if (typeof body.contentType !== 'string' || !isAllowedDocumentType(body.contentType)) {
    return fail(400, 'Unsupported file type. Use JPG, PNG, WebP or PDF.');
  }
  if (body.kind === 'avatar' && !isImageType(body.contentType)) return fail(400, 'Profile pictures must be a JPG, PNG or WebP image.');
  if (typeof body.size !== 'number' || !(body.size > 0) || body.size > MAX_DOCUMENT_BYTES) {
    return fail(400, 'File is too large (max 10 MB).');
  }

  const path = `${auth.user.id}/${body.kind}-${randomBytes(4).toString('hex')}.${EXTENSION_BY_TYPE[body.contentType]}`;

  try {
    const { data, error } = await getServiceClient().storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw error ?? new Error('No upload URL returned');
    return NextResponse.json({ success: true, path, token: data.token });
  } catch (err) {
    console.error('[upload-url] could not create signed upload URL', err);
    return fail(500, 'Could not start the upload. Please try again.');
  }
}
