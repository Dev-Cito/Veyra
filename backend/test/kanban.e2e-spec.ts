import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Board } from '../src/boards/board.entity.js';
import { List } from '../src/lists/list.entity.js';
import { TaskAssignee } from '../src/tasks/entities/task-assignee.entity.js';
import { Task } from '../src/tasks/entities/task.entity.js';
import {
  MembershipStatus,
  WorkspaceRole,
} from '../src/workspaces/workspace.enums.js';
import {
  addMember,
  createTestApp,
  createWorkspace,
  registerUser,
  type TestUser,
} from './utils.js';

interface Ref {
  id: string;
}

describe('Boards, lists & tasks (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  // Workspace A: one user per role. Workspace B: owned by an outsider to A.
  let ownerA: TestUser;
  let adminA: TestUser;
  let memberA: TestUser;
  let otherMemberA: TestUser;
  let ownerB: TestUser;
  let wsA: string;
  let wsB: string;
  let boardB: Ref;
  let listB: Ref;
  let taskB: Ref;

  async function createBoard(user: TestUser, workspaceId: string) {
    const res = await user.agent
      .post(`/workspaces/${workspaceId}/boards`)
      .send({ name: 'Board' })
      .expect(201);
    return res.body as Ref & { position: number };
  }

  async function createList(
    user: TestUser,
    workspaceId: string,
    boardId: string,
  ) {
    const res = await user.agent
      .post(`/workspaces/${workspaceId}/boards/${boardId}/lists`)
      .send({ name: 'List' })
      .expect(201);
    return res.body as Ref & { position: number };
  }

  async function createTask(
    user: TestUser,
    workspaceId: string,
    listId: string,
  ) {
    const res = await user.agent
      .post(`/workspaces/${workspaceId}/lists/${listId}/tasks`)
      .send({ title: 'Task' })
      .expect(201);
    return res.body as Ref & { position: number; createdById: string };
  }

  /** A fresh board > list in workspace A, so destructive tests stay isolated. */
  async function freshListA() {
    const board = await createBoard(ownerA, wsA);
    const list = await createList(ownerA, wsA, board.id);
    return { board, list };
  }

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);

    [ownerA, adminA, memberA, otherMemberA, ownerB] = await Promise.all([
      registerUser(app),
      registerUser(app),
      registerUser(app),
      registerUser(app),
      registerUser(app),
    ]);
    wsA = (await createWorkspace(ownerA, 'Workspace A')).id;
    wsB = (await createWorkspace(ownerB, 'Workspace B')).id;
    await addMember(app, wsA, adminA, WorkspaceRole.ADMIN);
    await addMember(app, wsA, memberA, WorkspaceRole.MEMBER);
    await addMember(app, wsA, otherMemberA, WorkspaceRole.MEMBER);

    boardB = await createBoard(ownerB, wsB);
    listB = await createList(ownerB, wsB, boardB.id);
    taskB = await createTask(ownerB, wsB, listB.id);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('isolation between workspaces (IDOR)', () => {
    it('a) 404 on a board of workspace B through the URL of A', async () => {
      await memberA.agent
        .get(`/workspaces/${wsA}/boards/${boardB.id}`)
        .expect(404);
      await memberA.agent
        .get(`/workspaces/${wsA}/boards/${boardB.id}/full`)
        .expect(404);
      await ownerA.agent
        .patch(`/workspaces/${wsA}/boards/${boardB.id}`)
        .send({ name: 'Hijacked' })
        .expect(404);
      await ownerA.agent
        .post(`/workspaces/${wsA}/boards/${boardB.id}/lists`)
        .send({ name: 'Injected' })
        .expect(404);
    });

    it('b) 404 on PATCH and DELETE of a list of workspace B', async () => {
      await ownerA.agent
        .patch(`/workspaces/${wsA}/lists/${listB.id}`)
        .send({ name: 'Hijacked' })
        .expect(404);
      await ownerA.agent
        .delete(`/workspaces/${wsA}/lists/${listB.id}`)
        .expect(404);
      await memberA.agent
        .post(`/workspaces/${wsA}/lists/${listB.id}/tasks`)
        .send({ title: 'Injected' })
        .expect(404);

      const list = await dataSource.getRepository(List).findOneByOrFail({
        id: listB.id,
      });
      expect(list.name).toBe('List');
    });

    it('c) 404 on PATCH and DELETE of a task of workspace B', async () => {
      await memberA.agent
        .get(`/workspaces/${wsA}/tasks/${taskB.id}`)
        .expect(404);
      await ownerA.agent
        .patch(`/workspaces/${wsA}/tasks/${taskB.id}`)
        .send({ title: 'Hijacked' })
        .expect(404);
      await ownerA.agent
        .delete(`/workspaces/${wsA}/tasks/${taskB.id}`)
        .expect(404);
      await ownerA.agent
        .post(`/workspaces/${wsA}/tasks/${taskB.id}/assignees`)
        .send({ userId: ownerA.id })
        .expect(404);

      const task = await dataSource.getRepository(Task).findOneByOrFail({
        id: taskB.id,
      });
      expect(task.title).toBe('Task');
    });
  });

  describe('assignees', () => {
    it('d) 400 when assigning a user who is not an active member', async () => {
      const { list } = await freshListA();
      const task = await createTask(memberA, wsA, list.id);
      const pending = await registerUser(app);
      await addMember(
        app,
        wsA,
        pending,
        WorkspaceRole.MEMBER,
        MembershipStatus.PENDING,
      );

      for (const userId of [ownerB.id, pending.id]) {
        const res = await memberA.agent
          .post(`/workspaces/${wsA}/tasks/${task.id}/assignees`)
          .send({ userId })
          .expect(400);
        expect(res.body.message).toMatch(/active member of this workspace/);
      }
    });

    it('e) 409 when assigning the same user twice', async () => {
      const { list } = await freshListA();
      const task = await createTask(memberA, wsA, list.id);
      const url = `/workspaces/${wsA}/tasks/${task.id}/assignees`;

      const res = await memberA.agent
        .post(url)
        .send({ userId: otherMemberA.id })
        .expect(201);
      expect(res.body.user).toMatchObject({ id: otherMemberA.id });
      expect(res.body.user).not.toHaveProperty('passwordHash');

      await memberA.agent
        .post(url)
        .send({ userId: otherMemberA.id })
        .expect(409);
    });

    it('unassigns, then 404 when the user is no longer assigned', async () => {
      const { list } = await freshListA();
      const task = await createTask(memberA, wsA, list.id);
      await memberA.agent
        .post(`/workspaces/${wsA}/tasks/${task.id}/assignees`)
        .send({ userId: memberA.id })
        .expect(201);

      const url = `/workspaces/${wsA}/tasks/${task.id}/assignees/${memberA.id}`;
      await otherMemberA.agent.delete(url).expect(200);
      await otherMemberA.agent.delete(url).expect(404);
    });
  });

  describe('task deletion rights', () => {
    it("f) 403 when a MEMBER deletes someone else's task", async () => {
      const { list } = await freshListA();
      const task = await createTask(memberA, wsA, list.id);

      const res = await otherMemberA.agent
        .delete(`/workspaces/${wsA}/tasks/${task.id}`)
        .expect(403);
      expect(res.body.message).toMatch(/creator, an OWNER or an ADMIN/);
    });

    it('g) 200 when a MEMBER deletes their own task', async () => {
      const { list } = await freshListA();
      const task = await createTask(memberA, wsA, list.id);

      await memberA.agent
        .delete(`/workspaces/${wsA}/tasks/${task.id}`)
        .expect(200);
      await memberA.agent
        .get(`/workspaces/${wsA}/tasks/${task.id}`)
        .expect(404);
    });

    it("h) 200 when an ADMIN deletes someone else's task", async () => {
      const { list } = await freshListA();
      const task = await createTask(memberA, wsA, list.id);

      await adminA.agent
        .delete(`/workspaces/${wsA}/tasks/${task.id}`)
        .expect(200);
    });
  });

  describe('boards', () => {
    it('i) 403 when a MEMBER creates a board', async () => {
      await memberA.agent
        .post(`/workspaces/${wsA}/boards`)
        .send({ name: 'Nope' })
        .expect(403);
    });

    it('j) deleting a board cascades to its lists and tasks', async () => {
      const { board, list } = await freshListA();
      const task = await createTask(memberA, wsA, list.id);
      await createTask(memberA, wsA, list.id);

      // DELETE board is OWNER only.
      await adminA.agent
        .delete(`/workspaces/${wsA}/boards/${board.id}`)
        .expect(403);
      const res = await ownerA.agent
        .delete(`/workspaces/${wsA}/boards/${board.id}`)
        .expect(200);
      expect(res.body).toEqual({
        id: board.id,
        deletedLists: 1,
        deletedTasks: 2,
      });

      expect(
        await dataSource.getRepository(Board).existsBy({ id: board.id }),
      ).toBe(false);
      expect(
        await dataSource.getRepository(List).existsBy({ id: list.id }),
      ).toBe(false);
      expect(
        await dataSource.getRepository(Task).existsBy({ id: task.id }),
      ).toBe(false);
    });

    it('k) /full returns lists and tasks sorted by ascending position', async () => {
      const board = await createBoard(ownerA, wsA);
      const first = await createList(ownerA, wsA, board.id);
      const second = await createList(ownerA, wsA, board.id);
      const t1 = await createTask(memberA, wsA, first.id);
      const t2 = await createTask(memberA, wsA, first.id);
      const t3 = await createTask(memberA, wsA, first.id);
      await memberA.agent
        .post(`/workspaces/${wsA}/tasks/${t2.id}/assignees`)
        .send({ userId: adminA.id })
        .expect(201);

      // Reorder behind the API's back so that position order != creation order.
      await dataSource
        .getRepository(List)
        .update({ id: first.id }, { position: 5000 });
      await dataSource
        .getRepository(Task)
        .update({ id: t1.id }, { position: 3500 });

      const res = await memberA.agent
        .get(`/workspaces/${wsA}/boards/${board.id}/full`)
        .expect(200);
      const lists = res.body.lists as {
        id: string;
        position: number;
        tasks: {
          id: string;
          position: number;
          assignees: { userId: string }[];
        }[];
      }[];

      expect(lists.map((l) => l.id)).toEqual([second.id, first.id]);
      expect(lists[0].tasks).toEqual([]);
      expect(lists[1].tasks.map((t) => t.id)).toEqual([t2.id, t3.id, t1.id]);
      expect(lists[1].tasks.map((t) => t.position)).toEqual([2000, 3000, 3500]);
      expect(lists[1].tasks[0].assignees).toEqual([
        expect.objectContaining({
          userId: adminA.id,
          user: expect.not.objectContaining({
            passwordHash: expect.anything(),
          }),
        }),
      ]);
    });
  });

  describe('positions', () => {
    it('computes max + 1000 among siblings, 1000 for the first', async () => {
      const { board, list } = await freshListA();
      const second = await createList(ownerA, wsA, board.id);
      const t1 = await createTask(memberA, wsA, list.id);
      const t2 = await createTask(memberA, wsA, list.id);
      const inOtherList = await createTask(memberA, wsA, second.id);

      expect(second.position).toBe(2000);
      expect([t1.position, t2.position]).toEqual([1000, 2000]);
      expect(inOtherList.position).toBe(1000);
    });

    it('l) a client-supplied position is rejected and never applied', async () => {
      const { board, list } = await freshListA();
      const task = await createTask(memberA, wsA, list.id);

      await ownerA.agent
        .post(`/workspaces/${wsA}/boards/${board.id}/lists`)
        .send({ name: 'Sneaky', position: -1 })
        .expect(400);
      await memberA.agent
        .post(`/workspaces/${wsA}/lists/${list.id}/tasks`)
        .send({ title: 'Sneaky', position: -1 })
        .expect(400);
      await memberA.agent
        .patch(`/workspaces/${wsA}/tasks/${task.id}`)
        .send({ position: -1 })
        .expect(400);
      await ownerA.agent
        .patch(`/workspaces/${wsA}/lists/${list.id}`)
        .send({ position: -1 })
        .expect(400);

      const stored = await dataSource
        .getRepository(Task)
        .findOneByOrFail({ id: task.id });
      expect(stored.position).toBe(1000);
      expect(
        await dataSource.getRepository(List).countBy({ boardId: board.id }),
      ).toBe(1);
    });
  });

  describe('input rules', () => {
    it('rejects a past dueDate on creation, allows it on update', async () => {
      const { list } = await freshListA();
      const past = new Date(Date.now() - 86_400_000).toISOString();
      const future = new Date(Date.now() + 86_400_000).toISOString();

      const rejected = await memberA.agent
        .post(`/workspaces/${wsA}/lists/${list.id}/tasks`)
        .send({ title: 'Late', dueDate: past })
        .expect(400);
      expect(rejected.body.message).toContain(
        'dueDate must not be in the past',
      );

      const created = await memberA.agent
        .post(`/workspaces/${wsA}/lists/${list.id}/tasks`)
        .send({ title: 'On time', dueDate: future, priority: 'HIGH' })
        .expect(201);
      expect(created.body).toMatchObject({
        priority: 'HIGH',
        reminderSent: false,
      });

      const updated = await memberA.agent
        .patch(`/workspaces/${wsA}/tasks/${created.body.id}`)
        .send({ dueDate: past })
        .expect(200);
      expect(updated.body.dueDate).toBe(past);
    });

    it('never accepts parent ids or reminderSent in a PATCH body', async () => {
      const { board, list } = await freshListA();
      const task = await createTask(memberA, wsA, list.id);
      const otherList = await createList(ownerA, wsA, board.id);

      for (const body of [
        { listId: otherList.id },
        { boardId: board.id },
        { workspaceId: wsB },
        { reminderSent: true },
      ]) {
        await memberA.agent
          .patch(`/workspaces/${wsA}/tasks/${task.id}`)
          .send(body)
          .expect(400);
      }
      await ownerA.agent
        .patch(`/workspaces/${wsA}/lists/${list.id}`)
        .send({ boardId: boardB.id })
        .expect(400);

      const stored = await dataSource
        .getRepository(Task)
        .findOneByOrFail({ id: task.id });
      expect(stored.listId).toBe(list.id);
    });

    it('rejects null for a required field in PATCH', async () => {
      const { list } = await freshListA();
      const task = await createTask(memberA, wsA, list.id);
      await memberA.agent
        .patch(`/workspaces/${wsA}/tasks/${task.id}`)
        .send({ title: null })
        .expect(400);
    });

    it('deleting a list reports how many tasks went with it', async () => {
      const { list } = await freshListA();
      await createTask(memberA, wsA, list.id);
      await createTask(memberA, wsA, list.id);

      const res = await adminA.agent
        .delete(`/workspaces/${wsA}/lists/${list.id}`)
        .expect(200);
      expect(res.body).toEqual({ id: list.id, deletedTasks: 2 });
    });
  });

  describe('removing a member cleans up their assignments', () => {
    it("drops their assignments in this workspace only; tasks and others' assignments survive", async () => {
      // `leaver` belongs to A and B, and is assigned in both.
      const leaver = await registerUser(app);
      const membershipA = await addMember(
        app,
        wsA,
        leaver,
        WorkspaceRole.MEMBER,
      );
      await addMember(app, wsB, leaver, WorkspaceRole.MEMBER);

      const { list } = await freshListA();
      const taskA1 = await createTask(memberA, wsA, list.id);
      const taskA2 = await createTask(memberA, wsA, list.id);
      const taskInB = await createTask(ownerB, wsB, listB.id);
      const assign = (
        user: TestUser,
        workspaceId: string,
        taskId: string,
        userId: string,
      ) =>
        user.agent
          .post(`/workspaces/${workspaceId}/tasks/${taskId}/assignees`)
          .send({ userId })
          .expect(201);
      await assign(memberA, wsA, taskA1.id, leaver.id);
      await assign(memberA, wsA, taskA2.id, leaver.id);
      await assign(memberA, wsA, taskA1.id, otherMemberA.id);
      await assign(ownerB, wsB, taskInB.id, leaver.id);

      const res = await ownerA.agent
        .delete(`/workspaces/${wsA}/members/${membershipA.id}`)
        .expect(200);
      expect(res.body).toEqual({
        workspaceId: wsA,
        userId: leaver.id,
        removedAssignments: 2,
      });

      const assignees = dataSource.getRepository(TaskAssignee);
      // Gone from workspace A...
      expect(
        await assignees.countBy({ userId: leaver.id, taskId: taskA1.id }),
      ).toBe(0);
      expect(
        await assignees.countBy({ userId: leaver.id, taskId: taskA2.id }),
      ).toBe(0);
      // ...kept in workspace B, where they are still a member (scope regression).
      expect(
        await assignees.countBy({ userId: leaver.id, taskId: taskInB.id }),
      ).toBe(1);
      // Other users' assignments and the tasks themselves are untouched.
      expect(
        await assignees.countBy({ userId: otherMemberA.id, taskId: taskA1.id }),
      ).toBe(1);
      const tasks = dataSource.getRepository(Task);
      expect(await tasks.existsBy({ id: taskA1.id })).toBe(true);
      expect(await tasks.existsBy({ id: taskA2.id })).toBe(true);
    });
  });
});
