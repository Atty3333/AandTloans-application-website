import { NextResponse } from 'next/server';
import { authenticateRequest, type AuthResult } from './supabase-server';

/** Shared by the API routes. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error, ...extra }, { status });

/** The response for a failed authentication, or null when the caller is signed in. */
export function authFailureResponse(auth: AuthResult): NextResponse | null {
  if (auth.user) return null;
  if (auth.failure === 'misconfigured') return fail(500, 'The server is not configured correctly. Please contact support.');
  return fail(401, 'Your session has expired. Please sign out and sign in again.');
}

export { authenticateRequest };
