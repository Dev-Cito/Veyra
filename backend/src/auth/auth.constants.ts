export const AUTH_COOKIE = 'access_token';
export const JWT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;
export const BCRYPT_ROUNDS = 12;

export interface JwtPayload {
  sub: string;
  email: string;
}
