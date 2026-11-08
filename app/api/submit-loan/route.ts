import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_STATUSES, STORAGE_BUCKET, TERMS_VERSION, formatBwp } from '@/lib/config';
import { InvalidSignatureError, buildLoanPdf } from '@/lib/pdf-generator';
import { rateLimit } from '@/lib/rate-limit';
import { getServiceClient } from '@/lib/supabase-server';
import { verifyTurnstile } from '@/lib/turnstile';
import { applicationSchema, fieldErrors } from '@/lib/validation';
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

  // --- Require a signed-in applicant ------------------------------------------------
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return fail(401, 'Please sign in to submit an application.');
  let userId: string;
  try {
    const { data: auth, error: authError } = await getServiceClient().auth.getUser(token);
    if (authError || !auth.user) return fail(401, 'Your session has expired. Please sign in again.');
    userId = auth.user.id;
  } catch (err) {
    console.error('[submit-loan] could not verify applicant session', err);
    return fail(503, 'Applications are temporarily unavailable. Please try again later.');
  }

  // --- Parse + validate ------------------------------------------------------------
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
    const supabase = getServiceClient();

    // --- One active application per Omang ------------------------------------------
    const { data: existing, error: lookupError } = await supabase
      .from('loan_applications')
      .select('id')
      .eq('id_number', data.idNumber)
      .in('status', [...ACTIVE_STATUSES])
      .limit(1);
    if (lookupError) throw lookupError;
    if (existing && existing.length > 0) {
      return fail(409, 'An application for this Omang number is already in progress.', { fieldErrors: { idNumber: 'An application for this Omang is already in progress' } });
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
      user_id: userId,
      full_name: data.fullName,
      date_of_birth: data.dob,
      id_number: data.idNumber,
      phone_number: data.phone,
      email: data.email,
      address: data.address,
      institution: data.institution,
      monthly_income: data.income,
      loan_amount_requested: data.loanAmount,
      loan_purpose: data.loanPurpose,
      kin_full_name: data.kinName,
      kin_relationship: data.kinRelationship,
      kin_id_number: data.kinId,
      kin_phone: data.kinPhone,
      kin_alt_phone: data.kinAltPhone ?? null,
      kin_address: data.kinAddress,
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
        return fail(409, 'An application for this Omang number is already in progress.', { fieldErrors: { idNumber: 'An application for this Omang is already in progress' } });
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
