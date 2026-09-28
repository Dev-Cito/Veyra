import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { RATE_LIMIT_MESSAGE, RATE_LIMITS } from '../src/common/rate-limits.js';
import {
  createTestApp,
  randomClientIp,
  registerUser,
  type TestUser,
} from './utils.js';

// Production limits, unchanged: each block below uses its own client IPs, as
// distinct clients behind Render's proxy would.
describe('Rate limiting (e2e)', () => {
  let app: INestApplication;

  // Well formed but unknown: accepted by the pipe, rejected with 404.
  const unknownToken = 'A'.repeat(43);

  const from = (ip: string) => ({ 'X-Forwarded-For': ip });

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /invitations/accept', () => {
    let user: TestUser;
    let ip: string;

    const acceptFrom = (forwardedFor: string) =>
      user.agent
        .post('/invitations/accept')
        .set('X-Forwarded-For', forwardedFor)
        .send({ token: unknownToken });

    beforeAll(async () => {
      user = await registerUser(app);
      ip = randomClientIp();
      for (let i = 0; i < RATE_LIMITS.invitationAccept; i++) {
        await acceptFrom(ip).expect(404);
      }
    });

    it('429 with a neutral message beyond the limit', async () => {
      const res = await acceptFrom(ip).expect(429);
      expect(res.body.message).toBe(RATE_LIMIT_MESSAGE);
    });

    it('keys on the real client IP: another client is not affected', async () => {
      await acceptFrom(randomClientIp()).expect(404);
    });

    it('ignores what the client prepends to X-Forwarded-For', async () => {
      // The proxy appends the real address last; trust proxy = 1 reads only that.
      await acceptFrom(`${randomClientIp()}, ${ip}`).expect(429);
      await acceptFrom(`${ip}, ${randomClientIp()}`).expect(404);
    });

    it('throttles before authentication: anonymous floods get 429 too', async () => {
      const anonymousIp = randomClientIp();
      const anonymous = () =>
        request(app.getHttpServer())
          .post('/invitations/accept')
          .set(from(anonymousIp))
          .send({ token: unknownToken });
      for (let i = 0; i < RATE_LIMITS.invitationAccept; i++) {
        await anonymous().expect(401);
      }
      await anonymous().expect(429);
    });

    it('does not throttle authenticated routes', async () => {
      // Same client IP as the exhausted accept budget above.
      for (let i = 0; i < 30; i++) {
        await user.agent.get('/workspaces').set(from(ip)).expect(200);
        await user.agent.get('/auth/me').set(from(ip)).expect(200);
      }
    });
  });

  it('POST /invitations/preview: 20 per minute', async () => {
    const ip = randomClientIp();
    const preview = () =>
      request(app.getHttpServer())
        .post('/invitations/preview')
        .set(from(ip))
        .send({ token: unknownToken });
    for (let i = 0; i < RATE_LIMITS.invitationPreview; i++) {
      await preview().expect(404);
    }
    await preview().expect(429);
  });

  it('POST /auth/register: 5 per minute', async () => {
    const ip = randomClientIp();
    const register = () =>
      request(app.getHttpServer())
        .post('/auth/register')
        .set(from(ip))
        .send({
          email: `rl-${randomUUID()}@veyra.test`,
          name: 'R',
          password: 'correct-horse-battery',
        });
    for (let i = 0; i < RATE_LIMITS.register; i++) {
      await register().expect(201);
    }
    await register().expect(429);
  });

  it('POST /auth/login: 10 per minute', async () => {
    const ip = randomClientIp();
    const login = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .set(from(ip))
        .send({ email: 'nobody@veyra.test', password: 'wrong-password' });
    for (let i = 0; i < RATE_LIMITS.login; i++) {
      await login().expect(401);
    }
    await login().expect(429);
  });
});
