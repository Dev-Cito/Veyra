import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser } from './utils.js';

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
});
