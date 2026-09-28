import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import {
  IsOptionalNonNull,
  NoNullBytes,
  Trim,
} from '../../common/validation.js';

// workspaceId and position are deliberately absent: the global ValidationPipe
// (forbidNonWhitelisted) rejects them with 400.
export class UpdateBoardDto {
  @IsOptionalNonNull()
  @Trim()
  @IsString()
  @Length(1, 100)
  @NoNullBytes()
  name?: string;

  /** `null` clears the description. */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @NoNullBytes()
  description?: string | null;
}
