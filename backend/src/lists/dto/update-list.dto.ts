import { IsString, Length } from 'class-validator';
import {
  IsOptionalNonNull,
  NoNullBytes,
  Trim,
} from '../../common/validation.js';

// boardId and position are deliberately absent: moving a list is phase 3.
export class UpdateListDto {
  @IsOptionalNonNull()
  @Trim()
  @IsString()
  @Length(1, 100)
  @NoNullBytes()
  name?: string;
}
