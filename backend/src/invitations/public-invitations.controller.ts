import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RATE_LIMITS, RateLimit } from '../common/rate-limits.js';
import type { User } from '../users/user.entity.js';
import type { WorkspaceWithRole } from '../workspaces/workspaces.service.js';
import { InvitationTokenDto } from './dto/invitation-token.dto.js';
import {
  type InvitationPreview,
  InvitationsService,
} from './invitations.service.js';

/**
 * Routes for the invitee, who is by definition not a member yet: no
 * WorkspaceGuard here.
 *
 * The token is a bearer secret, so it travels in the request body, never in
 * the path: a URL ends up in the access logs of Render and of every proxy, in
 * the browser history and in Referer headers. Hence a POST even for the
 * read-only preview, trading REST semantics for keeping the secret out of
 * server logs.
 */
@Controller('invitations')
export class PublicInvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  /** Public, unauthenticated preview before signing up. */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RateLimit(RATE_LIMITS.invitationPreview)
  preview(@Body() dto: InvitationTokenDto): Promise<InvitationPreview> {
    return this.invitationsService.preview(dto.token);
  }

  // The rate limit must run before authentication, so that unauthenticated
  // floods are throttled too. Method decorators apply bottom-up, so the guard
  // declared lower (@RateLimit) runs first. Swapping these two lines lets
  // anonymous requests through unthrottled (covered by rate-limit.e2e-spec).
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @RateLimit(RATE_LIMITS.invitationAccept)
  accept(
    @CurrentUser() user: User,
    @Body() dto: InvitationTokenDto,
  ): Promise<WorkspaceWithRole> {
    return this.invitationsService.accept(user, dto.token);
  }
}
