import { IsOptional, IsUUID } from 'class-validator';

/** Reorders a board within its workspace, by neighbours. */
export class MoveBoardDto {
  @IsOptional()
  @IsUUID()
  previousBoardId?: string | null;

  @IsOptional()
  @IsUUID()
  nextBoardId?: string | null;
}
