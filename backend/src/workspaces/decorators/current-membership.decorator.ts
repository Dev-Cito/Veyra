import {
  createParamDecorator,
  type ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type {
  WorkspaceMembership,
  WorkspaceRequest,
} from '../workspace-membership.js';

/** The caller's membership in the target workspace, set by WorkspaceGuard. */
export const CurrentMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): WorkspaceMembership => {
    const { membership } = ctx.switchToHttp().getRequest<WorkspaceRequest>();
    if (!membership) {
      // Programming error: the route is missing @UseGuards(WorkspaceGuard).
      throw new InternalServerErrorException(
        'Workspace membership not resolved',
      );
    }
    return membership;
  },
);
