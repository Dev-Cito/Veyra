import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { NoNullBytes } from '../../common/validation.js';

export class RegisterDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  @NoNullBytes()
  email: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  @NoNullBytes()
  name: string;

  // bcrypt ignores anything past 72 bytes.
  @IsString()
  @Length(8, 72)
  @NoNullBytes()
  password: string;
}
