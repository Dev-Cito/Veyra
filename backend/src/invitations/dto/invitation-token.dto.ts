import { IsString, Length, Matches } from 'class-validator';
import { asNotFound, NoNullBytes } from '../../common/validation.js';
import { INVITATION_TOKEN_LENGTH } from '../invitation-token.js';
import { INVITATION_NOT_FOUND } from '../invitations.service.js';

// A malformed token must be indistinguishable from an unknown one: every
// constraint answers the same 404 as a token that matches nothing.
const notFound = asNotFound(INVITATION_NOT_FOUND);

/** The invitation token travels in the body, never in a URL (see controller). */
export class InvitationTokenDto {
  @IsString(notFound)
  @Length(INVITATION_TOKEN_LENGTH, INVITATION_TOKEN_LENGTH, notFound)
  @Matches(/^[A-Za-z0-9_-]+$/, notFound)
  @NoNullBytes(notFound)
  token: string;
}
