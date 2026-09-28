import { QueryFailedError } from 'typeorm';

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';

function pgErrorCode(err: unknown): string | undefined {
  return err instanceof QueryFailedError
    ? (err.driverError as { code?: string }).code
    : undefined;
}

/** True if `err` is a Postgres unique violation, optionally on a given constraint. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  if (pgErrorCode(err) !== PG_UNIQUE_VIOLATION) {
    return false;
  }
  const driverError = (err as QueryFailedError).driverError as {
    constraint?: string;
  };
  return constraint === undefined || driverError.constraint === constraint;
}

/** True if `err` is a Postgres foreign key violation (referenced row gone). */
export function isForeignKeyViolation(err: unknown): boolean {
  return pgErrorCode(err) === PG_FOREIGN_KEY_VIOLATION;
}
