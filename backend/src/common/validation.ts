import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { MaxDate, MinDate, ValidateBy, ValidateIf } from 'class-validator';

/** Trims string input; leaves other types for the validators to reject. */
export const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/**
 * Like @IsOptional(), but only for `undefined`: an explicit `null` is still
 * validated (and rejected). For optional fields backed by NOT NULL columns.
 * Keep @IsOptional() for fields where null is meaningful (nullable columns).
 */
export const IsOptionalNonNull = () =>
  ValidateIf((_object, value) => value !== undefined);

/**
 * Rejects U+0000. Postgres text columns cannot store it and fail the whole
 * query ("invalid byte sequence"), and bcrypt silently truncates a password
 * at the first NUL. Put it on every string that reaches the database or bcrypt.
 */
export const NoNullBytes = () =>
  ValidateBy({
    name: 'noNullBytes',
    validator: {
      validate: (value) => typeof value !== 'string' || !value.includes('\0'),
      defaultMessage: () => '$property must not contain NUL bytes',
    },
  });

/** Parses ISO strings into Dates so @IsDate / @MinDate can check them. */
export const ToDate = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? new Date(value) : value,
  );

const DUE_DATE_PAST_YEARS = 10;
const DUE_DATE_FUTURE_YEARS = 100;

function yearsFromNow(years: number): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() + years);
  return date;
}

/**
 * Sliding window, evaluated at validation time: from 10 years ago (fixing an
 * overdue task stays possible) to 100 years ahead (beyond that, it is a typo
 * or a badly converted timestamp). This also keeps every accepted value well
 * inside Postgres' timestamptz range, which a JS Date can exceed.
 * Use after @IsDate().
 */
export const IsStorableDate = () =>
  applyDecorators(
    MinDate(() => yearsFromNow(-DUE_DATE_PAST_YEARS), {
      message: `$property must not be more than ${DUE_DATE_PAST_YEARS} years in the past`,
    }),
    MaxDate(() => yearsFromNow(DUE_DATE_FUTURE_YEARS), {
      message: `$property must not be more than ${DUE_DATE_FUTURE_YEARS} years in the future`,
    }),
  );
