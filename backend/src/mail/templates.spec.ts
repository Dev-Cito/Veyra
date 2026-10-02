import { formatDate, reminderMail } from './templates.js';

// 23:30 UTC on Thursday: already Friday in Kigali (UTC+2).
const DUE = new Date('2026-10-01T23:30:00Z');

const reminder = (timeZone: string) =>
  reminderMail({
    taskTitle: 'Ship v1',
    dueDate: DUE,
    boardName: 'Roadmap',
    listName: 'Doing',
    link: 'http://localhost:3000/w/ws-1/b/board-1',
    timeZone,
  });

describe('formatDate', () => {
  it('formats the same instant differently in two zones', () => {
    expect(formatDate(DUE, 'Africa/Kigali')).not.toBe(
      formatDate(DUE, 'America/New_York'),
    );
  });

  it("shows the recipient's local day, which may differ from UTC's", () => {
    expect(formatDate(DUE, 'Africa/Kigali')).toBe(
      'vendredi 2 octobre 2026 à 01:30',
    );
    expect(formatDate(DUE, 'UTC')).toBe('jeudi 1 octobre 2026 à 23:30');
  });
});

describe('reminderMail', () => {
  it('shows the local date, without a "(UTC)" mention, in both parts', () => {
    const mail = reminder('Africa/Kigali');
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain('vendredi 2 octobre 2026 à 01:30');
      expect(part).not.toContain('UTC');
    }
  });

  it('says Tableau and Colonne, in both parts', () => {
    const mail = reminder('Africa/Kigali');
    expect(mail.html).toContain('Tableau : Roadmap<br>Colonne : Doing');
    expect(mail.text).toContain('Tableau : Roadmap\nColonne : Doing');
    for (const part of [mail.html, mail.text]) {
      expect(part).not.toMatch(/\bBoard\b|\bListe\b/);
    }
  });
});
