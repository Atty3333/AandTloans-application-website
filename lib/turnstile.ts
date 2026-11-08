let warned = false;

/** Verify a Cloudflare Turnstile token. If TURNSTILE_SECRET_KEY is unset the check is skipped (dev only). */
export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (!warned) {
      console.warn('[turnstile] TURNSTILE_SECRET_KEY not set — CAPTCHA verification is disabled');
      warned = true;
    }
    return true;
  }
  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== 'unknown') body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch (err) {
    console.error('[turnstile] verification request failed', err);
    return false;
  }
}
