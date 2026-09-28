import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import {
  IsOptionalNonNull,
  IsStorableDate,
  NoNullBytes,
  ToDate,
  Trim,
} from '../../common/validation.js';
import { TaskPriority } from '../task-priority.enum.js';

// listId (a move, phase 3), position and reminderSent are deliberately absent.
export class UpdateTaskDto {
  @IsOptionalNonNull()
  @Trim()
  @IsString()
  @Length(1, 200)
  @NoNullBytes()
  title?: string;

  /** `null` clears the description. */
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  @NoNullBytes()
  description?: string | null;

  /** Past dates are allowed here, to fix an overdue task. `null` clears it. */
  @IsOptional()
  @ToDate()
  @IsDate({ message: 'dueDate must be a valid ISO 8601 date' })
  @IsStorableDate()
  dueDate?: Date | null;

  @IsOptionalNonNull()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
}
