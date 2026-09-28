import { BadRequestException } from '@nestjs/common';
import type { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';

/** Response of every move endpoint: the item, plus whether its siblings were renumbered. */
export type Moved<T> = T & {
  /** When true, sibling positions changed too: the client should reload them. */
  reindexed: boolean;
};

export function moved<T extends object>(item: T, reindexed: boolean): Moved<T> {
  return Object.assign(item, { reindexed });
}

/**
 * Builds MoveRequest.rejectOutsider for a neighbour missing from its sibling
 * group. `load` resolves it within the caller's workspace and throws 404
 * outside it, so an id from another workspace is never confirmed to exist;
 * otherwise it exists in the workspace but in another group: 400.
 * Runs only on the error path, never on a successful move.
 */
export function rejectOutsider(
  load: (id: string) => Promise<unknown>,
  groupLabel: string,
): (neighbour: { field: string; id: string }) => Promise<never> {
  return async ({ field, id }) => {
    await load(id);
    throw new BadRequestException(`${field} must belong to ${groupLabel}`);
  };
}

/**
 * The single UPDATE of a move, with RETURNING: the response carries the row as
 * written (updatedAt included) without an extra read.
 */
export async function saveMove<T extends ObjectLiteral>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  id: string,
  values: QueryDeepPartialEntity<T>,
): Promise<T> {
  const result = await manager
    .createQueryBuilder()
    .update(entity)
    .set(values)
    .where('id = :id', { id })
    .returning('*')
    .execute();
  // Column names equal property names on these entities.
  return manager.create(entity, (result.raw as T[])[0]);
}
