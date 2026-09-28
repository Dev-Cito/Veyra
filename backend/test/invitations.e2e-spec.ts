import type { INestApplication } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Invitation } from '../src/invitations/invitation.entity.js';
import { WorkspaceMember } from '../src/workspaces/entities/workspace-member.entity.js';
import { WorkspaceRole } from '../src/workspaces/workspace.enums.js';
import {
  addMember,
  createTestApp,
  createWorkspace,
  newAgent,
  randomClientIp,
  registerUser,
  type TestUser,
} from './utils.js';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('Invitations (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let owner: TestUser;
  let admin: TestUser;
  let member: TestUser;
  let ws: string;

  /** Every response body seen by this suite, to prove tokenHash never leaks. */
  const bodies: unknown[] = [];
  const seen = <T extends { body: unknown }>(res: T): T => {
    bodies.push(res.body);
    return res;
  };

  const anonymous = () => request(app.getHttpServer());
  const freshEmail = () => `invitee-${randomUUID()}@veyra.test`;

  async function registerAs(email: string): Promise<TestUser> {
    const agent = newAgent(app);
    const res = await agent
      .post('/auth/register')
      .send({ email, name: 'Invitee', password: 'correct-horse-battery' })
      .expect(201);
    return { id: res.body.id, email, agent };
  }

  async function invite(
    user: TestUser,
    email: string,
    role = 'MEMBER',
    workspaceId = ws,
  ) {
    return seen(
      await user.agent
        .post(`/workspaces/${workspaceId}/invitations`)
        .send({ email, role }),
    );
  }

  /** Invites `email` as MEMBER and returns the raw token. */
  async function inviteToken(email: string, role = 'MEMBER', workspaceId = ws) {
    const res = await invite(owner, email, role, workspaceId);
    expect(res.status).toBe(201);
    return res.body as { id: string; token: string };
  }

  const accept = async (user: TestUser, token: unknown) =>
    seen(await user.agent.post('/invitations/accept').send({ token }));
  const preview = (token: unknown) =>
    anonymous().post('/invitations/preview').send({ token });

  const membershipsOf = (userId: string, workspaceId = ws) =>
    dataSource.getRepository(WorkspaceMember).findBy({ userId, workspaceId });

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    [owner, admin, member] = await Promise.all([
      registerUser(app, 'Olivia Owner'),
      registerUser(app),
      registerUser(app),
    ]);
    ws = (await createWorkspace(owner, 'Invite Corp')).id;
    await addMember(app, ws, admin, WorkspaceRole.ADMIN);
    await addMember(app, ws, member, WorkspaceRole.MEMBER);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('creation', () => {
    it('a) OWNER invites as MEMBER: 201, raw token returned once, only its hash stored', async () => {
      const email = freshEmail();
      const res = await invite(owner, email);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        email,
        role: 'MEMBER',
        workspaceId: ws,
      });
      const token = res.body.token as string;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const row = await dataSource.getRepository(Invitation).findOneOrFail({
        where: { id: res.body.id },
        select: { id: true, tokenHash: true, expiresAt: true, createdAt: true },
      });
      expect(row.tokenHash).toBe(sha256(token));
      expect(row.tokenHash).not.toContain(token);
      // 7 days of validity.
      expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeCloseTo(
        7 * 24 * 3600 * 1000,
        -4,
      );

      // Never again: not in the list.
      const list = seen(
        await owner.agent.get(`/workspaces/${ws}/invitations`).expect(200),
      );
      expect(JSON.stringify(list.body)).not.toContain(token);
    });

    it('b) OWNER may invite as ADMIN; an ADMIN may not (403)', async () => {
      expect((await invite(owner, freshEmail(), 'ADMIN')).status).toBe(201);
      const res = await invite(admin, freshEmail(), 'ADMIN');
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Only an OWNER can invite an ADMIN');
      expect((await invite(admin, freshEmail(), 'MEMBER')).status).toBe(201);
    });

    it('c) role OWNER is rejected with 400', async () => {
      const res = await invite(owner, freshEmail(), 'OWNER');
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(
        'OWNER cannot be granted by invitation',
      );
    });

    it('d) a MEMBER cannot invite (403)', async () => {
      expect((await invite(member, freshEmail())).status).toBe(403);
    });

    it('e) 409 when the email belongs to an ACTIVE member, whatever its case', async () => {
      const res = await invite(owner, `  ${member.email.toUpperCase()} `);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(
        'This email already belongs to an active member of the workspace',
      );
    });

    it('f) 409 on a second pending invitation for the same email', async () => {
      const email = freshEmail();
      expect((await invite(owner, email)).status).toBe(201);
      const res = await invite(admin, email.toUpperCase());
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(
        'A pending invitation already exists for this email',
      );
    });

    it('g) revoke then invite the same email again: 201', async () => {
      const email = freshEmail();
      const { id } = await inviteToken(email);

      const revoked = seen(
        await owner.agent
          .delete(`/workspaces/${ws}/invitations/${id}`)
          .expect(200),
      );
      expect(revoked.body).toEqual({
        id,
        email,
        revokedAt: expect.any(String),
      });
      // The row stays as a trace.
      expect(await dataSource.getRepository(Invitation).existsBy({ id })).toBe(
        true,
      );

      expect((await invite(owner, email)).status).toBe(201);
    });

    it('an expired pending invitation does not block a new one', async () => {
      const email = freshEmail();
      const { id } = await inviteToken(email);
      await dataSource
        .getRepository(Invitation)
        .update({ id }, { expiresAt: new Date(Date.now() - 1000) });

      expect((await invite(owner, email)).status).toBe(201);
      const old = await dataSource
        .getRepository(Invitation)
        .findOneByOrFail({ id });
      expect(old.revokedAt).not.toBeNull();
    });
  });

  describe('listing and revocation', () => {
    it('lists pending invitations only', async () => {
      const own = await createWorkspace(owner, 'Listing');
      const pending = await inviteToken(freshEmail(), 'MEMBER', own.id);
      const expired = await inviteToken(freshEmail(), 'MEMBER', own.id);
      const revoked = await inviteToken(freshEmail(), 'MEMBER', own.id);
      await dataSource
        .getRepository(Invitation)
        .update({ id: expired.id }, { expiresAt: new Date(Date.now() - 1000) });
      await owner.agent
        .delete(`/workspaces/${own.id}/invitations/${revoked.id}`)
        .expect(200);

      const res = seen(
        await owner.agent.get(`/workspaces/${own.id}/invitations`).expect(200),
      );
      expect(res.body.map((i: { id: string }) => i.id)).toEqual([pending.id]);
      expect(res.body[0]).not.toHaveProperty('token');
    });

    it('revoking twice is a 409; an invitation of another workspace is a 404', async () => {
      const { id } = await inviteToken(freshEmail());
      await owner.agent
        .delete(`/workspaces/${ws}/invitations/${id}`)
        .expect(200);
      await owner.agent
        .delete(`/workspaces/${ws}/invitations/${id}`)
        .expect(409);

      const other = await createWorkspace(owner, 'Elsewhere');
      await owner.agent
        .delete(`/workspaces/${other.id}/invitations/${id}`)
        .expect(404);
    });
  });

  describe('public preview', () => {
    it('h) exposes only workspaceName, role, invitedByName and expiresAt', async () => {
      const email = freshEmail();
      const { token } = await inviteToken(email, 'ADMIN');

      const res = seen(await preview(token).expect(200));
      expect(Object.keys(res.body).sort()).toEqual(
        ['expiresAt', 'invitedByName', 'role', 'workspaceName'].sort(),
      );
      expect(res.body).toMatchObject({
        workspaceName: 'Invite Corp',
        role: 'ADMIN',
        invitedByName: 'Olivia Owner',
      });
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain(email);
      expect(raw).not.toContain(ws);
      expect(raw).not.toContain(sha256(token));
    });

    it('n) unknown or malformed token: the same 404, never 400 nor 500', async () => {
      const prober = await registerUser(app);
      for (const token of [
        'A'.repeat(43), // well formed, unknown
        'does-not-exist',
        'x'.repeat(2000),
        '../../etc/passwd',
        "' OR 1=1 --".padEnd(43, 'x'),
        '\u0000'.repeat(43),
        '+'.repeat(43), // base64, not base64url
        123,
        null,
        { $ne: null },
        undefined, // missing field
      ]) {
        // Each probe from its own client IP: this test is about validation;
        // rate limits have their own suite (rate-limit.e2e-spec.ts).
        const previewed = await preview(token)
          .set('X-Forwarded-For', randomClientIp())
          .expect(404);
        const accepted = seen(
          await prober.agent
            .post('/invitations/accept')
            .set('X-Forwarded-For', randomClientIp())
            .send({ token }),
        );
        expect(accepted.status).toBe(404);
        expect(previewed.body.message).toBe('Invitation not found');
        expect(accepted.body.message).toBe('Invitation not found');
      }
    });

    it('the token never goes in a URL: the former path routes are gone', async () => {
      const { token } = await inviteToken(freshEmail());
      const get = await anonymous().get(`/invitations/${token}`).expect(404);
      const post = await owner.agent
        .post(`/invitations/${token}/accept`)
        .expect(404);
      // Unknown routes, not unusable invitations.
      expect(get.body.message).toContain('Cannot GET');
      expect(post.body.message).toContain('Cannot POST');
    });
  });

  describe('acceptance', () => {
    it('requires authentication', async () => {
      const { token } = await inviteToken(freshEmail());
      await anonymous().post('/invitations/accept').send({ token }).expect(401);
    });

    it('i) 403 for an account whose email differs', async () => {
      const { token } = await inviteToken(freshEmail());
      const intruder = await registerUser(app);

      const res = await accept(intruder, token);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('sent to another email address');
      expect(await membershipsOf(intruder.id)).toEqual([]);
    });

    it('j) the right account joins as ACTIVE with the invited role', async () => {
      const email = freshEmail();
      const { token, id } = await inviteToken(email, 'ADMIN');
      // Invited before having an account: registers afterwards, with another case.
      const invitee = await registerAs(email.toUpperCase());

      const res = await accept(invitee, token);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: ws,
        name: 'Invite Corp',
        role: 'ADMIN',
      });

      const [membership] = await membershipsOf(invitee.id);
      expect(membership).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
      expect(membership.joinedAt).not.toBeNull();
      const row = await dataSource
        .getRepository(Invitation)
        .findOneByOrFail({ id });
      expect(row.acceptedAt).not.toBeNull();
      await invitee.agent.get(`/workspaces/${ws}`).expect(200);
    });

    it('k) accepting twice: the second is a 404', async () => {
      const email = freshEmail();
      const { token } = await inviteToken(email);
      const invitee = await registerAs(email);
      expect((await accept(invitee, token)).status).toBe(200);
      expect((await accept(invitee, token)).status).toBe(404);
      await preview(token).expect(404);
    });

    it('l) an expired invitation: 404', async () => {
      const email = freshEmail();
      const { token, id } = await inviteToken(email);
      await dataSource
        .getRepository(Invitation)
        .update({ id }, { expiresAt: new Date(Date.now() - 1000) });
      const invitee = await registerAs(email);

      expect((await accept(invitee, token)).status).toBe(404);
      await preview(token).expect(404);
    });

    it('m) a revoked invitation: 404', async () => {
      const email = freshEmail();
      const { token, id } = await inviteToken(email);
      await owner.agent
        .delete(`/workspaces/${ws}/invitations/${id}`)
        .expect(200);
      const invitee = await registerAs(email);

      expect((await accept(invitee, token)).status).toBe(404);
      await preview(token).expect(404);
    });

    it('o) already ADMIN: 200, role unchanged, no duplicate membership', async () => {
      const email = freshEmail();
      const existing = await registerAs(email);
      await addMember(app, ws, existing, WorkspaceRole.ADMIN);
      // Inviting an active member's email is refused (e): simulate an
      // invitation sent before they joined by rewriting its email in base.
      const { token } = await inviteToken(freshEmail());
      await dataSource
        .getRepository(Invitation)
        .update({ tokenHash: sha256(token) }, { email });

      const res = await accept(existing, token);
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('ADMIN');
      const memberships = await membershipsOf(existing.id);
      expect(memberships).toHaveLength(1);
      expect(memberships[0].role).toBe('ADMIN');
    });

    it('p) two simultaneous acceptances: one membership, one 200 and one 404', async () => {
      for (let round = 0; round < 5; round++) {
        const email = freshEmail();
        const { token } = await inviteToken(email);
        const invitee = await registerAs(email);

        const results = await Promise.all([
          accept(invitee, token),
          accept(invitee, token),
        ]);
        expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
          200, 404,
        ]);
        expect(await membershipsOf(invitee.id)).toHaveLength(1);
      }
    });
  });

  describe('lifecycle and leaks', () => {
    it('q) deleting the workspace cascades to its invitations', async () => {
      const own = await createWorkspace(owner, 'Doomed');
      const { id } = await inviteToken(freshEmail(), 'MEMBER', own.id);
      await owner.agent.delete(`/workspaces/${own.id}`).expect(200);
      expect(await dataSource.getRepository(Invitation).existsBy({ id })).toBe(
        false,
      );
    });

    it('r) tokenHash appears in no API response of this suite', async () => {
      const hashes = (
        await dataSource
          .getRepository(Invitation)
          .find({ select: { id: true, tokenHash: true } })
      ).map((i) => i.tokenHash);
      expect(bodies.length).toBeGreaterThan(20);
      for (const body of bodies) {
        const raw = JSON.stringify(body);
        expect(raw).not.toContain('tokenHash');
        for (const hash of hashes) {
          expect(raw).not.toContain(hash);
        }
      }
      // And no raw token is stored anywhere in the table.
      for (const body of bodies) {
        const token = (body as { token?: string } | null)?.token;
        if (token) {
          expect(
            await dataSource.query(
              `SELECT 1 FROM invitations WHERE "tokenHash" = $1 OR email = $1`,
              [token],
            ),
          ).toEqual([]);
        }
      }
    });
  });
});
