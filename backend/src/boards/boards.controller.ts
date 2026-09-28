import {
  Body,
  Controller,
  Delete,
  Get,
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
import type { Board } from './board.entity.js';
import { BoardsService, type DeletedBoard } from './boards.service.js';
import { CreateBoardDto } from './dto/create-board.dto.js';
import { UpdateBoardDto } from './dto/update-board.dto.js';

@Controller('workspaces/:workspaceId/boards')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Post()
  @WorkspaceRoles('OWNER', 'ADMIN')
  create(
    @CurrentMembership() membership: WorkspaceMembership,
    @Body() dto: CreateBoardDto,
  ): Promise<Board> {
    return this.boardsService.create(membership, dto);
  }

  @Get()
  findAll(
    @CurrentMembership() membership: WorkspaceMembership,
  ): Promise<Board[]> {
    return this.boardsService.findAll(membership);
  }

  @Get(':boardId')
  findOne(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('boardId', ParseUUIDPipe) boardId: string,
  ): Promise<Board> {
    return this.boardsService.findOne(membership, boardId);
  }

  @Get(':boardId/full')
  findFull(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('boardId', ParseUUIDPipe) boardId: string,
  ): Promise<Board> {
    return this.boardsService.findFull(membership, boardId);
  }

  @Patch(':boardId')
  @WorkspaceRoles('OWNER', 'ADMIN')
  update(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Body() dto: UpdateBoardDto,
  ): Promise<Board> {
    return this.boardsService.update(membership, boardId, dto);
  }

  @Delete(':boardId')
  @WorkspaceRoles('OWNER')
  remove(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('boardId', ParseUUIDPipe) boardId: string,
  ): Promise<DeletedBoard> {
    return this.boardsService.remove(membership, boardId);
  }
}
