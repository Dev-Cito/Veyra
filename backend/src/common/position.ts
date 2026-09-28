import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import type {
  EntityManager,
  EntityTarget,
  FindOptionsWhere,
  ObjectLiteral,
} from 'typeorm';

/** Gap between consecutive items, on creation and after a reindex. */
export const SPACING = 1000;

/**
 * Reindex before two neighbours get closer than this. Doubles have ~15
 * significant digits, so at positions in the millions this still leaves
 * plenty of headroom before midpoints stop being representable.
 */
export const MIN_GAP = 0.000001;

const logger = new Logger('Positions');

type Positioned = ObjectLiteral & { id: string; position: number };

/**
 * The siblings an item is ordered among: tasks of a list, lists of a board,
 * boards of a workspace. `parentColumn` is the entity property holding the
 * parent id.
 */
export interface SiblingGroup<T extends Positioned> {
  entity: EntityTarget<T>;
  parentColumn: keyof T & string;
  parentId: string;
}

/**
 * Position for a new item appended at the end of its siblings:
 * max(position) + SPACING, or SPACING when there are none.
 *
 * Call inside a transaction that has locked the parent row, so two concurrent
 * creations cannot read the same max.
 */
export async function nextPosition<T extends Positioned>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  siblings: FindOptionsWhere<T>,
): Promise<number> {
  // TypeORM cannot narrow its numeric-keys type on a generic T; the
  // `{ position: number }` constraint above guarantees the column exists.
  const max = await manager.maximum(entity, 'position' as never, siblings);
  return max === null ? SPACING : max + SPACING;
}

/**
 * SELECT ... WHERE id IN (...) ORDER BY id FOR UPDATE, in a single statement.
 * Returns how many of the rows still exist.
 *
 * Why the ORDER BY: a task moving from list A to list B must lock both lists.
 * If one transaction locked A then B while another, moving B -> A, locked B
 * then A, each would hold one lock and wait for the other: a deadlock, which
 * Postgres resolves by aborting one of them. Acquiring locks in one global
 * order (ascending UUID), whatever the direction of the move, makes that
 * cycle impossible. Postgres locks the rows as the sorted result is produced,
 * so the order holds within this one query.
 */
export async function lockRowsInOrder<T extends Positioned | ObjectLiteral>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  ids: string[],
): Promise<number> {
  const unique = [...new Set(ids)];
  const rows = await manager
    .createQueryBuilder(entity, 'row')
    .select('row.id')
    .where('row.id IN (:...ids)', { ids: unique })
    .orderBy('row.id', 'ASC')
    .setLock('pessimistic_write')
    .getMany();
  return rows.length;
}

/** SELECT ... FOR UPDATE on one row; false if it no longer exists. */
export async function lockRow<T extends ObjectLiteral>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  id: string,
): Promise<boolean> {
  return (await lockRowsInOrder(manager, entity, [id])) === 1;
}

export interface MovePlan {
  position: number;
  /** The item already sits where it was asked to go: nothing to write. */
  noop: boolean;
  /** The sibling group was renumbered to make room. */
  reindexed: boolean;
}

/** A neighbour named in a move request: its body field and its id. */
export interface Neighbour {
  field: string;
  id: string | null;
}

export interface MoveRequest {
  previous: Neighbour;
  next: Neighbour;
  /**
   * Called only on the error path, for a neighbour that is not in the group:
   * must throw (404 if it is outside the caller's workspace, 400 otherwise).
   */
  rejectOutsider: (neighbour: { field: string; id: string }) => Promise<never>;
}

interface Bounds {
  lower: number;
  upper: number;
}

/**
 * Computes where an item goes when dropped between two neighbours, given by
 * id (never by position: the server reads the real positions itself).
 *
 * The neighbours are anchors, not an exact interval: the interval is
 * tightened to the actual adjacent gap next to the anchor, as it is in the
 * database right now. With `previous` given, the item lands right after it;
 * with only `next`, right before it. So two concurrent drops "between A and
 * B", serialised by the parent lock, still get distinct positions: the second
 * one sees the first and lands between A and it. A stale client cannot write
 * an out-of-order position either.
 *
 * Precondition: inside a transaction holding the parent row lock. The
 * neighbours are validated here, by the same locked read that fetches their
 * positions: one filtered on the group, so a neighbour missing from the
 * result does not belong to it (see MoveRequest.rejectOutsider).
 */
export async function planMove<T extends Positioned>(
  manager: EntityManager,
  group: SiblingGroup<T>,
  moved: { id: string; position: number; inGroup: boolean },
  request: MoveRequest,
): Promise<MovePlan> {
  for (const { field, id } of [request.previous, request.next]) {
    if (id === moved.id) {
      throw new BadRequestException(`${field} cannot be the moved item itself`);
    }
  }

  let bounds = await readBounds(manager, group, moved.id, request);
  if (bounds === null) {
    // Empty group: nothing to be relative to.
    return { position: SPACING, noop: moved.inGroup, reindexed: false };
  }

  if (
    moved.inGroup &&
    bounds.lower < moved.position &&
    moved.position < bounds.upper
  ) {
    return { position: moved.position, noop: true, reindexed: false };
  }

  let position = midpoint(bounds);
  let reindexed = false;
  if (isExhausted(bounds, position)) {
    await reindexSiblings(manager, group);
    reindexed = true;
    // Positions changed: re-read the neighbours before computing again.
    bounds = (await readBounds(manager, group, moved.id, request))!;
    position = midpoint(bounds);
  }
  return { position, noop: false, reindexed };
}

function midpoint({ lower, upper }: Bounds): number {
  return (lower + upper) / 2;
}

/**
 * `mid <= lower || mid >= upper` catches floating point exhaustion exactly
 * (the midpoint rounds onto a bound); MIN_GAP reindexes before getting there.
 */
function isExhausted({ lower, upper }: Bounds, mid: number): boolean {
  return mid <= lower || mid >= upper || upper - lower < MIN_GAP;
}

/** null when the group has no item other than the moved one. */
async function readBounds<T extends Positioned>(
  manager: EntityManager,
  group: SiblingGroup<T>,
  movedId: string,
  request: MoveRequest,
): Promise<Bounds | null> {
  const previousId = request.previous.id;
  const nextId = request.next.id;
  const { table, parent } = columnsOf(manager, group);
  const others = `${parent} = $1 AND id <> $2`;
  const params = [group.parentId, movedId];

  if (previousId === null && nextId === null) {
    const [{ count }] = await manager.query<{ count: string }[]>(
      `SELECT count(*) AS count FROM ${table} WHERE ${others}`,
      params,
    );
    if (Number(count) > 0) {
      throw new ConflictException(
        'The target is not empty: provide previous and/or next neighbours',
      );
    }
    return null;
  }

  const neighbours = await manager.query<{ id: string; position: number }[]>(
    `SELECT id, position FROM ${table} WHERE ${others} AND id = ANY($3)`,
    [...params, [previousId, nextId].filter((id) => id !== null)],
  );
  const positionOf = (id: string | null) =>
    id === null
      ? null
      : (neighbours.find((n) => n.id === id)?.position ?? null);
  // Validation doubles as the read: a neighbour missing from this result is
  // not in the group. Only then, find out why (in the caller's scope).
  for (const { field, id } of [request.previous, request.next]) {
    if (id !== null && positionOf(id) === null) {
      await request.rejectOutsider({ field, id });
    }
  }
  const previous = positionOf(previousId);
  const next = positionOf(nextId);
  if (previous !== null && next !== null && previous >= next) {
    throw new BadRequestException(
      'The previous neighbour must be positioned before the next one',
    );
  }

  if (previous !== null) {
    // Right after `previous`: up to its actual successor, capped by `next`.
    const [{ successor }] = await manager.query<{ successor: number | null }[]>(
      `SELECT min(position) AS successor FROM ${table} WHERE ${others} AND position > $3`,
      [...params, previous],
    );
    const upper = Math.min(
      next ?? Number.POSITIVE_INFINITY,
      successor ?? previous + SPACING,
    );
    return { lower: previous, upper };
  }

  // Only `next`: right before it, down to its actual predecessor.
  const [{ predecessor }] = await manager.query<
    { predecessor: number | null }[]
  >(
    `SELECT max(position) AS predecessor FROM ${table} WHERE ${others} AND position < $3`,
    [...params, next],
  );
  return { lower: predecessor ?? next! - SPACING, upper: next! };
}

/**
 * Renumbers a sibling group to SPACING, 2 * SPACING, ... in ONE statement,
 * whatever its size. The existing order is preserved exactly; createdAt then
 * id break ties between equal positions, so the result is deterministic.
 */
export async function reindexSiblings<T extends Positioned>(
  manager: EntityManager,
  group: SiblingGroup<T>,
): Promise<number> {
  const { table, parent } = columnsOf(manager, group);
  // For UPDATE, TypeORM's postgres driver returns [rows, rowCount].
  const [, rowCount] = await manager.query<[unknown[], number]>(
    `UPDATE ${table} AS target SET position = sub.new_pos
     FROM (
       SELECT id, row_number() OVER (ORDER BY position ASC, "createdAt" ASC, id ASC) * ${SPACING} AS new_pos
       FROM ${table} WHERE ${parent} = $1
     ) sub
     WHERE target.id = sub.id`,
    [group.parentId],
  );
  logger.log(
    `Reindexed ${rowCount} ${table} rows (${group.parentColumn} = ${group.parentId})`,
  );
  return rowCount;
}

/** Quoted table and parent column names, from entity metadata (never input). */
function columnsOf<T extends Positioned>(
  manager: EntityManager,
  group: SiblingGroup<T>,
): { table: string; parent: string } {
  const metadata = manager.connection.getMetadata(group.entity);
  const column = metadata.findColumnWithPropertyName(group.parentColumn);
  if (!column) {
    throw new Error(`Unknown column ${group.parentColumn} on ${metadata.name}`);
  }
  const escape = (name: string) => manager.connection.driver.escape(name);
  return {
    table: escape(metadata.tableName),
    parent: escape(column.databaseName),
  };
}
