import { buildSystemPrompt } from './task-parse.prompt.js';
import { normalizeProposal, parseDueDate } from './task-proposal.js';

const KIGALI = 'Africa/Kigali';

describe('parseDueDate', () => {
  it('reads the formats models send, in the user time zone', () => {
    expect(parseDueDate('2026-10-16T09:30', KIGALI)?.toISOString()).toBe(
      '2026-10-16T07:30:00.000Z',
    );
    expect(parseDueDate('2026-10-16 09:30:00', KIGALI)?.toISOString()).toBe(
      '2026-10-16T07:30:00.000Z',
    );
    // A bare date: 17:00 local.
    expect(parseDueDate('2026-10-16', KIGALI)?.toISOString()).toBe(
      '2026-10-16T15:00:00.000Z',
    );
    // An explicit instant is taken as is.
    expect(parseDueDate('2026-10-16T09:30:00Z', KIGALI)?.toISOString()).toBe(
      '2026-10-16T09:30:00.000Z',
    );
    expect(
      parseDueDate('2026-10-16T09:30:00-05:00', KIGALI)?.toISOString(),
    ).toBe('2026-10-16T14:30:00.000Z');
  });

  it('rejects anything else', () => {
    for (const value of [
      '16/10/2026',
      'next friday',
      '2026-13-01',
      '2026-02-30T10:00',
      '2026-10-16T25:00',
    ]) {
      expect(parseDueDate(value, KIGALI)).toBeNull();
    }
  });
});

describe('normalizeProposal', () => {
  const now = new Date('2026-10-12T10:00:00Z');
  const run = (value: unknown) =>
    normalizeProposal(
      typeof value === 'string' ? value : JSON.stringify(value),
      { now, timeZone: KIGALI },
    );

  it('accepts lowercase enum values, trims the title', () => {
    const result = run({
      title: '  Revoir  ',
      dueDate: null,
      priority: 'high',
      confidence: 'HIGH',
    });
    expect(result).toEqual({
      ok: true,
      proposal: {
        title: 'Revoir',
        dueDate: null,
        priority: 'HIGH',
        confidence: 'high',
      },
      adjustments: [],
    });
  });

  it('rejects what is not a JSON object with a title', () => {
    for (const value of [
      '',
      '[]',
      '"text"',
      'null',
      '{}',
      JSON.stringify({ title: '   ' }),
      JSON.stringify({ title: 42 }),
    ]) {
      expect(run(value).ok).toBe(false);
    }
  });

  it('records each repair', () => {
    const result = run({
      title: 'T',
      dueDate: '2026-10-01T10:00',
      priority: 'URGENT',
      confidence: 'sure',
    });
    expect(result.ok && result.adjustments).toEqual([
      'priority "URGENT" -> MEDIUM',
      'confidence "sure" -> low',
      'dueDate in the past -> null',
    ]);
  });
});

describe('buildSystemPrompt', () => {
  it("states the user's current date, time, zone and offset, and the coming weekdays", () => {
    // Friday 2026-10-16, 12:00 UTC = 14:00 in Kigali.
    const prompt = buildSystemPrompt(new Date('2026-10-16T12:00:00Z'), KIGALI);
    expect(prompt).toContain(
      'Friday 2026-10-16 14:00, time zone Africa/Kigali (UTC+02:00)',
    );
    expect(prompt).toContain('- Saturday 2026-10-17');
    // On a Friday, "vendredi" is the Friday one week later: it is in the list.
    expect(prompt).toContain('- Friday 2026-10-23');
    expect(prompt).toContain('never today');
  });
});
