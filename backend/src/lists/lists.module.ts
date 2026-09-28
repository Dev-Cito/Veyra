import { Module } from '@nestjs/common';
import { ScopeModule } from '../scope/scope.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ListsController } from './lists.controller.js';
import { ListsService } from './lists.service.js';

@Module({
  imports: [WorkspacesModule, ScopeModule],
  controllers: [ListsController],
  providers: [ListsService],
})
export class ListsModule {}
