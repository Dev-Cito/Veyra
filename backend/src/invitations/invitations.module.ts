import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { InvitationsService } from './invitations.service.js';
import { PublicInvitationsController } from './public-invitations.controller.js';
import { WorkspaceInvitationsController } from './workspace-invitations.controller.js';

@Module({
  // WorkspacesModule provides WorkspaceGuard and its repository.
  imports: [WorkspacesModule, MailModule],
  controllers: [WorkspaceInvitationsController, PublicInvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
