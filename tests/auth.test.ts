import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.fn();
const cookieGetUser = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: getUserMock } })),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: cookieGetUser } })),
}));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => undefined }) }));

import { authenticateRequest } from '@/lib/supabase-server';

const req = (headers: Record<string, string> = {}) => new Request('http://localhost/api/submit-loan', { method: 'POST', headers });

describe('authenticateRequest', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'sb_publishable_test');
    getUserMock.mockReset();
    cookieGetUser.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('accepts a valid bearer token', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const r = await authenticateRequest(req({ authorization: 'Bearer good' }));
    expect(r.user?.id).toBe('u1');
    expect(getUserMock).toHaveBeenCalledWith('good');
  });

  it('falls back to the cookie session when the token is rejected', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { status: 401, code: 'bad_jwt', message: 'bad' } });
    cookieGetUser.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null });
    const r = await authenticateRequest(req({ authorization: 'Bearer bad' }));
    expect(r.user?.id).toBe('u2');
  });

  it('reports invalid_session when credentials were sent but rejected', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { status: 401, message: 'bad' } });
    cookieGetUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError', message: 'none' } });
    const r = await authenticateRequest(req({ authorization: 'Bearer bad' }));
    expect(r).toEqual({ user: null, failure: 'invalid_session' });
  });

  it('reports no_credentials when nothing was sent', async () => {
    cookieGetUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError', message: 'none' } });
    const r = await authenticateRequest(req());
    expect(r).toEqual({ user: null, failure: 'no_credentials' });
  });

  it('reports misconfigured when public env vars are missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const r = await authenticateRequest(req({ authorization: 'Bearer x' }));
    expect(r).toEqual({ user: null, failure: 'misconfigured' });
  });
});
