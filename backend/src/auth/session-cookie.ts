import type { CookieOptions } from 'express';

/**
 * Session cookie attributes, derived from the SCHEME of FRONTEND_URL rather
 * than from NODE_ENV: a value that cannot be forgotten, since CORS already
 * depends on it.
 *
 *   https front -> Secure + SameSite=None: the front and the API live on
 *                  different sites (Vercel / Render), so the cookie must be
 *                  sent cross-site, which browsers only allow when Secure.
 *   http front  -> SameSite=Lax, not Secure: local development, where a
 *                  Secure cookie would be rejected over plain http.
 */
export function sessionCookieOptions(
  frontendUrl: string | undefined = process.env.FRONTEND_URL,
): CookieOptions {
  const crossSite = isHttps(frontendUrl);
  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? 'none' : 'lax',
    path: '/',
  };
}

/** One line for the startup logs (e.g. on Render), to see the policy in effect. */
export function describeSessionCookie(
  frontendUrl: string | undefined = process.env.FRONTEND_URL,
): string {
  const { secure, sameSite } = sessionCookieOptions(frontendUrl);
  return `Session cookie: HttpOnly; SameSite=${sameSite}; ${secure ? 'Secure' : 'not Secure'} (FRONTEND_URL ${frontendUrl ?? 'unset'})`;
}

function isHttps(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
