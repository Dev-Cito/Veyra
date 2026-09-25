import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { User } from '../src/users/user.entity.js';
import { WorkspaceMember } from '../src/workspaces/entities/workspace-member.entity.js';
import { Workspace } from '../src/workspaces/entities/workspace.entity.js';
import {
  MembershipStatus,
  WorkspaceRole,
} from '../src/workspaces/workspace.enums.js';
import { createTestApp, registerUser, type TestUser } from './utils.js';

describe('Workspaces RBAC (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createWorkspace(owner: TestUser, name = 'Acme Team') {
    const res = await owner.agent
      .post('/workspaces')
      .send({ name })
      .expect(201);
    return res.body as {
      id: string;
      slug: string;
      createdById: string | null;
    };
  }

  // There is no invitation endpoint yet (phase 2), so memberships other than
  // the creator's are inserted directly.
  async function addMember(
    workspaceId: string,
    user: TestUser,
    role: WorkspaceRole,
    status = MembershipStatus.ACTIVE,
  ): Promise<WorkspaceMember> {
    return dataSource.getRepository(WorkspaceMember).save({
      workspaceId,
      userId: user.id,
      role,
      status,
      joinedAt: status === MembershipStatus.ACTIVE ? new Date() : null,
    });
  }

  async function membershipOf(workspaceId: string, user: TestUser) {
    return dataSource
      .getRepository(WorkspaceMember)
      .findOneByOrFail({ workspaceId, userId: user.id });
  }

  describe('authentication', () => {
    it('rejects anonymous requests with 401', async () => {
      await request(app.getHttpServer()).get('/workspaces').expect(401);
    });
  });

  describe('creation', () => {
    it('makes the creator an ACTIVE OWNER', async () => {
      const owner = await registerUser(app);
      const workspace = await createWorkspace(owner);

      expect(workspace.createdById).toBe(owner.id);
      const membership = await membershipOf(workspace.id, owner);
      expect(membership.role).toBe(WorkspaceRole.OWNER);
      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.joinedAt).not.toBeNull();

      const mine = await owner.agent.get('/workspaces').expect(200);
      expect(mine.body).toEqual([
        expect.objectContaining({ id: workspace.id, role: 'OWNER' }),
      ]);
    });

    it('suffixes the slug on collision', async () => {
      const owner = await registerUser(app);
      const first = await createWorkspace(owner, 'Équipe Produit');
      const second = await createWorkspace(owner, 'Equipe  produit!');
      const third = await createWorkspace(owner, 'equipe-produit');

      expect(first.slug).toBe('equipe-produit');
      expect(second.slug).toBe('equipe-produit-2');
      expect(third.slug).toBe('equipe-produit-3');
    });

    it('validates the payload', async () => {
      const owner = await registerUser(app);
      await owner.agent.post('/workspaces').send({ name: '   ' }).expect(400);
      await owner.agent
        .post('/workspaces')
        .send({ name: 'Ok', createdById: owner.id })
        .expect(400);
    });
  });

  describe('WorkspaceGuard', () => {
    it('returns 403 to a non-member', async () => {
      const owner = await registerUser(app);
      const outsider = await registerUser(app);
      const workspace = await createWorkspace(owner);

      await outsider.agent.get(`/workspaces/${workspace.id}`).expect(403);
      await outsider.agent
        .get(`/workspaces/${workspace.id}/members`)
        .expect(403);
    });

    it('returns 403 to a PENDING member', async () => {
      const owner = await registerUser(app);
      const invited = await registerUser(app);
      const workspace = await createWorkspace(owner);
      await addMember(
        workspace.id,
        invited,
        WorkspaceRole.MEMBER,
        MembershipStatus.PENDING,
      );

      await invited.agent.get(`/workspaces/${workspace.id}`).expect(403);
    });

    it('returns 400 for a malformed workspace id', async () => {
      const owner = await registerUser(app);
      await owner.agent.get('/workspaces/not-a-uuid').expect(400);
    });

    it('lets any ACTIVE member read the workspace and its members', async () => {
      const owner = await registerUser(app);
      const member = await registerUser(app);
      const workspace = await createWorkspace(owner);
      await addMember(workspace.id, member, WorkspaceRole.MEMBER);

      const detail = await member.agent
        .get(`/workspaces/${workspace.id}`)
        .expect(200);
      expect(detail.body.role).toBe('MEMBER');

      const members = await member.agent
        .get(`/workspaces/${workspace.id}/members`)
        .expect(200);
      expect(members.body).toHaveLength(2);
      expect(members.body[0].user).not.toHaveProperty('passwordHash');
    });
  });

  describe('@WorkspaceRoles', () => {
    it('returns 403 when a MEMBER tries to DELETE the workspace', async () => {
      const owner = await registerUser(app);
      const member = await registerUser(app);
      const workspace = await createWorkspace(owner);
      await addMember(workspace.id, member, WorkspaceRole.MEMBER);

      await member.agent.delete(`/workspaces/${workspace.id}`).expect(403);
      await owner.agent.get(`/workspaces/${workspace.id}`).expect(200);
    });

    it('returns 403 when an ADMIN tries to DELETE the workspace', async () => {
      const owner = await registerUser(app);
      const admin = await registerUser(app);
      const workspace = await createWorkspace(owner);
      await addMember(workspace.id, admin, WorkspaceRole.ADMIN);

      await admin.agent.delete(`/workspaces/${workspace.id}`).expect(403);
    });

    it('lets an ADMIN rename, but not a MEMBER', async () => {
      const owner = await registerUser(app);
      const admin = await registerUser(app);
      const member = await registerUser(app);
      const workspace = await createWorkspace(owner);
      await addMember(workspace.id, admin, WorkspaceRole.ADMIN);
      await addMember(workspace.id, member, WorkspaceRole.MEMBER);

      await member.agent
        .patch(`/workspaces/${workspace.id}`)
        .send({ name: 'Nope' })
        .expect(403);
      const res = await admin.agent
        .patch(`/workspaces/${workspace.id}`)
        .send({ name: 'Renamed' })
        .expect(200);
      expect(res.body.name).toBe('Renamed');
      expect(res.body.slug).toBe(workspace.slug);
    });

    it('lets the OWNER delete the workspace, cascading memberships', async () => {
      const owner = await registerUser(app);
      const workspace = await createWorkspace(owner);

      await owner.agent.delete(`/workspaces/${workspace.id}`).expect(204);
      await owner.agent.get(`/workspaces/${workspace.id}`).expect(403);
      const remaining = await dataSource
        .getRepository(WorkspaceMember)
        .countBy({ workspaceId: workspace.id });
      expect(remaining).toBe(0);
    });
  });

  describe('member management rules', () => {
    it('returns 409 when removing the last OWNER', async () => {
      const owner = await registerUser(app);
      const workspace = await createWorkspace(owner);
      const ownMembership = await membershipOf(workspace.id, owner);

      const res = await owner.agent
        .delete(`/workspaces/${workspace.id}/members/${ownMembership.id}`)
        .expect(409);
      expect(res.body.message).toMatch(/last active OWNER/);
      expect(await membershipOf(workspace.id, owner)).toBeDefined();
    });

    it('allows an OWNER to leave when another OWNER remains, keeping createdById', async () => {
      const owner = await registerUser(app);
      const coOwner = await registerUser(app);
      const workspace = await createWorkspace(owner);
      await addMember(workspace.id, coOwner, WorkspaceRole.OWNER);
      const ownMembership = await membershipOf(workspace.id, owner);

      await owner.agent
        .delete(`/workspaces/${workspace.id}/members/${ownMembership.id}`)
        .expect(204);

      const res = await coOwner.agent
        .get(`/workspaces/${workspace.id}`)
        .expect(200);
      // Historical fact, not a permission: never reassigned.
      expect(res.body.createdById).toBe(owner.id);
    });

    it('returns 403 when a user changes their own role', async () => {
      const owner = await registerUser(app);
      const coOwner = await registerUser(app);
      const workspace = await createWorkspace(owner);
      await addMember(workspace.id, coOwner, WorkspaceRole.OWNER);
      const ownMembership = await membershipOf(workspace.id, owner);

      await owner.agent
        .patch(`/workspaces/${workspace.id}/members/${ownMembership.id}`)
        .send({ role: 'ADMIN' })
        .expect(403)
        .expect((res) =>
          expect(res.body.message).toBe('You cannot change your own role'),
        );
    });

    it('lets an OWNER change roles, and only an OWNER', async () => {
      const owner = await registerUser(app);
      const admin = await registerUser(app);
      const member = await registerUser(app);
      const workspace = await createWorkspace(owner);
      await addMember(workspace.id, admin, WorkspaceRole.ADMIN);
      const target = await addMember(
        workspace.id,
        member,
        WorkspaceRole.MEMBER,
      );

      await admin.agent
        .patch(`/workspaces/${workspace.id}/members/${target.id}`)
        .send({ role: 'ADMIN' })
        .expect(403);
      const res = await owner.agent
        .patch(`/workspaces/${workspace.id}/members/${target.id}`)
        .send({ role: 'ADMIN' })
        .expect(200);
      expect(res.body.role).toBe('ADMIN');

      await owner.agent
        .patch(`/workspaces/${workspace.id}/members/${target.id}`)
        .send({ role: 'SUPERUSER' })
        .expect(400);
    });

    it('returns 403 when an ADMIN tries to remove an OWNER', async () => {
      const owner = await registerUser(app);
      const admin = await registerUser(app);
      const workspace = await createWorkspace(owner);
      await addMember(workspace.id, admin, WorkspaceRole.ADMIN);
      const ownerMembership = await membershipOf(workspace.id, owner);

      await admin.agent
        .delete(`/workspaces/${workspace.id}/members/${ownerMembership.id}`)
        .expect(403);
    });

    it('lets an ADMIN remove a MEMBER', async () => {
      const owner = await registerUser(app);
      const admin = await registerUser(app);
      const member = await registerUser(app);
      const workspace = await createWorkspace(owner);
      await addMember(workspace.id, admin, WorkspaceRole.ADMIN);
      const target = await addMember(
        workspace.id,
        member,
        WorkspaceRole.MEMBER,
      );

      await admin.agent
        .delete(`/workspaces/${workspace.id}/members/${target.id}`)
        .expect(204);
      await member.agent.get(`/workspaces/${workspace.id}`).expect(403);
    });

    it('returns 404 for a member of another workspace', async () => {
      const owner = await registerUser(app);
      const other = await registerUser(app);
      const workspace = await createWorkspace(owner);
      const otherWorkspace = await createWorkspace(other);
      const foreign = await membershipOf(otherWorkspace.id, other);

      await owner.agent
        .delete(`/workspaces/${workspace.id}/members/${foreign.id}`)
        .expect(404);
    });
  });

  // There is no account deletion endpoint yet, so users are deleted directly.
  describe('creator account deletion', () => {
    async function workspaceWithDeletedCreator() {
      const creator = await registerUser(app);
      const coOwner = await registerUser(app);
      const workspace = await createWorkspace(creator);
      await addMember(workspace.id, coOwner, WorkspaceRole.OWNER);

      await dataSource.getRepository(User).delete({ id: creator.id });
      return { creator, coOwner, workspace };
    }

    it('succeeds, keeps the workspace and sets createdById to null', async () => {
      const { workspace } = await workspaceWithDeletedCreator();

      const row = await dataSource
        .getRepository(Workspace)
        .findOneByOrFail({ id: workspace.id });
      expect(row.createdById).toBeNull();
    });

    it("cascades the deleted user's memberships only", async () => {
      const { creator, coOwner, workspace } =
        await workspaceWithDeletedCreator();

      const members = dataSource.getRepository(WorkspaceMember);
      expect(await members.countBy({ userId: creator.id })).toBe(0);
      expect(
        await members.countBy({
          workspaceId: workspace.id,
          userId: coOwner.id,
        }),
      ).toBe(1);
    });

    it('keeps the workspace readable by its remaining members', async () => {
      const { coOwner, workspace } = await workspaceWithDeletedCreator();

      const detail = await coOwner.agent
        .get(`/workspaces/${workspace.id}`)
        .expect(200);
      expect(detail.body).toMatchObject({
        id: workspace.id,
        createdById: null,
        role: 'OWNER',
      });

      const mine = await coOwner.agent.get('/workspaces').expect(200);
      expect(mine.body).toEqual([
        expect.objectContaining({ id: workspace.id, createdById: null }),
      ]);
    });
  });
});
