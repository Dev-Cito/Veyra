import type { ConfigService } from '@nestjs/config';
import type { MailTransport } from './mail.config.js';
import { MailService } from './mail.service.js';

const DUE = new Date('2026-10-01T23:30:00Z');

function serviceWith(env: Record<string, string | undefined>) {
  const sent: { html: string; text: string }[] = [];
  const transport: MailTransport = {
    sendMail: (message) => {
      sent.push(message);
      return Promise.resolve();
    },
  };
  const config = { get: (key: string) => env[key] } as ConfigService;
  return { mail: new MailService(transport, config), sent };
}

const remind = (mail: MailService, timeZone: string | null) =>
  mail.sendReminder({
    to: 'member@veyra.test',
    taskTitle: 'Ship v1',
    dueDate: DUE,
    workspaceId: 'ws-1',
    boardId: 'board-1',
    boardName: 'Roadmap',
    listName: 'Doing',
    timeZone,
  });

describe('MailService time zones', () => {
  it("uses the recipient's zone when known", async () => {
    const { mail, sent } = serviceWith({ DEFAULT_TIMEZONE: 'Africa/Kigali' });
    await remind(mail, 'America/New_York');
    expect(sent[0].text).toContain('jeudi 1 octobre 2026 à 19:30');
  });

  it('falls back to DEFAULT_TIMEZONE for a recipient without one', async () => {
    const { mail, sent } = serviceWith({ DEFAULT_TIMEZONE: 'Asia/Tokyo' });
    await remind(mail, null);
    expect(sent[0].text).toContain('vendredi 2 octobre 2026 à 08:30');
  });

  it('defaults to Africa/Kigali when DEFAULT_TIMEZONE is unset or invalid', async () => {
    for (const DEFAULT_TIMEZONE of [undefined, 'Mars/Olympus']) {
      const { mail, sent } = serviceWith({ DEFAULT_TIMEZONE });
      await remind(mail, null);
      expect(sent[0].text).toContain('vendredi 2 octobre 2026 à 01:30');
    }
  });

  it('never formats with an invalid stored zone: the default is used', async () => {
    const { mail, sent } = serviceWith({ DEFAULT_TIMEZONE: 'Africa/Kigali' });
    await remind(mail, 'Not/AZone');
    expect(sent[0].text).toContain('vendredi 2 octobre 2026 à 01:30');
  });

  it('links to the board inside its workspace', async () => {
    const { mail, sent } = serviceWith({
      FRONTEND_URL: 'http://localhost:3000/',
    });
    await remind(mail, null);
    expect(sent[0].text).toContain('http://localhost:3000/w/ws-1/b/board-1');
    expect(sent[0].html).toContain(
      'href="http://localhost:3000/w/ws-1/b/board-1"',
    );
  });
});
