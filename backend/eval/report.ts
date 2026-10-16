import type { ParseStats } from '../src/tasks/parse/task-parser.service.js';
import type { Category, EvalCase } from './cases.js';
import { type CaseScore, FIELDS, type Field } from './scoring.js';

/** One case, as run: what the pipeline answered and how it scored. */
export interface CaseResult {
  id: string;
  category: Category;
  input: string;
  tz: string;
  now: string;
  /** ok | unusable | timeout | rate-limited | provider */
  outcome: string;
  /** For a failed parse: why (never the key). */
  reason?: string;
  stats: ParseStats;
  adjustments: string[];
  score: CaseScore;
  note?: string;
}

export interface Rate {
  passed: number;
  total: number;
  rate: number;
  /** Mean score (0..1), partial credit included. */
  meanScore: number;
}

export interface Distribution {
  min: number;
  median: number;
  p95: number;
  max: number;
  mean: number;
}

export interface Report {
  generatedAt: string;
  model: string;
  provider: string;
  cases: number;
  /** Calls made to the provider, retries included. */
  llmCalls: number;
  global: Rate;
  byCategory: Record<string, Rate>;
  byField: Record<Field, Rate>;
  injection: { resisted: number; total: number; rate: number };
  operations: {
    latencyMs: Distribution;
    inputTokens: Distribution;
    outputTokens: Distribution;
    /** Cases whose first answer was rejected and retried. */
    retries: number;
    outcomes: Record<string, number>;
    adjustments: Record<string, number>;
    /** Cases replayed after the provider's own rate limit. */
    rateLimitReplays: number;
  };
  results: CaseResult[];
}

const ratio = (passed: number, total: number) =>
  total === 0 ? 0 : passed / total;

function rate(scores: { passed: boolean; score: number }[]): Rate {
  const passed = scores.filter((s) => s.passed).length;
  return {
    passed,
    total: scores.length,
    rate: ratio(passed, scores.length),
    meanScore: ratio(
      scores.reduce((sum, s) => sum + s.score, 0),
      scores.length,
    ),
  };
}

/** Nearest-rank percentile. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  return sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ];
}

export function distribution(values: number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0] ?? 0,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted.at(-1) ?? 0,
    mean: Math.round(
      ratio(
        sorted.reduce((sum, v) => sum + v, 0),
        sorted.length,
      ),
    ),
  };
}

const count = (values: string[]) =>
  values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});

export function buildReport(input: {
  model: string;
  provider: string;
  cases: EvalCase[];
  results: CaseResult[];
  llmCalls: number;
  rateLimitReplays: number;
}): Report {
  const { results } = input;
  const categories = [...new Set(input.cases.map((c) => c.category))];
  const injections = results.filter((r) => r.score.resisted !== undefined);
  const resisted = injections.filter((r) => r.score.resisted).length;
  const tokens = (key: 'inputTokens' | 'outputTokens') =>
    results.map((r) => r.stats[key]).filter((v): v is number => v !== null);

  return {
    generatedAt: new Date().toISOString(),
    model: input.model,
    provider: input.provider,
    cases: results.length,
    llmCalls: input.llmCalls,
    global: rate(results.map((r) => r.score)),
    byCategory: Object.fromEntries(
      categories.map((category) => [
        category,
        rate(
          results.filter((r) => r.category === category).map((r) => r.score),
        ),
      ]),
    ),
    byField: Object.fromEntries(
      FIELDS.map((field) => [
        field,
        rate(
          results.map((r) => ({
            passed: r.score.fields[field].score === 1,
            score: r.score.fields[field].score,
          })),
        ),
      ]),
    ) as Record<Field, Rate>,
    injection: {
      resisted,
      total: injections.length,
      rate: ratio(resisted, injections.length),
    },
    operations: {
      latencyMs: distribution(results.map((r) => r.stats.latencyMs)),
      inputTokens: distribution(tokens('inputTokens')),
      outputTokens: distribution(tokens('outputTokens')),
      retries: results.filter((r) => r.stats.attempts > 1).length,
      outcomes: count(results.map((r) => r.outcome)),
      adjustments: count(results.flatMap((r) => r.adjustments)),
      rateLimitReplays: input.rateLimitReplays,
    },
    results,
  };
}

const pct = (value: number) => `${Math.round(value * 100)}%`;
const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function toMarkdown(report: Report): string {
  const ops = report.operations;
  const lines: string[] = [
    `# Task parsing evaluation — ${report.model}`,
    '',
    `${report.generatedAt} · provider ${report.provider} · ${report.cases} cases · ${report.llmCalls} LLM calls`,
    '',
    '## Scores',
    '',
    `Global: **${report.global.passed}/${report.global.total} cases fully correct (${pct(report.global.rate)})**, mean field score ${pct(report.global.meanScore)}. Injection resisted: **${report.injection.resisted}/${report.injection.total}**.`,
    '',
    '| Category | Fully correct | Rate | Mean score |',
    '| --- | --- | --- | --- |',
    ...Object.entries(report.byCategory).map(
      ([category, r]) =>
        `| ${category} | ${r.passed}/${r.total} | ${pct(r.rate)} | ${pct(r.meanScore)} |`,
    ),
    '',
    '| Field | Correct | Rate | Mean score |',
    '| --- | --- | --- | --- |',
    ...FIELDS.map((field) => {
      const r = report.byField[field];
      return `| ${field} | ${r.passed}/${r.total} | ${pct(r.rate)} | ${pct(r.meanScore)} |`;
    }),
    '',
    'A title counts as correct when it matches exactly or after normalisation (case, spacing, trailing punctuation); a near miss (similarity ≥ 0.85) scores 0.5.',
    '',
    '## Operations',
    '',
    '| Metric | Min | Median | p95 | Max | Mean |',
    '| --- | --- | --- | --- | --- | --- |',
    ...(
      [
        ['Latency (ms)', ops.latencyMs],
        ['Input tokens', ops.inputTokens],
        ['Output tokens', ops.outputTokens],
      ] as const
    ).map(
      ([label, d]) =>
        `| ${label} | ${d.min} | ${d.median} | ${d.p95} | ${d.max} | ${d.mean} |`,
    ),
    '',
    `Retries (first answer rejected): ${ops.retries}. Outcomes: ${Object.entries(
      ops.outcomes,
    )
      .map(([k, v]) => `${k} ${v}`)
      .join(
        ', ',
      )}. Calls refused by the provider's rate limit (then replayed): ${ops.rateLimitReplays}.`,
    '',
    'Adjustments applied to the model output:',
    '',
    ...(Object.keys(ops.adjustments).length === 0
      ? ['- none']
      : Object.entries(ops.adjustments).map(
          ([adjustment, n]) => `- ${adjustment} (${n})`,
        )),
    '',
    '## Injection cases',
    '',
    '| Case | Resisted | Followed |',
    '| --- | --- | --- |',
    ...report.results
      .filter((r) => r.score.resisted !== undefined)
      .map(
        (r) =>
          `| ${r.id} | ${r.score.resisted ? 'yes' : '**no**'} | ${r.score.followed?.join(', ') || '—'} |`,
      ),
    '',
    '## Failures',
    '',
  ];

  const failures = report.results.filter((r) => !r.score.passed);
  if (failures.length === 0) {
    lines.push('None: every case is fully correct.');
  }
  for (const r of failures) {
    lines.push(`### ${r.id} (${r.category})`, '', `> ${cell(r.input)}`, '');
    if (r.outcome !== 'ok') {
      lines.push(
        `Outcome: **${r.outcome}**${r.reason ? ` — ${cell(r.reason)}` : ''}`,
        '',
      );
    }
    lines.push(
      '| Field | Expected | Got | Verdict |',
      '| --- | --- | --- | --- |',
    );
    for (const field of FIELDS) {
      const f = r.score.fields[field];
      if (f.score < 1) {
        lines.push(
          `| ${field} | ${cell(f.expected)} | ${cell(f.got)} | ${f.verdict} |`,
        );
      }
    }
    if (r.note) {
      lines.push('', `Note: ${r.note}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
