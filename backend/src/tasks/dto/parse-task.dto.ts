import { IsString, Length } from 'class-validator';
import { NoNullBytes, Trim } from '../../common/validation.js';

export const PARSE_TEXT_MAX_LENGTH = 500;

/** POST …/tasks/parse: one sentence describing a task. */
export class ParseTaskDto {
  @Trim()
  @IsString()
  @Length(1, PARSE_TEXT_MAX_LENGTH)
  @NoNullBytes()
  text: string;
}
