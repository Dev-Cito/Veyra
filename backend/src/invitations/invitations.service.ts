import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, MoreThan } from 'typeorm';
import { normalizeEmail } from '../common/email.js';
import { isUniqueViolation } from '../database/pg-errors.js';
import { MailService } from '../mail/mail.service.js';
import { User } from '../users/user.entity.js';
import { WorkspaceMember } from '../workspaces/entities/workspace-member.entity.js';
import { Workspace } from '../workspaces/entities/workspace.entity.js';
import {
  MembershipStatus,
  WorkspaceRole,
} from '../workspaces/workspace.enums.js';
import type { WorkspaceMembership } from '../workspaces/workspace-membership.js';
import type { WorkspaceWithRole } from '../workspaces/workspaces.service.js';
import type { CreateInvitationDto } from './dto/create-invitation.dto.js';
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiry,
} from './invitation-token.js';
import {
  Invitation,
  INVITATION_PENDING_UNIQUE,
  InvitationRole,
} from './invitation.entity.js';

// Declared on WorkspaceMember (phase 1): the safety net behind the row lock.
const MEMBERSHIP_UNIQUE = 'UQ_workspace_members_workspace_user';

// One message for every unusable token: never confirm that a token existed.
export const INVITATION_NOT_FOUND = 'Invitation not found';

/** What the API exposes of an invitation. Never tokenHash. */
export interface InvitationView {
  id: string;
  workspaceId: string;
  email: string;
  role: InvitationRole;
  invitedById: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The creation response: the only place the raw token ever appears. */
export type CreatedInvitation = InvitationView & {
  token: string;
  /** false when mail is disabled or the send failed; the invitation stands. */
  emailSent: boolean;
};

/** Public preview: exactly what anyone holding the token may learn. */
export interface InvitationPreview {
  workspaceName: string;
  role: InvitationRole;
  invitedByName: string | null;
  expiresAt: Date;
}

export interface RevokedInvitation {
  id: string;
  email: string;
  revokedAt: Date;
}

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger('Invitations');

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mail: MailService,
  ) {}

  async create(
    actor: WorkspaceMembership,
    dto: CreateInvitationDto,
  ): Promise<CreatedInvitation> {
    if (actor.role === WorkspaceRole.MEMBER) {
      throw new ForbiddenException('Only an OWNER or an ADMIN can invite');
    }
    if (
      dto.role === InvitationRole.ADMIN &&
      actor.role !== WorkspaceRole.OWNER
    ) {
      throw new ForbiddenException('Only an OWNER can invite an ADMIN');
    }
    const email = normalizeEmail(dto.email);
    const { token, tokenHash } = generateInvitationToken();

    let invitation: Invitation;
    try {
      invitation = await this.dataSource.transaction(async (manager) => {
        const alreadyMember = await manager.exists(WorkspaceMember, {
          where: {
            workspaceId: actor.workspaceId,
            status: MembershipStatus.ACTIVE,
            user: { email },
          },
        });
        if (alreadyMember) {
          throw new ConflictException(
            'This email already belongs to an active member of the workspace',
          );
        }

        // An expired invitation still counts as pending for the unique index
        // (which cannot depend on now()), and is hidden from the list, so
        // nobody could revoke it. Retire it so that it can be replaced.
        const now = new Date();
        await manager
          .createQueryBuilder()
          .update(Invitation)
          .set({ revokedAt: now })
          .where('"workspaceId" = :workspaceId', {
            workspaceId: actor.workspaceId,
          })
          .andWhere('email = :email', { email })
          .andWhere('"acceptedAt" IS NULL AND "revokedAt" IS NULL')
          .andWhere('"expiresAt" <= :now', { now })
          .execute();

        return manager.save(
          manager.create(Invitation, {
            workspaceId: actor.workspaceId,
            email,
            role: dto.role,
            tokenHash,
            invitedById: actor.userId,
            expiresAt: invitationExpiry(now),
          }),
        );
      });
    } catch (err) {
      if (isUniqueViolation(err, INVITATION_PENDING_UNIQUE)) {
        throw new ConflictException(
          'A pending invitation already exists for this email',
        );
      }
      throw err;
    }

    // After the COMMIT, never inside: a slow SMTP server must not hold the
    // transaction open. The invitation stands whatever happens to the email.
    const emailSent = await this.sendInvitationEmail(invitation, token);
    return { ...toView(invitation), token, emailSent };
  }

  /** true only if the email actually left. Never throws, never logs the token. */
  private async sendInvitationEmail(
    invitation: Invitation,
    token: string,
  ): Promise<boolean> {
    try {
      const workspace = await this.dataSource.manager.findOneByOrFail(
        Workspace,
        { id: invitation.workspaceId },
      );
      const inviter = invitation.invitedById
        ? await this.dataSource.manager.findOneBy(User, {
            id: invitation.invitedById,
          })
        : null;
      // The invitee may already have an account: then dates use their zone.
      const invitee = await this.dataSource.manager.findOne(User, {
        where: { email: invitation.email },
        select: { id: true, timezone: true },
      });
      const outcome = await this.mail.sendInvitation({
        to: invitation.email,
        workspaceName: workspace.name,
        inviterName: inviter?.name ?? null,
        role: invitation.role,
        token,
        expiresAt: invitation.expiresAt,
        timeZone: invitee?.timezone ?? null,
      });
      return outcome === 'sent';
    } catch (err) {
      // Only the invitation id: the error comes from the database, but the
      // token must never be one mistake away from a log line.
      this.logger.error(
        `Could not prepare the email of invitation ${invitation.id}: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      return false;
    }
  }

  /** Pending only: not accepted, not revoked, not expired. */
  async listPending(actor: WorkspaceMembership): Promise<InvitationView[]> {
    const invitations = await this.dataSource.manager.find(Invitation, {
      where: {
        workspaceId: actor.workspaceId,
        acceptedAt: IsNull(),
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'ASC' },
    });
    return invitations.map(toView);
  }

  /** Sets revokedAt; the row stays as a trace. */
  revoke(
    actor: WorkspaceMembership,
    invitationId: string,
  ): Promise<RevokedInvitation> {
    return this.dataSource.transaction(async (manager) => {
      const invitation = await manager.findOne(Invitation, {
        where: { id: invitationId, workspaceId: actor.workspaceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invitation) {
        throw new NotFoundException(INVITATION_NOT_FOUND);
      }
      if (invitation.acceptedAt) {
        throw new ConflictException(
          'This invitation was already accepted: remove the member instead',
        );
      }
      if (invitation.revokedAt) {
        throw new ConflictException('This invitation was already revoked');
      }
      const revokedAt = new Date();
      await manager.update(Invitation, { id: invitation.id }, { revokedAt });
      return { id: invitation.id, email: invitation.email, revokedAt };
    });
  }

  /** Public: no authentication, so it exposes nothing but the preview. */
  async preview(token: string): Promise<InvitationPreview> {
    const invitation = await this.dataSource.manager.findOne(Invitation, {
      where: { tokenHash: hashInvitationToken(token) },
      relations: { workspace: true, invitedBy: true },
    });
    if (!invitation || !isUsable(invitation)) {
      throw new NotFoundException(INVITATION_NOT_FOUND);
    }
    return {
      workspaceName: invitation.workspace.name,
      role: invitation.role,
      invitedByName: invitation.invitedBy?.name ?? null,
      expiresAt: invitation.expiresAt,
    };
  }

  /**
   * Joins the workspace. One transaction, with the invitation row locked FOR
   * UPDATE and re-checked under the lock: of two concurrent acceptances, the
   * second waits, then sees acceptedAt set and gets a 404. The unique
   * (workspaceId, userId) constraint is only a safety net (409).
   */
  async accept(user: User, token: string): Promise<WorkspaceWithRole> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const invitation = await manager.findOne(Invitation, {
          where: { tokenHash: hashInvitationToken(token) },
          lock: { mode: 'pessimistic_write' },
        });
        if (!invitation || !isUsable(invitation)) {
          throw new NotFoundException(INVITATION_NOT_FOUND);
        }
        // The token proves the message was received, not who received it:
        // without this, an intercepted token would let any account join.
        if (normalizeEmail(user.email) !== invitation.email) {
          throw new ForbiddenException(
            'This invitation was sent to another email address: sign in with that account to accept it',
          );
        }

        const role = await this.joinWorkspace(manager, invitation, user.id);
        await manager.update(
          Invitation,
          { id: invitation.id },
          { acceptedAt: new Date() },
        );
        const workspace = await manager.findOneByOrFail(Workspace, {
          id: invitation.workspaceId,
        });
        return Object.assign(workspace, { role });
      });
    } catch (err) {
      if (isUniqueViolation(err, MEMBERSHIP_UNIQUE)) {
        throw new ConflictException(
          'You were added to this workspace concurrently; reload',
        );
      }
      throw err;
    }
  }

  /**
   * Creates the ACTIVE membership, or reuses the existing one: an invitation
   * never downgrades a member in place, nor creates a duplicate.
   */
  private async joinWorkspace(
    manager: DataSource['manager'],
    invitation: Invitation,
    userId: string,
  ): Promise<WorkspaceRole> {
    const invited = WorkspaceRole[invitation.role];
    const existing = await manager.findOneBy(WorkspaceMember, {
      workspaceId: invitation.workspaceId,
      userId,
    });

    if (existing?.status === MembershipStatus.ACTIVE) {
      return existing.role;
    }
    if (existing) {
      // A legacy PENDING membership (phase 1): activate it, keeping the
      // higher of its role and the invited one.
      const role = higherRole(existing.role, invited);
      await manager.update(
        WorkspaceMember,
        { id: existing.id },
        { status: MembershipStatus.ACTIVE, role, joinedAt: new Date() },
      );
      return role;
    }
    await manager.insert(WorkspaceMember, {
      workspaceId: invitation.workspaceId,
      userId,
      role: invited,
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date(),
    });
    return invited;
  }
}

function isUsable(invitation: Invitation, now = new Date()): boolean {
  return (
    invitation.acceptedAt === null &&
    invitation.revokedAt === null &&
    invitation.expiresAt > now
  );
}

const ROLE_RANK: Record<WorkspaceRole, number> = {
  [WorkspaceRole.MEMBER]: 1,
  [WorkspaceRole.ADMIN]: 2,
  [WorkspaceRole.OWNER]: 3,
};

function higherRole(a: WorkspaceRole, b: WorkspaceRole): WorkspaceRole {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

/** Explicit allow-list, so tokenHash can never reach a response. */
function toView(invitation: Invitation): InvitationView {
  return {
    id: invitation.id,
    workspaceId: invitation.workspaceId,
    email: invitation.email,
    role: invitation.role,
    invitedById: invitation.invitedById,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    revokedAt: invitation.revokedAt,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  };
}
