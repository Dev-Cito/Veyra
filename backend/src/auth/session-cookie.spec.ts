import {
  describeSessionCookie,
  sessionCookieOptions,
} from './session-cookie.js';

describe('sessionCookieOptions', () => {
  it('https front: Secure + SameSite=None, whatever NODE_ENV says', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      expect(sessionCookieOptions('https://veyra.vercel.app')).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
      });
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('http front (local): Lax and not Secure, which plain http requires', () => {
    expect(sessionCookieOptions('http://localhost:3000')).toMatchObject({
      secure: false,
      sameSite: 'lax',
    });
  });

  it('missing or malformed FRONTEND_URL falls back to the local policy', () => {
    for (const url of [undefined, '', 'not a url']) {
      expect(sessionCookieOptions(url)).toMatchObject({
        secure: false,
        sameSite: 'lax',
      });
    }
  });

  it('describes the policy in one log line', () => {
    expect(describeSessionCookie('https://app.example.com')).toBe(
      'Session cookie: HttpOnly; SameSite=none; Secure (FRONTEND_URL https://app.example.com)',
    );
  });
});
