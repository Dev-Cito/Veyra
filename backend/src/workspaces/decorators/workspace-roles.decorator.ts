import { SetMetadata } from '@nestjs/common';
import type { WorkspaceRole } from '../workspace.enums.js';

export const WORKSPACE_ROLES_KEY = 'workspaceRoles';

/**
 * Restricts a handler to the given roles *within the target workspace*.
 * Enforced by WorkspaceGuard. Without it, any ACTIVE member is allowed.
 *
 * Accepts enum members or their string values: `@WorkspaceRoles('OWNER', 'ADMIN')`.
 */
export const WorkspaceRoles = (...roles: `${WorkspaceRole}`[]) =>
  SetMetadata(WORKSPACE_ROLES_KEY, roles);
