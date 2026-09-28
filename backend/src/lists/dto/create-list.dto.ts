import { IsString, Length } from 'class-validator';
import { NoNullBytes, Trim } from '../../common/validation.js';

export class CreateListDto {
  @Trim()
  @IsString()
  @Length(1, 100)
  @NoNullBytes()
  name: string;
}
