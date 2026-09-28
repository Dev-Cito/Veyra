import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ReminderService } from './reminder.service.js';
import { RemindersController } from './reminders.controller.js';

@Module({
  // WorkspacesModule provides WorkspaceGuard and its repository.
  imports: [WorkspacesModule, MailModule],
  controllers: [RemindersController],
  providers: [ReminderService],
})
export class NotificationsModule {}
