import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RATE_LIMITS, RateLimit } from '../common/rate-limits.js';
import { CurrentMembership } from '../workspaces/decorators/current-membership.decorator.js';
import { WorkspaceRoles } from '../workspaces/decorators/workspace-roles.decorator.js';
import { WorkspaceGuard } from '../workspaces/guards/workspace.guard.js';
import type { WorkspaceMembership } from '../workspaces/workspace-membership.js';
import { type ReminderRunResult, ReminderService } from './reminder.service.js';

/**
 * Runs the reminder pass now, for this workspace only: to test without
 * waiting for the hourly cron, and to catch up after Render's free tier has
 * slept through it.
 */
@Controller('workspaces/:workspaceId/reminders')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class RemindersController {
  constructor(private readonly reminders: ReminderService) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @WorkspaceRoles('OWNER')
  @RateLimit(RATE_LIMITS.remindersRun)
  run(
    @CurrentMembership() membership: WorkspaceMembership,
  ): Promise<ReminderRunResult> {
    return this.reminders.run(membership.workspaceId);
  }
}
