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
import { List } from '../../lists/list.entity.js';
import { User } from '../../users/user.entity.js';
import { TaskPriority } from '../task-priority.enum.js';
import { TaskAssignee } from './task-assignee.entity.js';

@Entity('tasks')
// Serves the due-date reminder cron (phase 5).
@Index('IDX_tasks_due_reminder', ['dueDate', 'reminderSent'])
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_tasks_list')
  @Column({ type: 'uuid' })
  listId: string;

  @ManyToOne(() => List, (list) => list.tasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listId' })
  list: Relation<List>;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // Server-computed ordering key among the list's tasks.
  @Column({ type: 'double precision' })
  position: number;

  @Column({ type: 'timestamptz', nullable: true })
  dueDate: Date | null;

  @Column({
    type: 'enum',
    enum: TaskPriority,
    enumName: 'task_priority',
    default: TaskPriority.MEDIUM,
  })
  priority: TaskPriority;

  // Internal flag for the reminder cron; never accepted from clients.
  @Column({ type: 'boolean', default: false })
  reminderSent: boolean;

  // Immutable authorship; null once the creator account is deleted.
  @Column({ type: 'uuid', nullable: true, update: false })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: Relation<User> | null;

  @OneToMany(() => TaskAssignee, (assignee) => assignee.task)
  assignees: Relation<TaskAssignee[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
