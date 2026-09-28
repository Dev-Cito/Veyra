import nodemailer from 'nodemailer';

/** Anything that can deliver a message: Nodemailer's transporter, or a test fake. */
export interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<unknown>;
}

/** Injection token; null means "mail disabled". */
export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

export type MailConfig =
  | { enabled: false; reason: string }
  | {
      enabled: true;
      host: string;
      port: number;
      secure: boolean;
      user?: string;
      password?: string;
      from: string;
      frontendUrl: string;
    };

/**
 * Reads the SMTP settings. Never throws: with MAIL_ENABLED other than 'true'
 * or an incomplete configuration, mail is simply disabled, so the app boots
 * on Render (and in tests) without any SMTP credentials.
 */
export function readMailConfig(env: NodeJS.ProcessEnv): MailConfig {
  if (env.MAIL_ENABLED !== 'true') {
    return { enabled: false, reason: 'MAIL_ENABLED is not "true"' };
  }
  const missing = [
    'SMTP_HOST',
    'SMTP_PORT',
    'MAIL_FROM',
    'FRONTEND_URL',
  ].filter((name) => !env[name]);
  // Credentials go together: one without the other is a misconfiguration.
  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
    missing.push(env.SMTP_USER ? 'SMTP_PASSWORD' : 'SMTP_USER');
  }
  const port = Number(env.SMTP_PORT);
  if (env.SMTP_PORT && !(Number.isInteger(port) && port > 0)) {
    missing.push('SMTP_PORT (not a valid port)');
  }
  if (missing.length > 0) {
    return { enabled: false, reason: `missing ${missing.join(', ')}` };
  }
  return {
    enabled: true,
    host: env.SMTP_HOST!,
    port,
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER || undefined,
    password: env.SMTP_PASSWORD || undefined,
    from: env.MAIL_FROM!,
    frontendUrl: env.FRONTEND_URL!,
  };
}

/**
 * Nodemailer connects lazily, on the first send: creating the transporter
 * opens no socket. Timeouts are tightened from Nodemailer's defaults (up to
 * two minutes) since the invitation request waits for the send.
 */
export function createMailTransport(config: MailConfig): MailTransport | null {
  if (!config.enabled) {
    return null;
  }
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user
      ? { user: config.user, pass: config.password }
      : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}
