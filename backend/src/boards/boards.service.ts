import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  type Moved,
  moved,
  rejectOutsider,
  saveMove,
} from '../common/moved.js';
import { lockRow, nextPosition, planMove } from '../common/position.js';
import { List } from '../lists/list.entity.js';
import { WorkspaceScope } from '../scope/workspace-scope.service.js';
import { Task } from '../tasks/entities/task.entity.js';
import { Workspace } from '../workspaces/entities/workspace.entity.js';
import type { WorkspaceMembership } from '../workspaces/workspace-membership.js';
import { Board } from './board.entity.js';
import type { CreateBoardDto } from './dto/create-board.dto.js';
import type { MoveBoardDto } from './dto/move-board.dto.js';
import type { UpdateBoardDto } from './dto/update-board.dto.js';

export interface DeletedBoard {
  id: string;
  deletedLists: number;
  deletedTasks: number;
}

@Injectable()
export class BoardsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scope: WorkspaceScope,
  ) {}

  create(actor: WorkspaceMembership, dto: CreateBoardDto): Promise<Board> {
    return this.dataSource.transaction(async (manager) => {
      // Serialises board creation per workspace for the position computation.
      if (!(await lockRow(manager, Workspace, actor.workspaceId))) {
        throw new NotFoundException('Workspace not found');
      }
      const position = await nextPosition(manager, Board, {
        workspaceId: actor.workspaceId,
      });
      return manager.save(
        manager.create(Board, {
          workspaceId: actor.workspaceId,
          name: dto.name,
          description: dto.description ?? null,
          position,
          createdById: actor.userId,
        }),
      );
    });
  }

  findAll(actor: WorkspaceMembership): Promise<Board[]> {
    return this.dataSource.manager.find(Board, {
      where: { workspaceId: actor.workspaceId },
      order: { position: 'ASC' },
    });
  }

  findOne(actor: WorkspaceMembership, boardId: string): Promise<Board> {
    return this.scope.boardOrFail(actor.workspaceId, boardId);
  }

  /**
   * The whole Kanban view in one query: lists by position, their tasks by
   * position, and each task's assignees. The workspace filter is part of the
   * same query, so this is also the IDOR check (404 outside the workspace).
   */
  async findFull(actor: WorkspaceMembership, boardId: string): Promise<Board> {
    const board = await this.dataSource.manager
      .createQueryBuilder(Board, 'board')
      .leftJoinAndSelect('board.lists', 'list')
      .leftJoinAndSelect('list.tasks', 'task')
      .leftJoinAndSelect('task.assignees', 'assignee')
      .leftJoinAndSelect('assignee.user', 'user')
      .where('board.id = :boardId', { boardId })
      .andWhere('board.workspaceId = :workspaceId', {
        workspaceId: actor.workspaceId,
      })
      .orderBy('list.position', 'ASC')
      .addOrderBy('task.position', 'ASC')
      .addOrderBy('assignee.assignedAt', 'ASC')
      .getOne();
    if (!board) {
      throw new NotFoundException('Board not found');
    }
    return board;
  }

  async update(
    actor: WorkspaceMembership,
    boardId: string,
    dto: UpdateBoardDto,
  ): Promise<Board> {
    const board = await this.scope.boardOrFail(actor.workspaceId, boardId);
    if (dto.name !== undefined) {
      board.name = dto.name;
    }
    if (dto.description !== undefined) {
      board.description = dto.description;
    }
    return this.dataSource.manager.save(board);
  }

  /** Reorders a board within its workspace. */
  move(
    actor: WorkspaceMembership,
    boardId: string,
    dto: MoveBoardDto,
  ): Promise<Moved<Board>> {
    return this.dataSource.transaction(async (manager) => {
      const board = await this.scope.boardOrFail(
        actor.workspaceId,
        boardId,
        manager,
      );
      if (!(await lockRow(manager, Workspace, actor.workspaceId))) {
        throw new NotFoundException('Workspace not found');
      }
      // Re-read under the lock for a fresh position.
      const current = await manager.findOneByOrFail(Board, { id: board.id });

      const plan = await planMove(
        manager,
        {
          entity: Board,
          parentColumn: 'workspaceId',
          parentId: current.workspaceId,
        },
        { id: current.id, position: current.position, inGroup: true },
        {
          previous: {
            field: 'previousBoardId',
            id: dto.previousBoardId ?? null,
          },
          next: { field: 'nextBoardId', id: dto.nextBoardId ?? null },
          // A workspace is the whole sibling group: boardOrFail 404s outside
          // it, so a board neighbour can never get the 400.
          rejectOutsider: rejectOutsider(
            (id) => this.scope.boardOrFail(actor.workspaceId, id, manager),
            'the same workspace',
          ),
        },
      );
      if (plan.noop) {
        return moved(current, false);
      }
      const saved = await saveMove(manager, Board, current.id, {
        position: plan.position,
      });
      return moved(saved, plan.reindexed);
    });
  }

  /** Lists and tasks go with it through ON DELETE CASCADE. */
  remove(actor: WorkspaceMembership, boardId: string): Promise<DeletedBoard> {
    return this.dataSource.transaction(async (manager) => {
      const board = await this.scope.boardOrFail(
        actor.workspaceId,
        boardId,
        manager,
      );
      const deletedLists = await manager.countBy(List, { boardId: board.id });
      const deletedTasks = await manager.countBy(Task, {
        list: { boardId: board.id },
      });
      await manager.delete(Board, { id: board.id });
      return { id: board.id, deletedLists, deletedTasks };
    });
  }
}
