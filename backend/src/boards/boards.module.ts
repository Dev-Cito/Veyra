import { Module } from '@nestjs/common';
import { ScopeModule } from '../scope/scope.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { BoardsController } from './boards.controller.js';
import { BoardsService } from './boards.service.js';

@Module({
  // WorkspacesModule provides WorkspaceGuard and its repository.
  imports: [WorkspacesModule, ScopeModule],
  controllers: [BoardsController],
  providers: [BoardsService],
})
export class BoardsModule {}
