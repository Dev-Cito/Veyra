import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { NoNullBytes, Trim } from '../../common/validation.js';

export class CreateBoardDto {
  @Trim()
  @IsString()
  @Length(1, 100)
  @NoNullBytes()
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @NoNullBytes()
  description?: string | null;
}
