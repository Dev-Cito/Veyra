import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { MAIL_TRANSPORT, type MailTransport } from '../src/mail/mail.config.js';
import { WorkspaceMember } from '../src/workspaces/entities/workspace-member.entity.js';
import {
  MembershipStatus,
  type WorkspaceRole,
} from '../src/workspaces/workspace.enums.js';

export interface TestAppOptions {
  /** Replaces the (disabled) mail transport, e.g. with an InMemoryTransport. */
  mailTransport?: MailTransport;
  /** Receives every log line, all levels (Nest's test logger drops most). */
  logger?: LoggerService;
}

export async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.mailTransport) {
    builder = builder
      .overrideProvider(MAIL_TRANSPORT)
      .useValue(options.mailTransport);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  if (options.logger) {
    app.useLogger(options.logger);
  }
  configureApp(app);
  // Listen once, on 127.0.0.1 explicitly. Otherwise supertest calls
  // listen(0) per request on the dual-stack wildcard (::), and on macOS the
  // kernel may hand out a port that another local program already holds on
  // 127.0.0.1 only; supertest then connects to 127.0.0.1:<port> and that
  // program answers (random 401 / 404 responses from outside the app).
  await app.listen(0, '127.0.0.1');
  return app;
}

export interface TestUser {
  id: string;
  email: string;
  /** Cookie-persisting client, authenticated as this user. */
  agent: TestAgent;
}

/**
 * A distinct client IP, sent as X-Forwarded-For. With trust proxy, req.ip
 * resolves to it as it would behind Render's proxy, so each simulated user
 * gets its own rate-limit budget: production limits apply unchanged.
 */
export function randomClientIp(): string {
  const byte = () => Math.floor(Math.random() * 254) + 1;
  return `10.${byte()}.${byte()}.${byte()}`;
}

/** A cookie-persisting client with its own client IP. */
export function newAgent(app: INestApplication): TestAgent {
  return request
    .agent(app.getHttpServer())
    .set('X-Forwarded-For', randomClientIp());
}

export async function registerUser(
  app: INestApplication,
  name = 'Test User',
): Promise<TestUser> {
  const agent = newAgent(app);
  const email = `user-${randomUUID()}@veyra.test`;
  const res = await agent
    .post('/auth/register')
    .send({ email, name, password: 'correct-horse-battery' })
    .expect(201);
  return { id: res.body.id, email, agent };
}

export async function createWorkspace(
  owner: TestUser,
  name = 'Acme Team',
): Promise<{ id: string }> {
  const res = await owner.agent.post('/workspaces').send({ name }).expect(201);
  return res.body as { id: string };
}

/**
 * There is no invitation endpoint yet, so memberships other than the
 * creator's are inserted directly.
 */
export function addMember(
  app: INestApplication,
  workspaceId: string,
  user: TestUser,
  role: WorkspaceRole,
  status = MembershipStatus.ACTIVE,
): Promise<WorkspaceMember> {
  return app
    .get(DataSource)
    .getRepository(WorkspaceMember)
    .save({
      workspaceId,
      userId: user.id,
      role,
      status,
      joinedAt: status === MembershipStatus.ACTIVE ? new Date() : null,
    });
}

type SentMail = Parameters<MailTransport['sendMail']>[0];

/** Records messages in memory; never opens a socket. */
export class InMemoryTransport implements MailTransport {
  readonly sent: SentMail[] = [];
  /** Set to make every send fail with this error. */
  failWith: Error | null = null;
  /**
   * Make every send fail with an error that echoes the whole message, body
   * included, as some SMTP servers do: the worst case for secrets in logs.
   */
  failEchoingMessage = false;
  /** Artificial latency, to let concurrent runs overlap. */
  delayMs = 0;

  async sendMail(message: SentMail): Promise<void> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (this.failWith) {
      throw this.failWith;
    }
    if (this.failEchoingMessage) {
      throw new Error(
        `550 rejected: ${message.text} ${JSON.stringify(message)}`,
      );
    }
    this.sent.push(message);
  }
}

/** Captures every log line, whatever its level. */
export class CapturingLogger implements LoggerService {
  readonly lines: string[] = [];
  private record(level: string, message: unknown, rest: unknown[]) {
    this.lines.push([level, message, ...rest].map(String).join(' '));
  }
  log(message: unknown, ...rest: unknown[]) {
    this.record('log', message, rest);
  }
  error(message: unknown, ...rest: unknown[]) {
    this.record('error', message, rest);
  }
  warn(message: unknown, ...rest: unknown[]) {
    this.record('warn', message, rest);
  }
  debug(message: unknown, ...rest: unknown[]) {
    this.record('debug', message, rest);
  }
  verbose(message: unknown, ...rest: unknown[]) {
    this.record('verbose', message, rest);
  }
}
