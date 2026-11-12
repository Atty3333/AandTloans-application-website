import type { User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { selectWarningTargets, renderWarning, warningMessageSchema, type WarningCandidate } from '@/lib/payment-warnings';
import { rateLimit } from '@/lib/rate-limit';
import { authenticateAdmin, getServiceClient } from '@/lib/supabase-server';
import { sendWhatsAppText, WHATSAPP_MESSAGING_INTEGRATED } from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ success: false, error, ...extra }, { status });

async function loadTargets() {
  const { data, error } = await getServiceClient()
    .from('loan_applications')
    .select('id, full_name, status, loan_amount_requested, whatsapp_number, proof_of_payments')
    .eq('status', 'APPROVED')
    .limit(2000);
  if (error) throw error;
  return selectWarningTargets((data ?? []) as WarningCandidate[]);
}

type Gate = { admin: User; response?: undefined } | { admin?: undefined; response: NextResponse };

async function requireAdmin(req: NextRequest): Promise<Gate> {
  const auth = await authenticateAdmin(req);
  if (auth.user) return { admin: auth.user };
  if (auth.failure === 'misconfigured') return { response: fail(500, 'The server is not configured correctly.') };
  if (auth.failure === 'forbidden') return { response: fail(403, 'Admin access is required.') };
  return { response: fail(401, 'Your session has expired. Please sign in again.') };
}

/** Preview: who would receive the warning right now (APPROVED, no proof of payment). */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate.response) return gate.response;
  try {
    const { recipients, withoutNumber } = await loadTargets();
    return NextResponse.json({
      success: true,
      integrated: WHATSAPP_MESSAGING_INTEGRATED,
      recipients: recipients.map((r) => ({ reference: r.reference, name: r.name })),
      withoutNumber,
    });
  } catch (err) {
    console.error('[payment-warnings] preview failed', err);
    return fail(500, 'Could not load the recipients. Please try again.');
  }
}

/**
 * Send ONE custom warning to everyone whose application is APPROVED and has no proof of payment.
 * WhatsApp is not integrated yet (lib/whatsapp.ts), so nothing is delivered. Nothing is stored: no message history.
 * Placeholders {name}, {amount} and {reference} are filled in per recipient.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate.response) return gate.response;

  const limit = rateLimit(`warn:${gate.admin.id}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return fail(429, 'Too many warning batches. Please try again later.');

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > 5_000) return fail(413, 'Request too large.');
    raw = JSON.parse(text);
  } catch {
    return fail(400, 'Invalid request body.');
  }
  const parsed = warningMessageSchema.safeParse(raw);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid message.');

  try {
    const { recipients, withoutNumber } = await loadTargets();
    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      const result = await sendWhatsAppText(r.to, renderWarning(parsed.data.message, r));
      if (result.ok) sent += 1;
      else if (result.reason === 'failed') failed += 1;
    }
    return NextResponse.json({
      success: true,
      integrated: WHATSAPP_MESSAGING_INTEGRATED,
      targeted: recipients.length,
      sent,
      failed,
      withoutNumber: withoutNumber.length,
    });
  } catch (err) {
    console.error('[payment-warnings] send failed', err);
    return fail(500, 'Something went wrong while sending. Please try again.');
  }
}
