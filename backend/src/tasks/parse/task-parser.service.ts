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
import {
  type Confidence,
  normalizeProposal,
  type TaskProposal,
} from './task-proposal.js';
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

    const outcome = await proposeTask(
      this.client,
      text,
      {
        now: new Date(),
        timeZone: resolveTimeZone(
          user.timezone,
          this.config.get<string>('DEFAULT_TIMEZONE'),
        ),
      },
      this.logger,
    );
    if (!outcome.ok) {
      throw outcome.error;
    }
    const { proposal } = outcome;
    return {
      title: proposal.title,
      dueDate: proposal.dueDate?.toISOString() ?? null,
      priority: proposal.priority,
      confidence: proposal.confidence,
      rawText: text,
    };
  }
}

/** What one parse cost, whatever its outcome: logged, and read by the offline eval. */
export interface ParseStats {
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** 1, or 2 when the first answer was rejected. */
  attempts: number;
}

export type ParseOutcome =
  | {
      ok: true;
      proposal: TaskProposal;
      /** Repairs applied to the model's output (see normalizeProposal). */
      adjustments: string[];
      stats: ParseStats;
    }
  | {
      ok: false;
      kind: 'unusable' | 'timeout' | 'rate-limited' | 'provider';
      /** The HTTP error the endpoint answers with. */
      error: HttpException;
      reason: string;
      stats: ParseStats;
    };

/**
 * The model call itself: prompt, one retry with the reason of the
 * rejection, validation, and one log line. Shared by the endpoint (through
 * TaskParserService, after the access checks) and by the offline evaluation
 * (backend/eval), which passes a fixed `now` per case: one parsing path.
 */
export async function proposeTask(
  client: LlmClient,
  text: string,
  context: { now: Date; timeZone: string },
  logger: Pick<Logger, 'log' | 'debug'>,
): Promise<ParseOutcome> {
  const { now, timeZone } = context;
  // The user's text only ever travels in a `user` message: never
  // concatenated into the system prompt.
  const messages: LlmMessage[] = [
    { role: 'system', content: buildSystemPrompt(now, timeZone) },
    { role: 'user', content: text },
  ];
  if (process.env.NODE_ENV === 'development') {
    // It may hold anything: development only, debug level only.
    logger.debug(`Text to parse: ${JSON.stringify(text)}`);
  }

  const stats = new CallStats(client.model);
  let lastError = '';
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      stats.attempts = attempt;
      let content: string | null;
      try {
        const completion = await client.complete({
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
        stats.log(logger, 'ok', {
          confidence: result.proposal.confidence,
          adjustments: result.adjustments,
        });
        return {
          ok: true,
          proposal: result.proposal,
          adjustments: result.adjustments,
          stats: stats.snapshot(),
        };
      }
      lastError = result.error;
      messages.push(
        { role: 'assistant', content: content ?? '' },
        { role: 'user', content: buildRetryMessage(lastError) },
      );
    }
  } catch (err) {
    return failure(err, stats, logger);
  }

  stats.log(logger, 'unusable', { reason: lastError });
  return {
    ok: false,
    kind: 'unusable',
    error: new UnprocessableEntityException(
      'The model did not return a usable proposal; create the card manually',
    ),
    reason: lastError,
    stats: stats.snapshot(),
  };
}

/** Provider failures become outcomes; anything else is a bug and is rethrown. */
function failure(
  err: unknown,
  stats: CallStats,
  logger: Pick<Logger, 'log'>,
): ParseOutcome {
  if (err instanceof LlmTimeoutError) {
    stats.log(logger, 'timeout');
    return {
      ok: false,
      kind: 'timeout',
      error: new GatewayTimeoutException(
        'The language model did not answer in time',
      ),
      reason: err.message,
      stats: stats.snapshot(),
    };
  }
  if (err instanceof LlmRateLimitError) {
    stats.log(logger, 'provider rate limit', {
      retryAfter: err.retryAfterSeconds,
    });
    return {
      ok: false,
      kind: 'rate-limited',
      error: new HttpException(
        "The language model provider's rate limit was reached; try again in a minute",
        HttpStatus.TOO_MANY_REQUESTS,
      ),
      reason: `retry after ${err.retryAfterSeconds ?? '?'} s`,
      stats: stats.snapshot(),
    };
  }
  if (err instanceof LlmProviderError) {
    stats.log(logger, 'provider error', { reason: err.message });
    return {
      ok: false,
      kind: 'provider',
      error: new BadGatewayException('The language model provider failed'),
      reason: err.message,
      stats: stats.snapshot(),
    };
  }
  throw err;
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

  snapshot(): ParseStats {
    return {
      model: this.answeredBy ?? this.model,
      latencyMs: Math.round(performance.now() - this.started),
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      attempts: this.attempts,
    };
  }

  log(
    logger: Pick<Logger, 'log'>,
    outcome: string,
    extra: Record<string, unknown> = {},
  ): void {
    const { attempts, ...snapshot } = this.snapshot();
    const fields: Record<string, unknown> = {
      outcome,
      ...snapshot,
      retried: attempts > 1,
      ...extra,
    };
    logger.log(`Task parse ${JSON.stringify(fields)}`);
  }
}
