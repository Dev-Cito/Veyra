import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { NoNullBytes } from '../../common/validation.js';

export class LoginDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  @NoNullBytes()
  email: string;

  @IsString()
  @MaxLength(72)
  @NoNullBytes()
  password: string;
}
