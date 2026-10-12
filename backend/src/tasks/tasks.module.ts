import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { ScopeModule } from '../scope/scope.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { TasksController } from './tasks.controller.js';
import { TaskParserService } from './parse/task-parser.service.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [WorkspacesModule, ScopeModule, LlmModule],
  controllers: [TasksController],
  providers: [TasksService, TaskParserService],
})
export class TasksModule {}
