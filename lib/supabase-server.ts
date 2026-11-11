import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

let serviceClient: SupabaseClient | null = null;

/** Service-role client. Server-only: bypasses RLS. Use for storage and database writes, never for verifying users. */
export function getServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase server environment variables (URL / SERVICE_ROLE_KEY) are not configured');
  }
  serviceClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return serviceClient;
}

/** Request-scoped client that reads the user's session from Next.js cookies (getAll/setAll API). */
export function createServerSupabaseClient() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase public environment variables are not configured');

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Route Handler/Server Component after streaming started; middleware refreshes cookies.
        }
      },
    },
  });
}

export type AuthFailure = 'no_credentials' | 'invalid_session' | 'misconfigured';
export type AuthResult = { user: User; failure?: undefined } | { user: null; failure: AuthFailure };

/**
 * Identify the caller. Order: `Authorization: Bearer <access token>`, then the session cookie.
 * The token is verified by Supabase Auth with the PUBLISHABLE key in a stateless client, so a
 * wrong service-role key can no longer masquerade as an expired session.
 */
export async function authenticateRequest(req: Request): Promise<AuthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error('[auth] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing on the server');
    return { user: null, failure: 'misconfigured' };
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  let sawCredentials = false;

  if (token) {
    sawCredentials = true;
    const verifier = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await verifier.auth.getUser(token);
    if (data?.user) return { user: data.user };
    console.error('[auth] bearer token rejected by Supabase', { status: error?.status, code: error?.code, message: error?.message });
  }

  try {
    const { data, error } = await createServerSupabaseClient().auth.getUser();
    if (data?.user) return { user: data.user };
    if (error && error.name !== 'AuthSessionMissingError') {
      sawCredentials = true;
      console.error('[auth] cookie session rejected by Supabase', { status: error.status, code: error.code, message: error.message });
    }
  } catch (err) {
    console.error('[auth] cookie session check failed', err);
  }

  return { user: null, failure: sawCredentials ? 'invalid_session' : 'no_credentials' };
}

export type AdminAuthResult = { user: User; failure?: undefined } | { user: null; failure: AuthFailure | 'forbidden' };

/** Like authenticateRequest, but the caller must also hold the admin role (read from Supabase, not from the client). */
export async function authenticateAdmin(req: Request): Promise<AdminAuthResult> {
  const auth = await authenticateRequest(req);
  if (!auth.user) return auth;
  if (auth.user.app_metadata?.role !== 'admin') return { user: null, failure: 'forbidden' };
  return { user: auth.user };
}
