import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../common/email.js';
import { NoNullBytes } from '../../common/validation.js';
import { InvitationRole } from '../invitation.entity.js';

export class CreateInvitationDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  @MaxLength(255)
  @NoNullBytes()
  email: string;

  // OWNER is rejected here (400): promotion to OWNER goes through
  // PATCH /workspaces/:id/members/:memberId, reserved to existing OWNERs.
  @IsEnum(InvitationRole, {
    message:
      'role must be ADMIN or MEMBER: OWNER cannot be granted by invitation',
  })
  role: InvitationRole;
}
