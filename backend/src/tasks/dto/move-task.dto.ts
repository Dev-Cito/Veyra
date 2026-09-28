import { IsOptional, IsUUID } from 'class-validator';

/**
 * Where the task was dropped, described by its neighbours in the target list
 * (never by a position). Both null: the target list is empty.
 */
export class MoveTaskDto {
  @IsUUID()
  targetListId: string;

  /** null or absent: dropped at the head of the list. */
  @IsOptional()
  @IsUUID()
  previousTaskId?: string | null;

  /** null or absent: dropped at the tail of the list. */
  @IsOptional()
  @IsUUID()
  nextTaskId?: string | null;
}
