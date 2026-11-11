import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { toRow } from '@/lib/applications';
import { AWAITING_REPLY_STATUSES, STORAGE_BUCKET, TERMS_VERSION, formatBwp } from '@/lib/config';
import { InvalidSignatureError, buildLoanPdf } from '@/lib/pdf-generator';
import { rateLimit } from '@/lib/rate-limit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticateRequest, getServiceClient } from '@/lib/supabase-server';
import { verifyTurnstile } from '@/lib/turnstile';
import { applicationSchema, fieldErrors } from '@/lib/validation';
import { verifyDocuments } from '@/lib/verify-documents';
import { notifyAdminWhatsApp } from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 1_000_000;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const fail = (status: number, error: string, extra: Record<string, unknown> = {}, headers?: HeadersInit) =>
  NextResponse.json({ success: false, error, ...extra }, { status, headers });

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  const limit = rateLimit(`submit:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return fail(429, 'Too many submissions. Please try again later.', {}, { 'Retry-After': String(limit.retryAfterSec) });
  }

  const auth = await authenticateRequest(req);
  if (!auth.user) {
    if (auth.failure === 'misconfigured') {
      return fail(500, 'The server is not configured correctly. Please contact support.');
    }
    return fail(401, 'Your session has expired. Please sign out and sign in again, then resubmit.');
  }
  const user = auth.user;
  if (!user.email_confirmed_at) {
    return fail(403, 'Please confirm your email address before applying.');
  }

  let supabase: SupabaseClient;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.error('[submit-loan] service client unavailable', err);
    return fail(500, 'The server is not configured correctly. Please contact support.');
  }

  const userLimit = rateLimit(`submit-user:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!userLimit.ok) {
    return fail(429, 'Too many submissions. Please try again later.', {}, { 'Retry-After': String(userLimit.retryAfterSec) });
  }

  // --- Parse + validate request body -----------------------------------------------
  let raw: unknown;
  try {
    const body = await req.text();
    if (body.length > MAX_BODY_BYTES) return fail(413, 'Request too large.');
    raw = JSON.parse(body);
  } catch {
    return fail(400, 'Invalid request body.');
  }

  const parsed = applicationSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(400, 'Please correct the highlighted fields.', { fieldErrors: fieldErrors(parsed.error) });
  }
  const data = parsed.data;

  if (!(await verifyTurnstile(data.turnstileToken, ip))) {
    return fail(400, 'Verification failed. Please refresh the page and try again.');
  }

  try {
    // --- One application awaiting a reply per Omang and per account ---------------------------
    const { data: existing, error: lookupError } = await supabase
      .from('loan_applications')
      .select('id, user_id')
      .or(`id_number.eq.${data.idNumber},user_id.eq.${user.id}`)
      .in('status', [...AWAITING_REPLY_STATUSES])
      .limit(1);
    if (lookupError) throw lookupError;
    if (existing && existing.length > 0) {
      return fail(409, 'You already have an application waiting for a reply, or this Omang number already has one. You can apply again once it has been replied to.', {
        fieldErrors: { idNumber: 'An application for this Omang is already waiting for a reply' },
      });
    }

    // --- Supporting documents must really exist in the private bucket --------------
    const docCheck = await verifyDocuments(supabase, user.id, data.documents);
    if (!docCheck.ok) {
      return fail(400, 'Please re-upload the highlighted documents.', { fieldErrors: docCheck.errors });
    }

    // --- Build the PDF on the server from validated data ----------------------------
    const applicationId = randomUUID();
    const submittedAt = new Date();
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildLoanPdf(data, { applicationId, submittedAt, ipAddress: ip });
    } catch (err) {
      if (err instanceof InvalidSignatureError) {
        return fail(400, 'Please sign the application.', { fieldErrors: { signatureDataUrl: 'Please sign the application' } });
      }
      throw err;
    }
    const sha256 = createHash('sha256').update(pdfBytes).digest('hex');

    // --- Upload to PRIVATE bucket ----------------------------------------------------
    const pdfPath = `applications/${submittedAt.getUTCFullYear()}/${applicationId}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: false });
    if (uploadError) throw uploadError;

    // --- Insert record; roll back the upload if it fails ----------------------------
    const { error: dbError } = await supabase.from('loan_applications').insert({
      id: applicationId,
      user_id: user.id,
      ...toRow(data),
      documents: docCheck.documents,
      consent_given_at: submittedAt.toISOString(),
      terms_version: TERMS_VERSION,
      submitted_ip: ip,
      user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
      pdf_path: pdfPath,
      pdf_sha256: sha256,
      status: 'PENDING',
    });

    if (dbError) {
      await supabase.storage.from(STORAGE_BUCKET).remove([pdfPath]).catch(() => undefined);
      if (dbError.code === '23505') {
        return fail(409, 'You already have an application waiting for a reply.', { fieldErrors: { idNumber: 'An application for this Omang is already waiting for a reply' } });
      }
      throw dbError;
    }

    // --- Notify admin (best effort: never fails the applicant) ----------------------
    const { data: signed, error: signError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(pdfPath, 60 * 60);
    if (signError) {
      console.error('[submit-loan] could not sign URL', signError);
    } else if (signed?.signedUrl) {
      const safeName = data.fullName.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40) || 'applicant';
      const sent = await notifyAdminWhatsApp({
        documentUrl: signed.signedUrl,
        filename: `AAndTee_Loan_${safeName}.pdf`,
        applicantName: data.fullName,
        applicantPhone: data.phone,
        amountLabel: formatBwp(data.loanAmount),
      });
      if (sent) {
        await supabase
          .from('loan_applications')
          .update({ whatsapp_notified_at: new Date().toISOString() })
          .eq('id', applicationId);
      }
    }

    return NextResponse.json({ success: true, reference: applicationId.slice(0, 8).toUpperCase() });
  } catch (err) {
    console.error('[submit-loan] unexpected error', err);
    return fail(500, 'Something went wrong while submitting. Please try again in a moment.');
  }
}