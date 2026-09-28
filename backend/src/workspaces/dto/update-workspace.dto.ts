import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { IsOptionalNonNull, NoNullBytes } from '../../common/validation.js';

export class UpdateWorkspaceDto {
  @IsOptionalNonNull()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  @NoNullBytes()
  name?: string;
}
