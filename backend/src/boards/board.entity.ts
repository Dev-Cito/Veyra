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
import { List } from '../lists/list.entity.js';
import { User } from '../users/user.entity.js';
import { Workspace } from '../workspaces/entities/workspace.entity.js';

@Entity('boards')
export class Board {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_boards_workspace')
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // Server-computed ordering key among the workspace's boards.
  @Column({ type: 'double precision' })
  position: number;

  // Immutable authorship; null once the creator account is deleted.
  @Column({ type: 'uuid', nullable: true, update: false })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: Relation<User> | null;

  @OneToMany(() => List, (list) => list.board)
  lists: Relation<List[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
