import { plainToInstance } from 'class-transformer';
import {
  IsDate,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
  type ValidationError,
} from 'class-validator';
import { zonedToInstant } from '../../common/timezone.js';
import { IsStorableDate, NoNullBytes } from '../../common/validation.js';
import { TaskPriority } from '../task-priority.enum.js';

export const TITLE_MAX_LENGTH = 200;
export const DEFAULT_DUE_HOUR = 17;

export type Confidence = 'high' | 'medium' | 'low';
const CONFIDENCES: readonly string[] = ['high', 'medium', 'low'];
const PRIORITIES: readonly string[] = Object.values(TaskPriority);

export interface TaskProposal {
  title: string;
  dueDate: Date | null;
  priority: TaskPriority;
  confidence: Confidence;
}

/**
 * What the model must send. JSON mode guarantees valid JSON, NOT this shape:
 * the model's output is untrusted input, validated like a request body.
 * Only what makes the answer unusable fails here (and triggers the retry);
 * fixable values are repaired by normalizeProposal.
 */
class ModelOutput {
  @IsString()
  @MinLength(1)
  @NoNullBytes()
  title!: string;

  @IsOptional()
  @IsString()
  @NoNullBytes()
  dueDate?: string | null;

  // Any value: an unknown priority falls back to MEDIUM, an unknown confidence to low.
  priority?: unknown;
  confidence?: unknown;
}

/** The exact rule of task creation: @IsStorableDate(), sliding window. */
class StorableDate {
  @IsDate()
  @IsStorableDate()
  value!: Date;
}

export type NormalizeResult =
  | { ok: true; proposal: TaskProposal; adjustments: string[] }
  | { ok: false; error: string };

/**
 * From the model's raw text to a proposal, or the reason it is unusable.
 * Repairs, logged as `adjustments`: priority outside the enum -> MEDIUM,
 * unknown confidence -> low, title cut to 200, a due date in the past or
 * outside the storable window -> null (creation would refuse a past date).
 */
export function normalizeProposal(
  content: string | null,
  context: { now: Date; timeZone: string },
): NormalizeResult {
  if (content === null || content.trim() === '') {
    return { ok: false, error: 'the reply was empty' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, error: 'the reply was not valid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'the reply was not a JSON object' };
  }

  const output = plainToInstance(ModelOutput, parsed);
  if (typeof output.title === 'string') {
    output.title = output.title.trim();
  }
  const errors = validateSync(output);
  if (errors.length > 0) {
    return { ok: false, error: describeErrors(errors) };
  }

  const adjustments: string[] = [];

  let title = output.title;
  if (title.length > TITLE_MAX_LENGTH) {
    title = title.slice(0, TITLE_MAX_LENGTH).trimEnd();
    adjustments.push('title truncated');
  }

  const rawPriority =
    typeof output.priority === 'string'
      ? output.priority.trim().toUpperCase()
      : '';
  const priority = PRIORITIES.includes(rawPriority)
    ? (rawPriority as TaskPriority)
    : TaskPriority.MEDIUM;
  if (priority !== rawPriority) {
    adjustments.push(
      `priority ${JSON.stringify(output.priority ?? null)} -> MEDIUM`,
    );
  }

  const rawConfidence =
    typeof output.confidence === 'string'
      ? output.confidence.trim().toLowerCase()
      : '';
  const confidence = (
    CONFIDENCES.includes(rawConfidence) ? rawConfidence : 'low'
  ) as Confidence;
  if (confidence !== rawConfidence) {
    adjustments.push(
      `confidence ${JSON.stringify(output.confidence ?? null)} -> low`,
    );
  }

  let dueDate: Date | null = null;
  if (typeof output.dueDate === 'string' && output.dueDate.trim() !== '') {
    const parsedDate = parseDueDate(output.dueDate.trim(), context.timeZone);
    if (!parsedDate) {
      return {
        ok: false,
        error: `dueDate "${output.dueDate}" is not YYYY-MM-DDTHH:mm`,
      };
    }
    const storable = plainToInstance(StorableDate, { value: parsedDate });
    if (validateSync(storable).length > 0) {
      adjustments.push('dueDate outside the storable window -> null');
    } else if (parsedDate.getTime() <= context.now.getTime()) {
      adjustments.push('dueDate in the past -> null');
    } else {
      dueDate = parsedDate;
    }
  }

  return {
    ok: true,
    proposal: { title, dueDate, priority, confidence },
    adjustments,
  };
}

const LOCAL =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/;
const WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * The formats models actually send: local "2026-10-16T17:00" (asked for),
 * a bare date "2026-10-16" (17:00 local), or an instant with an offset or Z.
 * Anything else ("16/10/2026", "next friday") is null: the caller retries.
 */
export function parseDueDate(value: string, timeZone: string): Date | null {
  if (WITH_OFFSET.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const match = LOCAL.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute] = match;
  return zonedToInstant(
    {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: hour === undefined ? DEFAULT_DUE_HOUR : Number(hour),
      minute: minute === undefined ? 0 : Number(minute),
    },
    timeZone,
  );
}

function describeErrors(errors: ValidationError[]): string {
  return errors
    .flatMap((error) => Object.values(error.constraints ?? {}))
    .join('; ');
}
