import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // Never returned by default; load explicitly with `select` when needed.
  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash: string;

  /** IANA id (e.g. 'Africa/Kigali'), for dates in emails; null: DEFAULT_TIMEZONE. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
