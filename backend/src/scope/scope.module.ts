import { Module } from '@nestjs/common';
import { WorkspaceScope } from './workspace-scope.service.js';

@Module({
  providers: [WorkspaceScope],
  exports: [WorkspaceScope],
})
export class ScopeModule {}
