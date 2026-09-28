import { escapeHtml as e, oneLine } from './escape-html.js';

/**
 * Plain string interpolation: two emails do not justify a template engine.
 * Every email has an HTML and a plain-text part. In the HTML part, every
 * interpolated value is escaped (e); the text part needs no escaping.
 */
export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'administrateur',
  MEMBER: 'membre',
};

// Recipients' time zones are unknown: dates are shown in UTC, explicitly.
const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'full',
  timeStyle: 'short',
  timeZone: 'UTC',
});
const formatDate = (date: Date) => `${DATE_FORMAT.format(date)} (UTC)`;

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
  <body style="font-family: Arial, sans-serif; color: #1f2933; line-height: 1.5;">
    <h1 style="font-size: 20px;">${e(title)}</h1>
    ${body}
    <p style="color: #7b8794; font-size: 12px;">Veyra</p>
  </body>
</html>`;
}

function button(href: string, label: string): string {
  return `<p><a href="${e(href)}" style="display: inline-block; padding: 10px 16px; background: #3f51b5; color: #ffffff; text-decoration: none; border-radius: 4px;">${e(label)}</a></p>
    <p style="font-size: 12px;">Ou copiez ce lien : ${e(href)}</p>`;
}

export function invitationMail(params: {
  workspaceName: string;
  inviterName: string | null;
  role: string;
  link: string;
  expiresAt: Date;
}): RenderedMail {
  const inviter = params.inviterName ?? 'Un membre';
  const role = ROLE_LABELS[params.role] ?? params.role;
  const expires = formatDate(params.expiresAt);
  const subject = oneLine(`Invitation à rejoindre ${params.workspaceName}`);

  const html = layout(
    subject,
    `<p><strong>${e(inviter)}</strong> vous invite à rejoindre l'espace de travail <strong>${e(params.workspaceName)}</strong> en tant que ${e(role)}.</p>
    ${button(params.link, "Voir l'invitation")}
    <p>Cette invitation expire le ${e(expires)}.</p>`,
  );
  const text = [
    `${inviter} vous invite à rejoindre l'espace de travail "${params.workspaceName}" en tant que ${role}.`,
    '',
    `Voir l'invitation : ${params.link}`,
    '',
    `Cette invitation expire le ${expires}.`,
  ].join('\n');
  return { subject, html, text };
}

export function reminderMail(params: {
  taskTitle: string;
  dueDate: Date;
  boardName: string;
  listName: string;
  link: string;
}): RenderedMail {
  const due = formatDate(params.dueDate);
  const subject = oneLine(`Échéance proche pour ${params.taskTitle}`);

  const html = layout(
    subject,
    `<p>La tâche <strong>${e(params.taskTitle)}</strong> arrive à échéance le ${e(due)}.</p>
    <p>Board : ${e(params.boardName)}<br>Liste : ${e(params.listName)}</p>
    ${button(params.link, 'Ouvrir le board')}`,
  );
  const text = [
    `La tâche "${params.taskTitle}" arrive à échéance le ${due}.`,
    '',
    `Board : ${params.boardName}`,
    `Liste : ${params.listName}`,
    '',
    `Ouvrir le board : ${params.link}`,
  ].join('\n');
  return { subject, html, text };
}
