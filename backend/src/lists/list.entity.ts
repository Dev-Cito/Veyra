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
import { Board } from '../boards/board.entity.js';
import { Task } from '../tasks/entities/task.entity.js';

@Entity('lists')
export class List {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_lists_board')
  @Column({ type: 'uuid' })
  boardId: string;

  @ManyToOne(() => Board, (board) => board.lists, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'boardId' })
  board: Relation<Board>;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // Server-computed ordering key among the board's lists.
  @Column({ type: 'double precision' })
  position: number;

  @OneToMany(() => Task, (task) => task.list)
  tasks: Relation<Task[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
