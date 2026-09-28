import { Module } from '@nestjs/common';
import { ScopeModule } from '../scope/scope.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [WorkspacesModule, ScopeModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
