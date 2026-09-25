import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceMember } from './entities/workspace-member.entity.js';
import { Workspace } from './entities/workspace.entity.js';
import { WorkspaceGuard } from './guards/workspace.guard.js';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspacesService } from './workspaces.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Workspace, WorkspaceMember])],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceGuard],
  // Board / List / Task modules import this to protect their own routes.
  exports: [TypeOrmModule, WorkspaceGuard],
})
export class WorkspacesModule {}
