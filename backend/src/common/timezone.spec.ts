import { isTimeZone } from './timezone.js';

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
