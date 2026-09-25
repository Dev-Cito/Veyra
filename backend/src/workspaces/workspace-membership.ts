import type { Request } from 'express';
import type { User } from '../users/user.entity.js';
import type { WorkspaceRole } from './workspace.enums.js';

/** Attached to the request by WorkspaceGuard once ACTIVE membership is proven. */
export interface WorkspaceMembership {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}

export interface WorkspaceRequest extends Request {
  user?: User;
  membership?: WorkspaceMembership;
}
