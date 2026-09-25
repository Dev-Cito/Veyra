import { IsEnum } from 'class-validator';
import { WorkspaceRole } from '../workspace.enums.js';

export class UpdateMemberRoleDto {
  @IsEnum(WorkspaceRole)
  role: WorkspaceRole;
}
