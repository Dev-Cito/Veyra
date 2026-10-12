import {
  formatOffset,
  isTimeZone,
  localParts,
  resolveTimeZone,
  utcOffsetMinutes,
  zonedToInstant,
} from './timezone.js';

describe('isTimeZone', () => {
  it('accepts IANA ids, UTC, and the newer spellings browsers send', () => {
    for (const zone of [
      'Africa/Kigali',
      'Europe/Paris',
      'America/Argentina/Buenos_Aires',
      'UTC',
      'Asia/Kolkata',
      'Europe/Kyiv',
    ]) {
      expect(isTimeZone(zone)).toBe(true);
    }
  });

  it('rejects anything else, without throwing', () => {
    for (const value of [
      'Mars/Olympus',
      'Africa/Kigali\0',
      '',
      ' Africa/Kigali',
      '+02:00',
      'Africa/'.padEnd(80, 'x'),
      null,
      undefined,
      42,
      ['Africa/Kigali'],
    ]) {
      expect(isTimeZone(value)).toBe(false);
    }
  });
});

describe('zoned conversions', () => {
  it('reads the wall clock and the offset of a zone', () => {
    const instant = new Date('2026-10-01T23:30:00Z');
    expect(localParts(instant, 'Africa/Kigali')).toMatchObject({
      year: 2026,
      month: 10,
      day: 2,
      hour: 1,
      minute: 30,
      weekday: 'Friday',
    });
    expect(utcOffsetMinutes(instant, 'Africa/Kigali')).toBe(120);
    expect(utcOffsetMinutes(instant, 'America/New_York')).toBe(-240);
    expect(formatOffset(-330)).toBe('-05:30');
  });

  it('turns a local time into the right instant, DST included', () => {
    const at = (zone: string, hour = 17) =>
      zonedToInstant(
        { year: 2026, month: 10, day: 16, hour, minute: 0 },
        zone,
      )?.toISOString();
    expect(at('Africa/Kigali')).toBe('2026-10-16T15:00:00.000Z');
    expect(at('UTC')).toBe('2026-10-16T17:00:00.000Z');
    // Paris leaves summer time on 2026-10-25: 17:00 is 15:00Z before, 16:00Z after.
    expect(
      zonedToInstant(
        { year: 2026, month: 10, day: 24, hour: 17, minute: 0 },
        'Europe/Paris',
      )?.toISOString(),
    ).toBe('2026-10-24T15:00:00.000Z');
    expect(
      zonedToInstant(
        { year: 2026, month: 10, day: 26, hour: 17, minute: 0 },
        'Europe/Paris',
      )?.toISOString(),
    ).toBe('2026-10-26T16:00:00.000Z');
  });

  it('rejects impossible dates', () => {
    expect(
      zonedToInstant(
        { year: 2026, month: 2, day: 30, hour: 17, minute: 0 },
        'UTC',
      ),
    ).toBeNull();
    expect(
      zonedToInstant(
        { year: 2026, month: 2, day: 3, hour: 24, minute: 0 },
        'UTC',
      ),
    ).toBeNull();
  });

  it('resolves the zone to use', () => {
    expect(resolveTimeZone('Asia/Tokyo', 'Africa/Kigali')).toBe('Asia/Tokyo');
    expect(resolveTimeZone(null, 'Europe/Paris')).toBe('Europe/Paris');
    expect(resolveTimeZone('Mars/Olympus', 'Nope/Nope')).toBe('Africa/Kigali');
  });
});
