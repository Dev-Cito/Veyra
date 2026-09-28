import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinDate,
} from 'class-validator';
import {
  IsOptionalNonNull,
  IsStorableDate,
  NoNullBytes,
  ToDate,
  Trim,
} from '../../common/validation.js';
import { TaskPriority } from '../task-priority.enum.js';

export class CreateTaskDto {
  @Trim()
  @IsString()
  @Length(1, 200)
  @NoNullBytes()
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  @NoNullBytes()
  description?: string | null;

  /** ISO 8601. A new task cannot be created already overdue. */
  @IsOptional()
  @ToDate()
  @IsDate({ message: 'dueDate must be a valid ISO 8601 date' })
  @MinDate(() => new Date(), { message: 'dueDate must not be in the past' })
  @IsStorableDate()
  dueDate?: Date | null;

  // Omit it for the MEDIUM default; null is not a priority.
  @IsOptionalNonNull()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
}
