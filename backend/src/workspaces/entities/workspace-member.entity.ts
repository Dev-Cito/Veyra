import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from 'typeorm';
import { User } from '../../users/user.entity.js';
import { MembershipStatus, WorkspaceRole } from '../workspace.enums.js';
import { Workspace } from './workspace.entity.js';

@Entity('workspace_members')
@Unique('UQ_workspace_members_workspace_user', ['workspaceId', 'userId'])
export class WorkspaceMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Covered by the unique (workspaceId, userId) index.
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.members, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  // Separate index for "list my workspaces", which filters on userId alone.
  @Index('IDX_workspace_members_user')
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @Column({
    type: 'enum',
    enum: WorkspaceRole,
    enumName: 'workspace_role',
    default: WorkspaceRole.MEMBER,
  })
  role: WorkspaceRole;

  @Column({
    type: 'enum',
    enum: MembershipStatus,
    enumName: 'membership_status',
    default: MembershipStatus.PENDING,
  })
  status: MembershipStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  invitedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  joinedAt: Date | null;
}
