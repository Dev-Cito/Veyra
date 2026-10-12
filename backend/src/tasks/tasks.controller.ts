import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RATE_LIMITS, RateLimitPerUser } from '../common/rate-limits.js';
import type { User } from '../users/user.entity.js';
import { CurrentMembership } from '../workspaces/decorators/current-membership.decorator.js';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard.js';
import type { WorkspaceMembership } from '../workspaces/workspace-membership.js';
import { AssignTaskDto } from './dto/assign-task.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { MoveTaskDto } from './dto/move-task.dto.js';
import { ParseTaskDto } from './dto/parse-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import type { TaskAssignee } from './entities/task-assignee.entity.js';
import type { Task } from './entities/task.entity.js';
import type { Moved } from '../common/moved.js';
import { TasksService } from './tasks.service.js';
import {
  type ParsedTask,
  TaskParserService,
} from './parse/task-parser.service.js';

// Every route is open to any ACTIVE member; the delete rule (creator, OWNER or
// ADMIN) depends on the task itself and is enforced in TasksService.
@Controller('workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly taskParser: TaskParserService,
  ) {}

  @Post('lists/:listId/tasks')
  create(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: CreateTaskDto,
  ): Promise<Task> {
    return this.tasksService.create(membership, listId, dto);
  }

  /**
   * Proposes a card from one sentence; creates nothing. The client shows the
   * proposal, lets the user correct it, then creates it with the route above.
   */
  @Post('lists/:listId/tasks/parse')
  @HttpCode(HttpStatus.OK)
  @RateLimitPerUser(RATE_LIMITS.taskParse)
  parse(
    @CurrentMembership() membership: WorkspaceMembership,
    @CurrentUser() user: User,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: ParseTaskDto,
  ): Promise<ParsedTask> {
    return this.taskParser.parse(membership, user, listId, dto.text);
  }

  @Get('tasks/:taskId')
  findOne(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<Task> {
    return this.tasksService.findOne(membership, taskId);
  }

  @Patch('tasks/:taskId')
  update(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<Task> {
    return this.tasksService.update(membership, taskId, dto);
  }

  @Patch('tasks/:taskId/move')
  move(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: MoveTaskDto,
  ): Promise<Moved<Task>> {
    return this.tasksService.move(membership, taskId, dto);
  }

  @Delete('tasks/:taskId')
  remove(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<{ id: string }> {
    return this.tasksService.remove(membership, taskId);
  }

  @Post('tasks/:taskId/assignees')
  assign(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: AssignTaskDto,
  ): Promise<TaskAssignee> {
    return this.tasksService.assign(membership, taskId, dto);
  }

  @Delete('tasks/:taskId/assignees/:userId')
  unassign(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<{ taskId: string; userId: string }> {
    return this.tasksService.unassign(membership, taskId, userId);
  }
}
