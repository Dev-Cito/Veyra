import { applyDecorators, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

export const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Requests per minute and per client IP: unauthenticated entry points, plus
 * the manual reminder trigger (it sends emails).
 */
export const RATE_LIMITS = {
  invitationPreview: 20,
  invitationAccept: 10,
  login: 10,
  register: 5,
  remindersRun: 2,
} as const;

export const RATE_LIMIT_MESSAGE = 'Too many requests, please try again later';

/**
 * Rate-limits one route (429 beyond `limit` per minute per IP). Targeted on
 * purpose: routes without it are not throttled at all. Keyed on req.ip, i.e.
 * the real client address behind Render's proxy (see trust proxy in
 * configureApp). Counters live in memory, per instance.
 */
export const RateLimit = (limit: number) =>
  applyDecorators(
    UseGuards(ThrottlerGuard),
    Throttle({ default: { limit, ttl: RATE_LIMIT_WINDOW_MS } }),
  );
