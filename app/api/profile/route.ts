import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { fail } from '@/lib/api';
import { DOCUMENT_KINDS, type StoredDocument } from '@/lib/documents';
import { profileToRow } from '@/lib/profile';
import { rateLimit } from '@/lib/rate-limit';
import { authenticateRequest, getServiceClient } from '@/lib/supabase-server';
import { fieldErrors, profileUpdateSchema } from '@/lib/validation';
import { verifyAvatar, verifyDocumentPaths } from '@/lib/verify-documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 20_000;

type ProfileRecord = { is_staff?: boolean | null; monthly_income?: number | string | null } & Record<string, unknown>;

/** Keeps `is_staff` in line with the account's admin role, and makes sure an admin account never holds an income figure. */
async function syncStaffFlag<T extends ProfileRecord>(supabase: SupabaseClient, profile: T, isAdmin: boolean): Promise<T> {
  const needsFlag = Boolean(profile.is_staff) !== isAdmin;
  const needsClear = isAdmin && profile.monthly_income != null;
  if (!needsFlag && !needsClear) return profile;
  const patch = { is_staff: isAdmin, ...(isAdmin ? { monthly_income: null } : {}) };
  const { error } = await supabase.from('profiles').update(patch).eq('user_id', profile.user_id as string);
  if (error) {
    console.error('[profile] could not sync staff flag', error);
    return profile;
  }
  return { ...profile, ...patch };
}

/** Own profile. Works for applicants and admins; the row is created on first use. */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.user) return fail(auth.failure === 'misconfigured' ? 500 : 401, auth.failure === 'misconfigured' ? 'The server is not configured correctly.' : 'Your session has expired. Please sign in again.');
  try {
    const supabase = getServiceClient();
    const { data: existing, error } = await supabase.from('profiles').select('*').eq('user_id', auth.user.id).maybeSingle();
    if (error) throw error;
    if (existing) return NextResponse.json({ success: true, profile: await syncStaffFlag(supabase, existing, auth.user.app_metadata?.role === 'admin') });

    const { data: created, error: insertError } = await supabase
      .from('profiles')
      .upsert({ user_id: auth.user.id, email: auth.user.email ?? null }, { onConflict: 'user_id', ignoreDuplicates: true })
      .select('*')
      .maybeSingle();
    if (insertError) throw insertError;
    if (created) return NextResponse.json({ success: true, profile: await syncStaffFlag(supabase, created, auth.user.app_metadata?.role === 'admin') });
    const { data: again, error: againError } = await supabase.from('profiles').select('*').eq('user_id', auth.user.id).single();
    if (againError) throw againError;
    return NextResponse.json({ success: true, profile: await syncStaffFlag(supabase, again, auth.user.app_metadata?.role === 'admin') });
  } catch (err) {
    console.error('[profile] load failed', err);
    return fail(500, 'Could not load your profile. Please try again.');
  }
}

/** Save own profile: personal details, profile picture and saved loan documents. */
export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.user) return fail(auth.failure === 'misconfigured' ? 500 : 401, auth.failure === 'misconfigured' ? 'The server is not configured correctly.' : 'Your session has expired. Please sign in again.');
  const user = auth.user;

  const limit = rateLimit(`profile:${user.id}`, 60, 60 * 60 * 1000);
  if (!limit.ok) return fail(429, 'Too many saves. Please try again later.');

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return fail(413, 'Request too large.');
    raw = JSON.parse(text);
  } catch {
    return fail(400, 'Invalid request body.');
  }
  const parsed = profileUpdateSchema.safeParse(raw);
  if (!parsed.success) return fail(400, 'Please correct the highlighted fields.', { fieldErrors: fieldErrors(parsed.error) });
  const { avatarPath, documents: docChanges, ...details } = parsed.data;

  let supabase: SupabaseClient;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.error('[profile] service client unavailable', err);
    return fail(500, 'The server is not configured correctly. Please contact support.');
  }

  try {
    const { data: existing, error: readError } = await supabase.from('profiles').select('avatar_path, documents').eq('user_id', user.id).maybeSingle();
    if (readError) throw readError;

    // Picture: only paths issued to this user, and only images.
    if (avatarPath) {
      const problem = await verifyAvatar(supabase, user.id, avatarPath);
      if (problem) return fail(400, problem, { fieldErrors: { avatarPath: problem } });
    }

    // Documents: null clears a kind, a path sets it (verified), a missing key leaves it unchanged.
    let documents = ((existing?.documents ?? []) as StoredDocument[]).filter((d) => DOCUMENT_KINDS.includes(d.kind));
    if (docChanges) {
      const toVerify: Partial<Record<(typeof DOCUMENT_KINDS)[number], string>> = {};
      for (const kind of DOCUMENT_KINDS) {
        const v = docChanges[kind];
        if (typeof v === 'string') toVerify[kind] = v;
      }
      const check = await verifyDocumentPaths(supabase, user.id, toVerify);
      if (!check.ok) return fail(400, 'Please re-upload the highlighted documents.', { fieldErrors: check.errors });
      const cleared = new Set(DOCUMENT_KINDS.filter((k) => docChanges[k] === null));
      const replaced = new Set(check.documents.map((d) => d.kind));
      documents = [...documents.filter((d) => !cleared.has(d.kind) && !replaced.has(d.kind)), ...check.documents];
      documents.sort((a, b) => DOCUMENT_KINDS.indexOf(a.kind) - DOCUMENT_KINDS.indexOf(b.kind));
    }

    // Admin accounts: monthly income is confidential and is never stored.
    const isAdmin = user.app_metadata?.role === 'admin';
    const row = profileToRow(details);
    if (isAdmin) row.monthly_income = null;

    const { data: saved, error: saveError } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: user.id,
          email: user.email ?? null,
          is_staff: isAdmin,
          ...row,
          ...(avatarPath !== undefined ? { avatar_path: avatarPath } : {}),
          documents,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select('*')
      .single();
    if (saveError) throw saveError;
    return NextResponse.json({ success: true, profile: saved });
  } catch (err) {
    console.error('[profile] save failed', err);
    return fail(500, 'Something went wrong while saving. Please try again.');
  }
}
