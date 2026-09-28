import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentMembership } from '../workspaces/decorators/current-membership.decorator.js';
import { WorkspaceRoles } from '../workspaces/decorators/workspace-roles.decorator.js';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard.js';
import type { WorkspaceMembership } from '../workspaces/workspace-membership.js';
import { CreateInvitationDto } from './dto/create-invitation.dto.js';
import {
  type CreatedInvitation,
  type InvitationView,
  InvitationsService,
  type RevokedInvitation,
} from './invitations.service.js';

/** Invitation management, for the workspace's OWNERs and ADMINs. */
@Controller('workspaces/:workspaceId/invitations')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@WorkspaceRoles('OWNER', 'ADMIN')
export class WorkspaceInvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post()
  create(
    @CurrentMembership() membership: WorkspaceMembership,
    @Body() dto: CreateInvitationDto,
  ): Promise<CreatedInvitation> {
    return this.invitationsService.create(membership, dto);
  }

  @Get()
  listPending(
    @CurrentMembership() membership: WorkspaceMembership,
  ): Promise<InvitationView[]> {
    return this.invitationsService.listPending(membership);
  }

  @Delete(':invitationId')
  revoke(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<RevokedInvitation> {
    return this.invitationsService.revoke(membership, invitationId);
  }
}
