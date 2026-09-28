import {
  CreateDateColumn,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
} from 'typeorm';
import { User } from '../../users/user.entity.js';
import { Task } from './task.entity.js';

export const TASK_ASSIGNEE_UNIQUE = 'UQ_task_assignees_task_user';

@Entity('task_assignees')
@Unique(TASK_ASSIGNEE_UNIQUE, ['taskId', 'userId'])
export class TaskAssignee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Covered by the unique (taskId, userId) index.
  @Column({ type: 'uuid' })
  taskId: string;

  @ManyToOne(() => Task, (task) => task.assignees, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: Relation<Task>;

  // Separate index for "tasks assigned to me" and user-deletion cascades.
  @Index('IDX_task_assignees_user')
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Relation<User>;

  @CreateDateColumn({ type: 'timestamptz' })
  assignedAt: Date;
}
