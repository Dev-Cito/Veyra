import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Board } from '../boards/board.entity.js';
import {
  type Moved,
  moved,
  rejectOutsider,
  saveMove,
} from '../common/moved.js';
import { lockRow, nextPosition, planMove } from '../common/position.js';
import { WorkspaceScope } from '../scope/workspace-scope.service.js';
import { Task } from '../tasks/entities/task.entity.js';
import type { WorkspaceMembership } from '../workspaces/workspace-membership.js';
import type { CreateListDto } from './dto/create-list.dto.js';
import type { MoveListDto } from './dto/move-list.dto.js';
import type { UpdateListDto } from './dto/update-list.dto.js';
import { List } from './list.entity.js';

export interface DeletedList {
  id: string;
  /** Lets the frontend warn about what a list deletion took with it. */
  deletedTasks: number;
}

@Injectable()
export class ListsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scope: WorkspaceScope,
  ) {}

  create(
    actor: WorkspaceMembership,
    boardId: string,
    dto: CreateListDto,
  ): Promise<List> {
    return this.dataSource.transaction(async (manager) => {
      const board = await this.scope.boardOrFail(
        actor.workspaceId,
        boardId,
        manager,
      );
      // Serialises list creation per board for the position computation.
      if (!(await lockRow(manager, Board, board.id))) {
        throw new NotFoundException('Board not found');
      }
      const position = await nextPosition(manager, List, { boardId: board.id });
      return manager.save(
        manager.create(List, { boardId: board.id, name: dto.name, position }),
      );
    });
  }

  async update(
    actor: WorkspaceMembership,
    listId: string,
    dto: UpdateListDto,
  ): Promise<List> {
    const list = await this.scope.listOrFail(actor.workspaceId, listId);
    if (dto.name !== undefined) {
      list.name = dto.name;
    }
    return this.dataSource.manager.save(list);
  }

  /**
   * Reorders a list within its own board. Moving a list to another board is
   * deliberately unsupported: its tasks would follow, an ambiguous operation.
   */
  move(
    actor: WorkspaceMembership,
    listId: string,
    dto: MoveListDto,
  ): Promise<Moved<List>> {
    return this.dataSource.transaction(async (manager) => {
      const list = await this.scope.listOrFail(
        actor.workspaceId,
        listId,
        manager,
      );
      if (!(await lockRow(manager, Board, list.boardId))) {
        throw new NotFoundException('Board not found');
      }
      // Re-read under the lock for a fresh position.
      const current = await manager.findOneByOrFail(List, { id: list.id });

      const plan = await planMove(
        manager,
        { entity: List, parentColumn: 'boardId', parentId: current.boardId },
        { id: current.id, position: current.position, inGroup: true },
        {
          previous: { field: 'previousListId', id: dto.previousListId ?? null },
          next: { field: 'nextListId', id: dto.nextListId ?? null },
          rejectOutsider: rejectOutsider(
            (id) => this.scope.listOrFail(actor.workspaceId, id, manager),
            'the same board',
          ),
        },
      );
      if (plan.noop) {
        return moved(current, false);
      }
      const saved = await saveMove(manager, List, current.id, {
        position: plan.position,
      });
      return moved(saved, plan.reindexed);
    });
  }

  /** Tasks go with it through ON DELETE CASCADE. */
  remove(actor: WorkspaceMembership, listId: string): Promise<DeletedList> {
    return this.dataSource.transaction(async (manager) => {
      const list = await this.scope.listOrFail(
        actor.workspaceId,
        listId,
        manager,
      );
      const deletedTasks = await manager.countBy(Task, { listId: list.id });
      await manager.delete(List, { id: list.id });
      return { id: list.id, deletedTasks };
    });
  }
}
