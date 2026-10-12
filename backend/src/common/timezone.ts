import { ValidateBy, type ValidationOptions } from 'class-validator';

/** Used when neither the recipient nor DEFAULT_TIMEZONE gives a valid zone. */
export const FALLBACK_TIMEZONE = 'Africa/Kigali';

/** The longest IANA ids are about 30 characters; anything longer is not one. */
export const TIMEZONE_MAX_LENGTH = 64;

/**
 * Node's list leaves out 'UTC' and the newer spellings browsers send
 * ('Asia/Kolkata', 'Europe/Kyiv'): it lists their older canonical form
 * instead. So a value is accepted if it is in the list, or if ICU resolves it
 * to an id in the list. Resolving is the validation itself: the constructor
 * throws on anything that is not a time zone, and nothing is formatted.
 */
const SUPPORTED = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);

export function isTimeZone(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > TIMEZONE_MAX_LENGTH
  ) {
    return false;
  }
  if (SUPPORTED.has(value)) {
    return true;
  }
  try {
    const resolved = new Intl.DateTimeFormat('en-US', {
      timeZone: value,
    }).resolvedOptions().timeZone;
    return SUPPORTED.has(resolved);
  } catch {
    return false;
  }
}

/** An IANA time zone id, e.g. 'Africa/Kigali'. */
export const IsTimeZone = (options?: ValidationOptions) =>
  ValidateBy(
    {
      name: 'isTimeZone',
      validator: {
        validate: (value) => isTimeZone(value),
        defaultMessage: () => '$property must be a valid IANA time zone',
      },
    },
    options,
  );

/** recipient / user zone if valid, else the configured default, else the fallback. */
export function resolveTimeZone(
  preferred: string | null | undefined,
  configuredDefault: string | undefined,
): string {
  if (isTimeZone(preferred)) {
    return preferred;
  }
  return isTimeZone(configuredDefault) ? configuredDefault : FALLBACK_TIMEZONE;
}

/** A wall-clock time in some zone. month is 1-based. */
export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const partsFormats = new Map<string, Intl.DateTimeFormat>();

/** What a clock in `timeZone` shows at `instant` (to the minute), plus the weekday. */
export function localParts(
  instant: Date,
  timeZone: string,
): LocalDateTime & { weekday: string } {
  let format = partsFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    partsFormats.set(timeZone, format);
  }
  const parts = format.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: get('weekday'),
  };
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (Kigali: +120). */
export function utcOffsetMinutes(instant: Date, timeZone: string): number {
  const local = localParts(instant, timeZone);
  const asUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
  const truncated = Math.floor(instant.getTime() / 60_000) * 60_000;
  return Math.round((asUtc - truncated) / 60_000);
}

/**
 * The instant at which a clock in `timeZone` shows `local`. Across a DST
 * change, the offset is re-read once at the candidate instant. null for an
 * impossible calendar date (2026-02-30).
 */
export function zonedToInstant(
  local: LocalDateTime,
  timeZone: string,
): Date | null {
  const naive = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
  const check = new Date(naive);
  if (
    check.getUTCFullYear() !== local.year ||
    check.getUTCMonth() !== local.month - 1 ||
    check.getUTCDate() !== local.day ||
    local.hour > 23 ||
    local.minute > 59
  ) {
    return null;
  }
  let instant = naive - utcOffsetMinutes(new Date(naive), timeZone) * 60_000;
  const settled = utcOffsetMinutes(new Date(instant), timeZone);
  instant = naive - settled * 60_000;
  return new Date(instant);
}

/** "+02:00", "-05:30". */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
