import { createHash, randomBytes } from 'node:crypto';

export const INVITATION_TTL_DAYS = 7;
const TOKEN_BYTES = 32;
/** base64url of 32 bytes, unpadded. */
export const INVITATION_TOKEN_LENGTH = Math.ceil((TOKEN_BYTES * 4) / 3);

/**
 * A fresh invitation token: 32 random bytes, base64url (43 characters).
 * Returned to the inviter exactly once; only its hash is stored.
 */
export function generateInvitationToken(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashInvitationToken(token) };
}

/**
 * sha256, hex. A fast hash is right here: the token already carries 256 bits
 * of randomness, so there is no dictionary to slow down (unlike passwords).
 * Lookups hash the received token and query tokenHash; the raw token is never
 * compared in clear.
 */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function invitationExpiry(from = new Date()): Date {
  return new Date(from.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}
