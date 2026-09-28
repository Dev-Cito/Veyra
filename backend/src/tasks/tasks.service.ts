import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { lockRow, nextPosition } from '../common/position.js';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../database/pg-errors.js';
import { List } from '../lists/list.entity.js';
import { WorkspaceScope } from '../scope/workspace-scope.service.js';
import { WorkspaceMember } from '../workspaces/entities/workspace-member.entity.js';
import {
  MembershipStatus,
  WorkspaceRole,
} from '../workspaces/workspace.enums.js';
import type { WorkspaceMembership } from '../workspaces/workspace-membership.js';
import type { AssignTaskDto } from './dto/assign-task.dto.js';
import type { CreateTaskDto } from './dto/create-task.dto.js';
import type { UpdateTaskDto } from './dto/update-task.dto.js';
import {
  TASK_ASSIGNEE_UNIQUE,
  TaskAssignee,
} from './entities/task-assignee.entity.js';
import { Task } from './entities/task.entity.js';

@Injectable()
export class TasksService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scope: WorkspaceScope,
  ) {}

  create(
    actor: WorkspaceMembership,
    listId: string,
    dto: CreateTaskDto,
  ): Promise<Task> {
    return this.dataSource.transaction(async (manager) => {
      const list = await this.scope.listOrFail(
        actor.workspaceId,
        listId,
        manager,
      );
      // Serialises task creation per list for the position computation.
      if (!(await lockRow(manager, List, list.id))) {
        throw new NotFoundException('List not found');
      }
      const position = await nextPosition(manager, Task, { listId: list.id });
      const task = await manager.save(
        manager.create(Task, {
          listId: list.id,
          title: dto.title,
          description: dto.description ?? null,
          dueDate: dto.dueDate ?? null,
          priority: dto.priority,
          position,
          createdById: actor.userId,
        }),
      );
      return Object.assign(task, { assignees: [] });
    });
  }

  async findOne(actor: WorkspaceMembership, taskId: string): Promise<Task> {
    const task = await this.scope.taskOrFail(actor.workspaceId, taskId);
    return this.withAssignees(task);
  }

  async update(
    actor: WorkspaceMembership,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<Task> {
    const task = await this.scope.taskOrFail(actor.workspaceId, taskId);
    if (dto.title !== undefined) {
      task.title = dto.title;
    }
    if (dto.description !== undefined) {
      task.description = dto.description;
    }
    if (dto.dueDate !== undefined) {
      task.dueDate = dto.dueDate;
    }
    if (dto.priority !== undefined) {
      task.priority = dto.priority;
    }
    return this.withAssignees(await this.dataSource.manager.save(task));
  }

  /**
   * Allowed to the task's creator and to workspace OWNERs / ADMINs. A task
   * whose creator account was deleted (createdById null) is therefore only
   * deletable by an OWNER or ADMIN.
   */
  async remove(
    actor: WorkspaceMembership,
    taskId: string,
  ): Promise<{ id: string }> {
    const task = await this.scope.taskOrFail(actor.workspaceId, taskId);
    const isManager =
      actor.role === WorkspaceRole.OWNER || actor.role === WorkspaceRole.ADMIN;
    if (!isManager && task.createdById !== actor.userId) {
      throw new ForbiddenException(
        'Only the task creator, an OWNER or an ADMIN can delete this task',
      );
    }
    await this.dataSource.manager.delete(Task, { id: task.id });
    return { id: task.id };
  }

  async assign(
    actor: WorkspaceMembership,
    taskId: string,
    dto: AssignTaskDto,
  ): Promise<TaskAssignee> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const task = await this.scope.taskOrFail(
          actor.workspaceId,
          taskId,
          manager,
        );
        await this.assertActiveMember(manager, actor.workspaceId, dto.userId);
        const assignee = await manager.save(
          manager.create(TaskAssignee, { taskId: task.id, userId: dto.userId }),
        );
        return manager.findOneOrFail(TaskAssignee, {
          where: { id: assignee.id },
          relations: { user: true },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err, TASK_ASSIGNEE_UNIQUE)) {
        throw new ConflictException('User is already assigned to this task');
      }
      // The task or the user was deleted concurrently, after the checks above.
      if (isForeignKeyViolation(err)) {
        throw new ConflictException(
          'The task or the user no longer exists; reload and retry',
        );
      }
      throw err;
    }
  }

  async unassign(
    actor: WorkspaceMembership,
    taskId: string,
    userId: string,
  ): Promise<{ taskId: string; userId: string }> {
    const task = await this.scope.taskOrFail(actor.workspaceId, taskId);
    const result = await this.dataSource.manager.delete(TaskAssignee, {
      taskId: task.id,
      userId,
    });
    if (!result.affected) {
      throw new NotFoundException('User is not assigned to this task');
    }
    return { taskId: task.id, userId };
  }

  /** Never assign someone outside the workspace (or not yet ACTIVE in it). */
  private async assertActiveMember(
    manager: EntityManager,
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const isMember = await manager.existsBy(WorkspaceMember, {
      workspaceId,
      userId,
      status: MembershipStatus.ACTIVE,
    });
    if (!isMember) {
      throw new BadRequestException(
        'Only an active member of this workspace can be assigned to its tasks',
      );
    }
  }

  private async withAssignees(task: Task): Promise<Task> {
    task.assignees = await this.dataSource.manager.find(TaskAssignee, {
      where: { taskId: task.id },
      relations: { user: true },
      order: { assignedAt: 'ASC' },
    });
    return task;
  }
}
