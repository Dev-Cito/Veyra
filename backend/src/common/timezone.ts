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
    const resolved = new Intl.DateTimeFormat('en-US', { timeZone: value })
      .resolvedOptions().timeZone;
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
