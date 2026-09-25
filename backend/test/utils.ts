import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export interface TestUser {
  id: string;
  email: string;
  /** Cookie-persisting client, authenticated as this user. */
  agent: TestAgent;
}

export async function registerUser(
  app: INestApplication,
  name = 'Test User',
): Promise<TestUser> {
  const agent = request.agent(app.getHttpServer());
  const email = `user-${randomUUID()}@veyra.test`;
  const res = await agent
    .post('/auth/register')
    .send({ email, name, password: 'correct-horse-battery' })
    .expect(201);
  return { id: res.body.id, email, agent };
}
