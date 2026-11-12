import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { DOCUMENTS_BUCKET, MAX_PROOFS, PROOF_EDITABLE_STATUS } from '@/lib/config';
import { EXTENSION_BY_TYPE, MAX_DOCUMENT_BYTES, isAllowedDocumentType } from '@/lib/documents';
import { parseProofs, proofPath, proofPathBelongsTo, proofRequestSchema, type ProofOfPayment } from '@/lib/proofs';
import { rateLimit } from '@/lib/rate-limit';
import { authenticateRequest, getServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY_BYTES = 5_000;

const fail = (status: number, error: string) => NextResponse.json({ success: false, error }, { status });

const RPC_ERRORS: Record<string, [number, string]> = {
  application_not_found: [404, 'Application not found.'],
  status_not_allowed: [403, 'Proof of payment can only be changed while the loan is approved.'],
  proof_limit_reached: [409, `You can upload at most ${MAX_PROOFS} proofs of payment. Remove or replace one instead.`],
  duplicate_proof: [409, 'This file is already attached.'],
  proof_not_found: [404, 'That proof of payment no longer exists. Please refresh the page.'],
};

function rpcFailure(message: string | undefined) {
  const key = Object.keys(RPC_ERRORS).find((k) => message?.includes(k));
  if (key) return fail(...RPC_ERRORS[key]);
  console.error('[proofs] rpc failed', message);
  return fail(500, 'Something went wrong. Please try again.');
}

/** Confirms the uploaded object exists in the private bucket with an acceptable type and size. */
async function readUploadedFile(supabase: SupabaseClient, path: string): Promise<{ contentType: string; size: number } | null> {
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).info(path);
  if (error || !data) return null;
  const contentType = data.contentType ?? '';
  const size = data.size ?? 0;
  if (!isAllowedDocumentType(contentType) || size <= 0 || size > MAX_DOCUMENT_BYTES) return null;
  return { contentType, size };
}

const discard = (supabase: SupabaseClient, path: string) => supabase.storage.from(DOCUMENTS_BUCKET).remove([path]).then(() => undefined, () => undefined);

/**
 * Proof of payment for one application. Applicants (owner only) may act while the loan is APPROVED;
 * admins may act on any application. At most MAX_PROOFS files per application (enforced in the database too).
 * Actions: sign (get an upload URL), attach, replace, remove, view (short-lived download link).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const applicationId = params.id.toLowerCase();
  if (!UUID_RE.test(applicationId)) return fail(400, 'Invalid application id.');

  const auth = await authenticateRequest(req);
  if (!auth.user) {
    if (auth.failure === 'misconfigured') return fail(500, 'The server is not configured correctly. Please contact support.');
    return fail(401, 'Your session has expired. Please sign out and sign in again.');
  }
  const user = auth.user;
  const isAdmin = user.app_metadata?.role === 'admin';
  if (!isAdmin && !user.email_confirmed_at) return fail(403, 'Please confirm your email address first.');

  const limit = rateLimit(`proof:${user.id}`, 60, 60 * 60 * 1000);
  if (!limit.ok) return fail(429, 'Too many requests. Please try again later.');

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return fail(413, 'Request too large.');
    body = JSON.parse(text);
  } catch {
    return fail(400, 'Invalid request body.');
  }
  const parsed = proofRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, 'Invalid request.');
  const req2 = parsed.data;

  let supabase: SupabaseClient;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.error('[proofs] service client unavailable', err);
    return fail(500, 'The server is not configured correctly. Please contact support.');
  }

  try {
    const { data: app, error: readError } = await supabase
      .from('loan_applications')
      .select('id, user_id, status, proof_of_payments')
      .eq('id', applicationId)
      .maybeSingle();
    if (readError) throw readError;
    // Same answer for "not yours" and "does not exist" so ids cannot be probed.
    if (!app || (!isAdmin && app.user_id !== user.id)) return fail(404, 'Application not found.');

    const proofs = parseProofs(app.proof_of_payments);
    const requiredStatus = isAdmin ? null : PROOF_EDITABLE_STATUS;

    if (req2.action !== 'view' && !isAdmin && app.status !== PROOF_EDITABLE_STATUS) {
      return fail(403, 'Proof of payment can only be changed while the loan is approved.');
    }

    // ---- view: signed download link, only for files that are really attached to this application ----
    if (req2.action === 'view') {
      if (!proofs.some((p) => p.path === req2.path)) return fail(404, 'File not found.');
      const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(req2.path, 300);
      if (error || !data) throw error ?? new Error('no signed url');
      return NextResponse.json({ success: true, url: data.signedUrl });
    }

    // ---- sign: issue a one-file upload URL ----
    if (req2.action === 'sign') {
      if (!req2.replacing && proofs.length >= MAX_PROOFS) return fail(409, RPC_ERRORS.proof_limit_reached[1]);
      const path = proofPath(applicationId, randomBytes(4).toString('hex'), EXTENSION_BY_TYPE[req2.contentType]);
      const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw error ?? new Error('no upload url');
      return NextResponse.json({ success: true, path, token: data.token });
    }

    // ---- attach / replace / remove ----
    if (req2.action === 'remove') {
      if (!proofPathBelongsTo(req2.path, applicationId)) return fail(400, 'Invalid proof of payment file.');
      const { data, error } = await supabase.rpc('remove_proof_of_payment', {
        p_application_id: applicationId,
        p_path: req2.path,
        p_required_status: requiredStatus,
      });
      if (error) return rpcFailure(error.message);
      await discard(supabase, req2.path);
      return NextResponse.json({ success: true, proofs: parseProofs(data) });
    }

    if (!proofPathBelongsTo(req2.path, applicationId) || (req2.action === 'replace' && !proofPathBelongsTo(req2.oldPath, applicationId))) {
      return fail(400, 'Invalid proof of payment file.');
    }
    const file = await readUploadedFile(supabase, req2.path);
    if (!file) return fail(400, 'This upload was not received or is not a JPG, PNG, WebP or PDF under 10 MB. Please upload it again.');

    const entry: ProofOfPayment = { path: req2.path, ...file, uploadedAt: new Date().toISOString(), uploadedBy: isAdmin ? 'admin' : 'user' };

    if (req2.action === 'attach') {
      const { data, error } = await supabase.rpc('add_proof_of_payment', {
        p_application_id: applicationId,
        p_proof: entry,
        p_max: MAX_PROOFS,
        p_required_status: requiredStatus,
      });
      if (error) {
        await discard(supabase, req2.path);
        return rpcFailure(error.message);
      }
      return NextResponse.json({ success: true, proofs: parseProofs(data) });
    }

    const { data, error } = await supabase.rpc('replace_proof_of_payment', {
      p_application_id: applicationId,
      p_old_path: req2.oldPath,
      p_proof: entry,
      p_required_status: requiredStatus,
    });
    if (error) {
      await discard(supabase, req2.path);
      return rpcFailure(error.message);
    }
    if (req2.oldPath !== req2.path) await discard(supabase, req2.oldPath);
    return NextResponse.json({ success: true, proofs: parseProofs(data) });
  } catch (err) {
    console.error('[proofs] unexpected error', err);
    return fail(500, 'Something went wrong. Please try again.');
  }
}

