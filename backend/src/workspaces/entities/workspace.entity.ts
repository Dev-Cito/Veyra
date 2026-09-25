import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity.js';
import { WorkspaceMember } from './workspace-member.entity.js';

export const WORKSPACE_SLUG_UNIQUE = 'UQ_workspaces_slug';

@Entity('workspaces')
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // Named so WorkspacesService can recognise a slug collision and retry.
  @Index(WORKSPACE_SLUG_UNIQUE, { unique: true })
  @Column({ type: 'varchar', length: 120 })
  slug: string;

  // Who created the workspace: an immutable historical fact, never a
  // permission. Roles live exclusively in WorkspaceMember.
  // `update: false` forbids reassigning it (no ownership transfer through this
  // field). The database may still clear it: null means "created by an account
  // that has since been deleted".
  @Column({ type: 'uuid', nullable: true, update: false })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: Relation<User> | null;

  @OneToMany(() => WorkspaceMember, (member) => member.workspace)
  members: Relation<WorkspaceMember[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
