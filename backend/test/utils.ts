import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { WorkspaceMember } from '../src/workspaces/entities/workspace-member.entity.js';
import {
  MembershipStatus,
  type WorkspaceRole,
} from '../src/workspaces/workspace.enums.js';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
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
