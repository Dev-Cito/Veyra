import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveTimeZone } from '../../common/timezone.js';
import {
  LLM_CLIENT,
  type LlmClient,
  type LlmMessage,
  LlmOutputError,
  LlmProviderError,
  LlmRateLimitError,
  LlmTimeoutError,
} from '../../llm/llm.client.js';
import { WorkspaceScope } from '../../scope/workspace-scope.service.js';
import type { User } from '../../users/user.entity.js';
import type { WorkspaceMembership } from '../../workspaces/workspace-membership.js';
import { buildRetryMessage, buildSystemPrompt } from './task-parse.prompt.js';
import { type Confidence, normalizeProposal } from './task-proposal.js';
import type { TaskPriority } from '../task-priority.enum.js';

/** POST …/tasks/parse answers this. Nothing is created. */
export interface ParsedTask {
  title: string;
  /** ISO 8601, UTC; null when the text gives no (usable) date. */
  dueDate: string | null;
  priority: TaskPriority;
  confidence: Confidence;
  /** The text as received (trimmed), so the client can fall back to it. */
  rawText: string;
}

/** Retries after a rejected answer: one, never a loop. */
const MAX_ATTEMPTS = 2;
/** Not a creative task. */
const TEMPERATURE = 0;

/**
 * Natural-language task parsing. The model PROPOSES, the code AUTHORISES:
 * its output is untrusted input, validated like a request body, and this
 * service writes nothing. The card is created afterwards by the ordinary
 * POST …/lists/:listId/tasks, under the same guard and the same rules as a
 * manual creation, once the user has confirmed (and possibly corrected) it.
 */
@Injectable()
export class TaskParserService {
  private readonly logger = new Logger('TaskParser');

  constructor(
    @Inject(LLM_CLIENT) private readonly client: LlmClient | null,
    private readonly scope: WorkspaceScope,
    private readonly config: ConfigService,
  ) {}

  async parse(
    actor: WorkspaceMembership,
    user: User,
    listId: string,
    text: string,
  ): Promise<ParsedTask> {
    // The list must be in the caller's workspace (404 otherwise), as for a
    // creation: checked before spending a model call on it.
    await this.scope.listOrFail(actor.workspaceId, listId);
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Assisted task creation is not configured on this server',
      );
    }

    const now = new Date();
    const timeZone = resolveTimeZone(
      user.timezone,
      this.config.get<string>('DEFAULT_TIMEZONE'),
    );
    // The user's text only ever travels in a `user` message: never
    // concatenated into the system prompt.
    const messages: LlmMessage[] = [
      { role: 'system', content: buildSystemPrompt(now, timeZone) },
      { role: 'user', content: text },
    ];
    if (process.env.NODE_ENV === 'development') {
      // It may hold anything: development only, debug level only.
      this.logger.debug(`Text to parse: ${JSON.stringify(text)}`);
    }

    const stats = new CallStats(this.client.model);
    let lastError = '';
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        stats.attempts = attempt;
        let content: string | null;
        try {
          const completion = await this.client.complete({
            messages,
            temperature: TEMPERATURE,
            json: true,
          });
          stats.add(completion);
          content = completion.content;
        } catch (err) {
          if (!(err instanceof LlmOutputError)) {
            throw err;
          }
          lastError = err.message;
          messages.push({
            role: 'user',
            content: buildRetryMessage(lastError),
          });
          continue;
        }

        const result = normalizeProposal(content, { now, timeZone });
        if (result.ok) {
          const { proposal } = result;
          stats.log(this.logger, 'ok', {
            confidence: proposal.confidence,
            adjustments: result.adjustments,
          });
          return {
            title: proposal.title,
            dueDate: proposal.dueDate?.toISOString() ?? null,
            priority: proposal.priority,
            confidence: proposal.confidence,
            rawText: text,
          };
        }
        lastError = result.error;
        messages.push(
          { role: 'assistant', content: content ?? '' },
          { role: 'user', content: buildRetryMessage(lastError) },
        );
      }
    } catch (err) {
      throw this.toHttp(err, stats);
    }

    stats.log(this.logger, 'unusable', { reason: lastError });
    throw new UnprocessableEntityException(
      'The model did not return a usable proposal; create the card manually',
    );
  }

  private toHttp(err: unknown, stats: CallStats): Error {
    if (err instanceof LlmTimeoutError) {
      stats.log(this.logger, 'timeout');
      return new GatewayTimeoutException(
        'The language model did not answer in time',
      );
    }
    if (err instanceof LlmRateLimitError) {
      stats.log(this.logger, 'provider rate limit', {
        retryAfter: err.retryAfterSeconds,
      });
      return new HttpException(
        "The language model provider's rate limit was reached; try again in a minute",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (err instanceof LlmProviderError) {
      stats.log(this.logger, 'provider error', { reason: err.message });
      return new BadGatewayException('The language model provider failed');
    }
    return err instanceof Error ? err : new Error('unknown error');
  }
}

/**
 * One line per parse request, at info level: what phase 10 needs to answer
 * "what does a request cost" and "what is the p95 latency". Never the text,
 * never the key.
 */
class CallStats {
  private readonly started = performance.now();
  attempts = 0;
  private inputTokens: number | null = null;
  private outputTokens: number | null = null;
  private answeredBy: string | null = null;

  constructor(private readonly model: string) {}

  add(completion: {
    model: string;
    usage: { inputTokens: number | null; outputTokens: number | null };
  }): void {
    this.answeredBy = completion.model;
    const sum = (total: number | null, value: number | null) =>
      value === null ? total : (total ?? 0) + value;
    this.inputTokens = sum(this.inputTokens, completion.usage.inputTokens);
    this.outputTokens = sum(this.outputTokens, completion.usage.outputTokens);
  }

  log(
    logger: Logger,
    outcome: string,
    extra: Record<string, unknown> = {},
  ): void {
    const fields: Record<string, unknown> = {
      outcome,
      model: this.answeredBy ?? this.model,
      latencyMs: Math.round(performance.now() - this.started),
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      retried: this.attempts > 1,
      ...extra,
    };
    logger.log(`Task parse ${JSON.stringify(fields)}`);
  }
}
