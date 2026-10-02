import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { User } from '../src/users/user.entity.js';
import { createTestApp, newAgent, registerUser } from './utils.js';

describe('App & auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('sets an httpOnly cookie on register and authenticates /auth/me', async () => {
    const user = await registerUser(app, 'Ada');
    const me = await user.agent.get('/auth/me').expect(200);
    expect(me.body).toMatchObject({ id: user.id, email: user.email });
    expect(me.body).not.toHaveProperty('passwordHash');
  });

  it('logs in, and rejects bad credentials', async () => {
    const user = await registerUser(app);
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'correct-horse-battery' })
      .expect(200);
    expect(res.headers['set-cookie']?.[0]).toMatch(/access_token=.+HttpOnly/i);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'wrong-password' })
      .expect(401);
  });

  it('logs out by clearing the cookie', async () => {
    const user = await registerUser(app);
    await user.agent.post('/auth/logout').expect(204);
    await user.agent.get('/auth/me').expect(401);
  });

  describe('timezone at registration', () => {
    const register = (timezone: unknown) =>
      newAgent(app)
        .post('/auth/register')
        .send({
          email: `tz-${randomUUID()}@veyra.test`,
          name: 'Tz',
          password: 'correct-horse-battery',
          timezone,
        });
    const storedTimezone = async (id: string) =>
      (await app.get(DataSource).getRepository(User).findOneByOrFail({ id }))
        .timezone;

    it('stores a valid IANA zone, including the spellings browsers send', async () => {
      for (const zone of ['Africa/Kigali', 'Asia/Kolkata', 'UTC']) {
        const res = await register(zone).expect(201);
        expect(await storedTimezone(res.body.id)).toBe(zone);
      }
    });

    it('is optional: absent or null stores null', async () => {
      for (const zone of [undefined, null]) {
        const res = await register(zone).expect(201);
        expect(await storedTimezone(res.body.id)).toBeNull();
      }
    });

    it('rejects an invalid zone with 400, never 500', async () => {
      for (const zone of [
        'Mars/Olympus',
        'Africa/Kigali\0',
        '',
        'x'.repeat(200),
        42,
        { zone: 'UTC' },
      ]) {
        const res = await register(zone).expect(400);
        expect(JSON.stringify(res.body.message)).toContain('timezone');
      }
    });
  });
});
