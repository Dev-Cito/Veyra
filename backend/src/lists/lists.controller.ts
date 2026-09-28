import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentMembership } from '../workspaces/decorators/current-membership.decorator.js';
import { WorkspaceRoles } from '../workspaces/decorators/workspace-roles.decorator.js';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard.js';
import type { WorkspaceMembership } from '../workspaces/workspace-membership.js';
import type { Moved } from '../common/moved.js';
import { CreateListDto } from './dto/create-list.dto.js';
import { MoveListDto } from './dto/move-list.dto.js';
import { UpdateListDto } from './dto/update-list.dto.js';
import type { List } from './list.entity.js';
import { type DeletedList, ListsService } from './lists.service.js';

// Lists are read through GET /boards/:boardId/full, hence no GET here.
@Controller('workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@WorkspaceRoles('OWNER', 'ADMIN')
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  @Post('boards/:boardId/lists')
  create(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Body() dto: CreateListDto,
  ): Promise<List> {
    return this.listsService.create(membership, boardId, dto);
  }

  @Patch('lists/:listId')
  update(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: UpdateListDto,
  ): Promise<List> {
    return this.listsService.update(membership, listId, dto);
  }

  @Patch('lists/:listId/move')
  move(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: MoveListDto,
  ): Promise<Moved<List>> {
    return this.listsService.move(membership, listId, dto);
  }

  @Delete('lists/:listId')
  remove(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('listId', ParseUUIDPipe) listId: string,
  ): Promise<DeletedList> {
    return this.listsService.remove(membership, listId);
  }
}
