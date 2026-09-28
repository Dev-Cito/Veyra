import type {
  EntityManager,
  EntityTarget,
  FindOptionsWhere,
  ObjectLiteral,
} from 'typeorm';

export const POSITION_STEP = 1000;

/**
 * Position for a new item appended at the end of its siblings:
 * max(position) + 1000, or 1000 when there are none.
 *
 * Call inside a transaction that has locked the parent row, so two concurrent
 * creations cannot read the same max.
 */
export async function nextPosition<
  T extends ObjectLiteral & { position: number },
>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  siblings: FindOptionsWhere<T>,
): Promise<number> {
  // TypeORM cannot narrow its numeric-keys type on a generic T; the
  // `{ position: number }` constraint above guarantees the column exists.
  const max = await manager.maximum(entity, 'position' as never, siblings);
  return max === null ? POSITION_STEP : max + POSITION_STEP;
}

/** SELECT ... FOR UPDATE on one row; false if it no longer exists. */
export async function lockRow<T extends ObjectLiteral & { id: string }>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  id: string,
): Promise<boolean> {
  const row = await manager.findOne(entity, {
    where: { id } as FindOptionsWhere<T>,
    select: { id: true } as never,
    lock: { mode: 'pessimistic_write' },
  });
  return row !== null;
}
