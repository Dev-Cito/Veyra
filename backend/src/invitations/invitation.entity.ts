import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';
import { Workspace } from '../workspaces/entities/workspace.entity.js';

/** OWNER is deliberately absent: ownership is never granted by invitation. */
export enum InvitationRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export const INVITATION_TOKEN_HASH_UNIQUE = 'UQ_invitations_token_hash';
export const INVITATION_PENDING_UNIQUE = 'UQ_invitations_pending';

/**
 * An invitation targets an email address, not a user: the invitee may not
 * have an account yet. Rows are never deleted on expiry, acceptance or
 * revocation; they stay as a trace.
 */
@Entity('invitations')
// At most one pending invitation per email and workspace. Partial, so a new
// invitation is allowed once the previous one was revoked or accepted.
@Index(INVITATION_PENDING_UNIQUE, ['workspaceId', 'email'], {
  unique: true,
  where: '"acceptedAt" IS NULL AND "revokedAt" IS NULL',
})
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_invitations_workspace')
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  /** Always trimmed and lowercased (see normalizeEmail). */
  @Index('IDX_invitations_email')
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({
    type: 'enum',
    enum: InvitationRole,
    enumName: 'invitation_role',
  })
  role: InvitationRole;

  /**
   * sha256(token) in hex. The raw token is never stored. Not selected by
   * default, so it cannot leak through a response by accident.
   */
  @Index(INVITATION_TOKEN_HASH_UNIQUE, { unique: true })
  @Column({ type: 'varchar', length: 64, select: false })
  tokenHash: string;

  // Immutable authorship; null once the inviter account is deleted.
  @Column({ type: 'uuid', nullable: true, update: false })
  invitedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'invitedById' })
  invitedBy: Relation<User> | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
