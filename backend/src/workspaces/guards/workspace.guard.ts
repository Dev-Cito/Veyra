import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { Repository } from 'typeorm';
import { WORKSPACE_ROLES_KEY } from '../decorators/workspace-roles.decorator.js';
import { WorkspaceMember } from '../entities/workspace-member.entity.js';
import { MembershipStatus, type WorkspaceRole } from '../workspace.enums.js';
import type { WorkspaceRequest } from '../workspace-membership.js';

// Matches routes whose `:id` param *is* the workspace (/workspaces/:id/...),
// with or without a global prefix. On /boards/:id, `:id` is not a workspace.
const WORKSPACE_ID_ROUTE = /(^|\/)workspaces\/:id(\/|$)/;

/**
 * Workspace-scoped RBAC. Must run after JwtAuthGuard:
 *
 *   @UseGuards(JwtAuthGuard, WorkspaceGuard)
 *
 * Resolves the target workspace, requires an ACTIVE membership for the current
 * user (403 otherwise, not 404: we accept revealing that the workspace exists),
 * checks @WorkspaceRoles if present, and attaches `request.membership`.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WorkspaceRequest>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException();
    }

    const workspaceId = extractWorkspaceId(request);
    if (!workspaceId) {
      throw new BadRequestException('workspaceId is required');
    }
    // Reject early: Postgres would otherwise fail the uuid cast with a 500.
    if (!isUUID(workspaceId)) {
      throw new BadRequestException('workspaceId must be a UUID');
    }

    const member = await this.members.findOne({
      where: { workspaceId, userId: user.id, status: MembershipStatus.ACTIVE },
      select: { id: true, role: true },
    });
    if (!member) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    request.membership = { workspaceId, userId: user.id, role: member.role };

    const requiredRoles = this.reflector.getAllAndOverride<
      WorkspaceRole[] | undefined
    >(WORKSPACE_ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (requiredRoles?.length && !requiredRoles.includes(member.role)) {
      throw new ForbiddenException(
        `Requires one of the following workspace roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}

function extractWorkspaceId(request: WorkspaceRequest): string | undefined {
  const params = request.params as Record<string, string | undefined>;
  if (params.workspaceId) {
    return params.workspaceId;
  }

  const routePath = (request.route as { path?: unknown } | undefined)?.path;
  if (
    params.id &&
    typeof routePath === 'string' &&
    WORKSPACE_ID_ROUTE.test(routePath)
  ) {
    return params.id;
  }

  const body = request.body as { workspaceId?: unknown } | undefined;
  return typeof body?.workspaceId === 'string' ? body.workspaceId : undefined;
}
