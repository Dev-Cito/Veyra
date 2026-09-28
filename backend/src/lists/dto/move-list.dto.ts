import { IsOptional, IsUUID } from 'class-validator';

/** Reorders a list within its board, by neighbours. No boardId: see ListsService.move. */
export class MoveListDto {
  @IsOptional()
  @IsUUID()
  previousListId?: string | null;

  @IsOptional()
  @IsUUID()
  nextListId?: string | null;
}
