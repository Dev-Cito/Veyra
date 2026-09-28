import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MAIL_TRANSPORT,
  type MailTransport,
  readMailConfig,
} from './mail.config.js';
import {
  invitationMail,
  reminderMail,
  type RenderedMail,
} from './templates.js';

/** 'skipped': mail is disabled; nothing was attempted (not an error). */
export type MailOutcome = 'sent' | 'skipped' | 'failed';

/**
 * Sends email, or pretends to when mail is disabled. Never throws: a failed
 * send is logged and reported, so the business operation that triggered it
 * (an invitation, a reminder batch) is never undone by an SMTP problem.
 * No retry: see README, "Limitations connues".
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger('Mail');

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport | null,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const config = readMailConfig(process.env);
    if (this.transport && config.enabled) {
      this.logger.log(`Mail enabled through ${config.host}:${config.port}`);
    } else if (!this.transport) {
      const disabled = `Mail disabled (${config.enabled ? 'no transport' : config.reason}): messages are logged, not sent`;
      // Asking for mail and not getting it deserves a warning; not asking does not.
      if (process.env.MAIL_ENABLED === 'true') {
        this.logger.warn(disabled);
      } else {
        this.logger.log(disabled);
      }
    }
  }

  /** A link into the frontend, e.g. link('/invite', { token }). */
  link(path: string, query?: Record<string, string>): string {
    const base = (this.config.get<string>('FRONTEND_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    const search = query ? `?${new URLSearchParams(query).toString()}` : '';
    return `${base}${path}${search}`;
  }

  /**
   * The raw token only exists in the body of this email (and in the creation
   * response). It is passed as `secrets` so that no log line can contain it.
   */
  sendInvitation(params: {
    to: string;
    workspaceName: string;
    inviterName: string | null;
    role: string;
    token: string;
    expiresAt: Date;
  }): Promise<MailOutcome> {
    const mail = invitationMail({
      ...params,
      link: this.link('/invite', { token: params.token }),
    });
    return this.send(params.to, mail, [params.token]);
  }

  sendReminder(params: {
    to: string;
    taskTitle: string;
    dueDate: Date;
    boardId: string;
    boardName: string;
    listName: string;
  }): Promise<MailOutcome> {
    const mail = reminderMail({
      ...params,
      link: this.link(`/boards/${encodeURIComponent(params.boardId)}`),
    });
    return this.send(params.to, mail);
  }

  /**
   * Logs only recipient and subject, never the body. An error message can
   * echo the message itself (some SMTP servers do): it is logged with every
   * secret redacted, and without its stack, which repeats the message.
   */
  private async send(
    to: string,
    mail: RenderedMail,
    secrets: string[] = [],
  ): Promise<MailOutcome> {
    if (!this.transport) {
      this.logger.debug(
        `Mail disabled, not sending "${mail.subject}" to ${to}`,
      );
      return 'skipped';
    }
    try {
      await this.transport.sendMail({
        from: this.config.get<string>('MAIL_FROM') ?? '',
        to,
        ...mail,
      });
      return 'sent';
    } catch (err) {
      // Redact BEFORE truncating: a cut through a secret would leave half of
      // it unmatched by the redaction.
      const reason = redact(describeError(err), secrets).slice(0, 500);
      this.logger.error(`Failed to send "${mail.subject}" to ${to}: ${reason}`);
      return 'failed';
    }
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? `${code} ${err.message}` : err.message;
  }
  return 'unknown error';
}

function redact(text: string, secrets: string[]): string {
  return secrets.reduce(
    (result, secret) =>
      secret ? result.split(secret).join('[redacted]') : result,
    text,
  );
}
