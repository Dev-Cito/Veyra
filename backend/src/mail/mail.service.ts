import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FALLBACK_TIMEZONE, isTimeZone } from '../common/timezone.js';
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
  /** For recipients whose zone is unknown (no account, or none recorded). */
  private readonly defaultTimeZone: string;

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport | null,
    private readonly config: ConfigService,
  ) {
    const configured = this.config.get<string>('DEFAULT_TIMEZONE');
    this.defaultTimeZone = isTimeZone(configured)
      ? configured
      : FALLBACK_TIMEZONE;
  }

  onModuleInit(): void {
    const configured = this.config.get<string>('DEFAULT_TIMEZONE');
    if (configured && configured !== this.defaultTimeZone) {
      this.logger.warn(
        `DEFAULT_TIMEZONE is not a valid IANA time zone, using ${FALLBACK_TIMEZONE}`,
      );
    }
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

  /**
   * A link into the frontend. `fragment` values go after `#`: browsers never
   * send the fragment to a server, so a secret there reaches no access log.
   */
  link(path: string, fragment?: Record<string, string>): string {
    const base = (this.config.get<string>('FRONTEND_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    const hash = fragment ? `#${new URLSearchParams(fragment).toString()}` : '';
    return `${base}${path}${hash}`;
  }

  /**
   * The zone dates are shown in. A stored zone was validated on the way in;
   * it is checked again since only a valid id may reach Intl formatting.
   */
  timeZoneFor(recipientTimeZone: string | null | undefined): string {
    return isTimeZone(recipientTimeZone)
      ? recipientTimeZone
      : this.defaultTimeZone;
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
    /** The invitee's, if they already have an account. */
    timeZone: string | null;
  }): Promise<MailOutcome> {
    const mail = invitationMail({
      ...params,
      link: this.link('/invite', { token: params.token }),
      timeZone: this.timeZoneFor(params.timeZone),
    });
    return this.send(params.to, mail, [params.token]);
  }

  sendReminder(params: {
    to: string;
    taskTitle: string;
    dueDate: Date;
    workspaceId: string;
    boardId: string;
    boardName: string;
    listName: string;
    timeZone: string | null;
  }): Promise<MailOutcome> {
    const mail = reminderMail({
      ...params,
      link: this.link(
        `/w/${encodeURIComponent(params.workspaceId)}/b/${encodeURIComponent(params.boardId)}`,
      ),
      timeZone: this.timeZoneFor(params.timeZone),
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
