import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { Board } from '../boards/board.entity.js';
import { List } from '../lists/list.entity.js';
import { Task } from '../tasks/entities/task.entity.js';

/**
 * IDOR protection. WorkspaceGuard only proves the caller is an ACTIVE member
 * of the workspace in the URL; it says nothing about the boardId / listId /
 * taskId next to it. Every service handler resolves its target through one of
 * these methods first.
 *
 * Each method walks the ownership chain up to the workspace in a single query
 * (inner joins, filtered on workspaceId in SQL). QueryBuilder rather than
 * `findOne({ where: { list: { board: ... } } })`, which TypeORM splits into
 * two queries (a DISTINCT id subquery, then the entity) and throws 404 when the resource is
 * not in the caller's workspace, never 403: a 403 would confirm to an attacker
 * that a guessed UUID exists elsewhere.
 *
 * Pass `manager` to run the lookup inside an ongoing transaction.
 */
@Injectable()
export class WorkspaceScope {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** board.workspaceId === workspaceId */
  async boardOrFail(
    workspaceId: string,
    boardId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Board> {
    const board = await manager.findOne(Board, {
      where: { id: boardId, workspaceId },
    });
    if (!board) {
      throw new NotFoundException('Board not found');
    }
    return board;
  }

  /** list.board.workspaceId === workspaceId */
  async listOrFail(
    workspaceId: string,
    listId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<List> {
    const list = await manager
      .createQueryBuilder(List, 'list')
      .innerJoin('list.board', 'board')
      .where('list.id = :listId', { listId })
      .andWhere('board.workspaceId = :workspaceId', { workspaceId })
      .getOne();
    if (!list) {
      throw new NotFoundException('List not found');
    }
    return list;
  }

  /** task.list.board.workspaceId === workspaceId */
  async taskOrFail(
    workspaceId: string,
    taskId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Task> {
    const task = await manager
      .createQueryBuilder(Task, 'task')
      .innerJoin('task.list', 'list')
      .innerJoin('list.board', 'board')
      .where('task.id = :taskId', { taskId })
      .andWhere('board.workspaceId = :workspaceId', { workspaceId })
      .getOne();
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }
}
