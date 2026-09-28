import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { WorkspaceRole } from '../src/workspaces/workspace.enums.js';
import {
  addMember,
  createTestApp,
  createWorkspace,
  registerUser,
  type TestUser,
} from './utils.js';

/**
 * Malformed input must always be a 400, never a 500 from a database
 * constraint (NOT NULL, invalid byte sequence, timestamp out of range...).
 */
describe('Input validation (e2e)', () => {
  let app: INestApplication;
  let owner: TestUser;
  let ws: string;
  let boardId: string;
  let listId: string;
  let taskId: string;
  let memberId: string;

  beforeAll(async () => {
    app = await createTestApp();
    owner = await registerUser(app);
    const member = await registerUser(app);
    ws = (await createWorkspace(owner)).id;
    memberId = (await addMember(app, ws, member, WorkspaceRole.MEMBER)).id;

    const agent = owner.agent;
    boardId = (
      await agent
        .post(`/workspaces/${ws}/boards`)
        .send({ name: 'B' })
        .expect(201)
    ).body.id;
    listId = (
      await agent
        .post(`/workspaces/${ws}/boards/${boardId}/lists`)
        .send({ name: 'L' })
        .expect(201)
    ).body.id;
    taskId = (
      await agent
        .post(`/workspaces/${ws}/lists/${listId}/tasks`)
        .send({ title: 'T' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  type Route = [method: 'post' | 'patch', path: () => string];
  const routes = {
    updateWorkspace: (): Route => ['patch', () => `/workspaces/${ws}`],
    updateBoard: (): Route => [
      'patch',
      () => `/workspaces/${ws}/boards/${boardId}`,
    ],
    updateList: (): Route => [
      'patch',
      () => `/workspaces/${ws}/lists/${listId}`,
    ],
    updateTask: (): Route => [
      'patch',
      () => `/workspaces/${ws}/tasks/${taskId}`,
    ],
    updateMemberRole: (): Route => [
      'patch',
      () => `/workspaces/${ws}/members/${memberId}`,
    ],
    createWorkspace: (): Route => ['post', () => '/workspaces'],
    createBoard: (): Route => ['post', () => `/workspaces/${ws}/boards`],
    createList: (): Route => [
      'post',
      () => `/workspaces/${ws}/boards/${boardId}/lists`,
    ],
    createTask: (): Route => [
      'post',
      () => `/workspaces/${ws}/lists/${listId}/tasks`,
    ],
  };

  function send([method, path]: Route, body: object) {
    return owner.agent[method](path()).send(body);
  }

  describe('null on a non-nullable field of every PATCH DTO -> 400', () => {
    it.each([
      ['UpdateWorkspaceDto', routes.updateWorkspace(), 'name'],
      ['UpdateBoardDto', routes.updateBoard(), 'name'],
      ['UpdateListDto', routes.updateList(), 'name'],
      ['UpdateTaskDto', routes.updateTask(), 'title'],
      ['UpdateTaskDto', routes.updateTask(), 'priority'],
      ['UpdateMemberRoleDto', routes.updateMemberRole(), 'role'],
    ])('%s.%s', async (_dto, route, field) => {
      await send(route, { [field]: null }).expect(400);
    });

    it('CreateTaskDto.priority: null is rejected, omitting it defaults to MEDIUM', async () => {
      await send(routes.createTask(), { title: 'x', priority: null }).expect(
        400,
      );
      const res = await send(routes.createTask(), { title: 'x' }).expect(201);
      expect(res.body.priority).toBe('MEDIUM');
    });
  });

  describe('null stays valid on nullable columns', () => {
    it.each([
      ['UpdateBoardDto', routes.updateBoard(), 'description'],
      ['UpdateTaskDto', routes.updateTask(), 'description'],
      ['UpdateTaskDto', routes.updateTask(), 'dueDate'],
    ])('%s.%s', async (_dto, route, field) => {
      const res = await send(route, { [field]: null }).expect(200);
      expect(res.body[field]).toBeNull();
    });
  });

  describe('NUL byte in any stored string -> 400', () => {
    const nul = 'a\u0000b';

    it.each([
      ['createWorkspace', routes.createWorkspace(), { name: nul }],
      ['updateWorkspace', routes.updateWorkspace(), { name: nul }],
      ['createBoard.name', routes.createBoard(), { name: nul }],
      [
        'createBoard.description',
        routes.createBoard(),
        { name: 'ok', description: nul },
      ],
      ['updateBoard.description', routes.updateBoard(), { description: nul }],
      ['createList', routes.createList(), { name: nul }],
      ['updateList', routes.updateList(), { name: nul }],
      ['createTask.title', routes.createTask(), { title: nul }],
      [
        'createTask.description',
        routes.createTask(),
        { title: 'ok', description: nul },
      ],
      ['updateTask.title', routes.updateTask(), { title: nul }],
      ['updateTask.description', routes.updateTask(), { description: nul }],
    ])('%s', async (_label, route, body) => {
      const res = await send(route, body).expect(400);
      expect(JSON.stringify(res.body.message)).toContain('NUL bytes');
    });

    it.each([
      ['register.name', '/auth/register', { name: nul }],
      [
        'register.password',
        '/auth/register',
        { password: 'long-enough\u0000pw' },
      ],
      ['login.password', '/auth/login', { password: 'pw\u0000pw' }],
    ])('%s', async (_label, path, override) => {
      await request(app.getHttpServer())
        .post(path)
        .send({
          email: 'nul-check@veyra.test',
          name: 'N',
          password: 'correct-horse-battery',
          ...override,
        })
        .expect(400);
    });
  });

  describe('dueDate sliding window: now - 10 years .. now + 100 years', () => {
    /** Computed when the test runs, so the suite never expires. */
    function yearsFromNow(years: number): string {
      const date = new Date();
      date.setFullYear(date.getFullYear() + years);
      return date.toISOString();
    }

    it('accepts now + 1 year on creation and update', async () => {
      const dueDate = yearsFromNow(1);
      await send(routes.createTask(), { title: 'x', dueDate }).expect(201);
      const res = await send(routes.updateTask(), { dueDate }).expect(200);
      expect(res.body.dueDate).toBe(dueDate);
    });

    it('accepts an overdue date inside the window on update (now - 5 years)', async () => {
      await send(routes.updateTask(), { dueDate: yearsFromNow(-5) }).expect(
        200,
      );
    });

    it.each([
      ['POST', routes.createTask()],
      ['PATCH', routes.updateTask()],
    ])(
      '%s: rejects now + 200 years with a readable message',
      async (_m, route) => {
        const res = await send(route, {
          title: 'x',
          dueDate: yearsFromNow(200),
        }).expect(400);
        const message = JSON.stringify(res.body.message);
        expect(message).toContain('more than 100 years in the future');
        // The computed bound itself is not leaked.
        expect(message).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      },
    );

    it('PATCH: rejects now - 20 years with a readable message', async () => {
      const res = await send(routes.updateTask(), {
        dueDate: yearsFromNow(-20),
      }).expect(400);
      expect(JSON.stringify(res.body.message)).toContain(
        'more than 10 years in the past',
      );
    });

    // Regressions for the former 500s ("timestamp out of range"): dates far
    // outside what Postgres can store, still expressed relative to now.
    it.each([
      [
        'PATCH, now - 100000 years',
        routes.updateTask(),
        yearsFromNow(-100_000),
      ],
      ['POST, now + 200000 years', routes.createTask(), yearsFromNow(200_000)],
      ['PATCH, not a date', routes.updateTask(), 'next tuesday'],
    ])('%s -> 400', async (_label, route, dueDate) => {
      await send(route, { title: 'x', dueDate }).expect(400);
    });
  });
});
