import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Browser-side Supabase client. Uses @supabase/ssr so the session is stored in cookies,
 * which lets the API routes and middleware see the signed-in user.
 */
export function createClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase public environment variables are not configured');
  client = createBrowserClient(url, key);
  return client;
}

/** Alias for compatibility with existing admin references. */
export const getBrowserClient = createClient;
