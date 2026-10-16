import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { OpenAiCompatibleClient } from '../src/llm/llm.client.js';
import { readLlmConfig } from '../src/llm/llm.config.js';
import { proposeTask } from '../src/tasks/parse/task-parser.service.js';
import { CASES } from './cases.js';
import { buildReport, type CaseResult, toMarkdown } from './report.js';
import { scoreCase, scoreMissing } from './scoring.js';

/**
 * Offline evaluation of natural-language task parsing, against the REAL
 * provider (each case costs at least one call). Not a test: no threshold,
 * nothing fails the build. Run with `pnpm eval:tasks [--model <id>]`.
 *
 * It goes through the same code as the endpoint: the same client, the same
 * proposeTask (prompt, retry, validation), with each case's fixed `now` and
 * time zone. Only the access checks around it (workspace, list) are left out.
 */

const REPORTS_DIR = new URL('../../eval/reports/', import.meta.url);
/**
 * Pacing. Free tiers cap tokens per minute (Groq, qwen/qwen3.8-27b: 8000, and
 * 1000 requests a day): after each case, wait as long as its tokens take to
 * come back into the budget. A 429 costs a request of the daily quota for
 * nothing, so they are avoided rather than retried; if one happens anyway,
 * the pause grows to what the provider asked for.
 */
const TOKENS_PER_MINUTE = Number(process.env.EVAL_TOKENS_PER_MINUTE ?? 8000);
const MIN_DELAY_MS = 1000;
/** Wait before replaying a case the provider rate-limited, if it gave no Retry-After. */
const RATE_LIMIT_WAIT_S = 20;

function modelOverride(argv: string[]): string | undefined {
  const index = argv.findIndex(
    (arg) => arg === '--model' || arg.startsWith('--model='),
  );
  if (index === -1) {
    return process.env.EVAL_MODEL?.trim() || undefined;
  }
  const arg = argv[index];
  return arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[index + 1];
}

/** Silence the pipeline's own log lines: the eval prints its own progress. */
const quietLogger = { log: () => undefined, debug: () => undefined };

async function main(): Promise<number> {
  const config = readLlmConfig(process.env);
  if (!config.enabled) {
    console.error(
      `Evaluation not run: the LLM is not configured (${config.reason}).\n` +
        'Set LLM_ENABLED=true, LLM_BASE_URL, LLM_API_KEY and LLM_MODEL in backend/.env (see .env.example).',
    );
    return 1;
  }
  const model = modelOverride(process.argv.slice(2)) ?? config.model;
  const client = new OpenAiCompatibleClient({ ...config, model });
  const provider = new URL(config.baseUrl).host;
  // Belt and braces: whatever a provider error echoes, the key never leaves.
  const redact = (text: string) => text.split(config.apiKey).join('[redacted]');

  console.log(
    `Evaluating ${CASES.length} cases on ${model} via ${provider} (real calls)…\n`,
  );
  const results: CaseResult[] = [];
  let llmCalls = 0;
  let rateLimitReplays = 0;
  let delayMs = MIN_DELAY_MS;
  /** Raised by a 429: never paced below it again during this run. */
  let floorMs = MIN_DELAY_MS;

  for (const [index, evalCase] of CASES.entries()) {
    if (index > 0) {
      await sleep(delayMs);
    }
    const context = { now: new Date(evalCase.now), timeZone: evalCase.tz };
    let outcome = await proposeTask(
      client,
      evalCase.input,
      context,
      quietLogger,
    );
    llmCalls += outcome.stats.attempts;
    if (!outcome.ok && outcome.kind === 'rate-limited') {
      // The provider's quota, not the model's quality: wait and replay once.
      const wait = Number(
        /retry after (\d+)/.exec(outcome.reason)?.[1] ?? RATE_LIMIT_WAIT_S,
      );
      floorMs = Math.max(floorMs, wait * 1000);
      console.log(`  rate limited, waiting ${wait} s…`);
      await sleep(wait * 1000);
      rateLimitReplays++;
      outcome = await proposeTask(client, evalCase.input, context, quietLogger);
      llmCalls += outcome.stats.attempts;
    }

    const score = outcome.ok
      ? scoreCase(evalCase, outcome.proposal)
      : scoreMissing(evalCase, outcome.kind);
    results.push({
      id: evalCase.id,
      category: evalCase.category,
      input: evalCase.input,
      tz: evalCase.tz,
      now: evalCase.now,
      outcome: outcome.ok ? 'ok' : outcome.kind,
      ...(outcome.ok ? {} : { reason: redact(outcome.reason) }),
      stats: outcome.stats,
      adjustments: outcome.ok ? outcome.adjustments : [],
      score,
      ...(evalCase.note ? { note: evalCase.note } : {}),
    });

    const tokens =
      (outcome.stats.inputTokens ?? 0) + (outcome.stats.outputTokens ?? 0);
    delayMs = Math.max(
      floorMs,
      Math.ceil((tokens / TOKENS_PER_MINUTE) * 60_000),
    );

    const misses = Object.entries(score.fields)
      .filter(([, f]) => f.score < 1)
      .map(([field, f]) => `${field}: want ${f.expected}, got ${f.got}`);
    const injection =
      score.resisted === undefined
        ? ''
        : score.resisted
          ? ' [injection resisted]'
          : ' [INJECTION FOLLOWED]';
    console.log(
      `${score.passed ? '✓' : '✗'} ${evalCase.id.padEnd(30)} ${String(outcome.stats.latencyMs).padStart(5)} ms` +
        `${outcome.stats.attempts > 1 ? ' (retried)' : ''}${injection}${misses.length ? `\n    ${misses.join('\n    ')}` : ''}`,
    );
  }

  const report = buildReport({
    model,
    provider,
    cases: CASES,
    results,
    llmCalls,
    rateLimitReplays,
  });
  mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = new URL(`${stamp}.json`, REPORTS_DIR);
  const mdPath = new URL(`${stamp}.md`, REPORTS_DIR);
  writeFileSync(jsonPath, redact(`${JSON.stringify(report, null, 2)}\n`));
  writeFileSync(mdPath, redact(toMarkdown(report)));

  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const ops = report.operations;
  console.log(`
── Summary ─────────────────────────────────────────────
Model        ${model} (${provider})
Cases        ${report.cases}, fully correct ${report.global.passed} (${pct(report.global.rate)}), mean score ${pct(report.global.meanScore)}
By category  ${Object.entries(report.byCategory)
    .map(([c, r]) => `${c} ${r.passed}/${r.total}`)
    .join(' · ')}
By field     ${Object.entries(report.byField)
    .map(([f, r]) => `${f} ${pct(r.rate)}`)
    .join(' · ')}
Injection    resisted ${report.injection.resisted}/${report.injection.total}
Latency      median ${ops.latencyMs.median} ms, p95 ${ops.latencyMs.p95} ms (min ${ops.latencyMs.min}, max ${ops.latencyMs.max})
Tokens       mean ${ops.inputTokens.mean} in / ${ops.outputTokens.mean} out per case
Calls        ${report.llmCalls} to the provider: ${report.llmCalls - ops.rateLimitReplays} answered, ${ops.rateLimitReplays} refused by its rate limit (then replayed); ${ops.retries} model retries
Reports      ${jsonPath.pathname}
             ${mdPath.pathname}`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    // A bug in the eval itself: say it plainly, no stack trace dump.
    console.error(
      `Evaluation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  },
);
