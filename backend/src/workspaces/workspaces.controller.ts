import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { User } from '../users/user.entity.js';
import { CurrentMembership } from './decorators/current-membership.decorator.js';
import { WorkspaceRoles } from './decorators/workspace-roles.decorator.js';
import { CreateWorkspaceDto } from './dto/create-workspace.dto.js';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto.js';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto.js';
import type { WorkspaceMember } from './entities/workspace-member.entity.js';
import { WorkspaceGuard } from './guards/workspace.guard.js';
import type { WorkspaceMembership } from './workspace-membership.js';
import {
  type WorkspaceWithRole,
  WorkspacesService,
} from './workspaces.service.js';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateWorkspaceDto,
  ): Promise<WorkspaceWithRole> {
    return this.workspacesService.create(user.id, dto);
  }

  @Get()
  findMine(@CurrentUser() user: User): Promise<WorkspaceWithRole[]> {
    return this.workspacesService.findMine(user.id);
  }

  @Get(':id')
  @UseGuards(WorkspaceGuard)
  findOne(
    @CurrentMembership() membership: WorkspaceMembership,
  ): Promise<WorkspaceWithRole> {
    return this.workspacesService.findOne(membership);
  }

  @Patch(':id')
  @UseGuards(WorkspaceGuard)
  @WorkspaceRoles('OWNER', 'ADMIN')
  update(
    @CurrentMembership() membership: WorkspaceMembership,
    @Body() dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceWithRole> {
    return this.workspacesService.update(membership, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(WorkspaceGuard)
  @WorkspaceRoles('OWNER')
  remove(@CurrentMembership() membership: WorkspaceMembership): Promise<void> {
    return this.workspacesService.remove(membership);
  }

  @Get(':id/members')
  @UseGuards(WorkspaceGuard)
  listMembers(
    @CurrentMembership() membership: WorkspaceMembership,
  ): Promise<WorkspaceMember[]> {
    return this.workspacesService.listMembers(membership.workspaceId);
  }

  @Patch(':id/members/:memberId')
  @UseGuards(WorkspaceGuard)
  @WorkspaceRoles('OWNER')
  updateMemberRole(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<WorkspaceMember> {
    return this.workspacesService.updateMemberRole(membership, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(WorkspaceGuard)
  @WorkspaceRoles('OWNER', 'ADMIN')
  removeMember(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ): Promise<void> {
    return this.workspacesService.removeMember(membership, memberId);
  }
}
