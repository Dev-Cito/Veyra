import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Board } from '../src/boards/board.entity.js';
import { SPACING } from '../src/common/position.js';
import { List } from '../src/lists/list.entity.js';
import { Task } from '../src/tasks/entities/task.entity.js';
import { WorkspaceRole } from '../src/workspaces/workspace.enums.js';
import {
  addMember,
  createTestApp,
  createWorkspace,
  registerUser,
  type TestUser,
} from './utils.js';

interface Ref {
  id: string;
  position: number;
}

describe('Moves & reordering (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let owner: TestUser;
  let member: TestUser;
  let ownerB: TestUser;
  let ws: string;
  let wsB: string;
  let board: Ref;
  let listInB: Ref;
  let taskInB: Ref;

  const post = async (user: TestUser, path: string, body: object) =>
    (await user.agent.post(path).send(body).expect(201)).body as Ref;

  const newBoard = (workspaceId = ws, user = owner) =>
    post(user, `/workspaces/${workspaceId}/boards`, { name: 'B' });
  const newList = (boardId = board.id, workspaceId = ws, user = owner) =>
    post(user, `/workspaces/${workspaceId}/boards/${boardId}/lists`, {
      name: 'L',
    });
  const newTask = (listId: string, workspaceId = ws, user = member) =>
    post(user, `/workspaces/${workspaceId}/lists/${listId}/tasks`, {
      title: 'T',
    });
  async function newTasks(listId: string, count: number): Promise<Ref[]> {
    const tasks: Ref[] = [];
    for (let i = 0; i < count; i++) {
      tasks.push(await newTask(listId));
    }
    return tasks;
  }

  const moveTask = (
    taskId: string,
    body: {
      targetListId: string;
      previousTaskId?: string | null;
      nextTaskId?: string | null;
    },
    user = member,
  ) => user.agent.patch(`/workspaces/${ws}/tasks/${taskId}/move`).send(body);

  const tasksOf = (listId: string) =>
    dataSource
      .getRepository(Task)
      .find({ where: { listId }, order: { position: 'ASC' } });
  const orderOf = async (listId: string) =>
    (await tasksOf(listId)).map((t) => t.id);

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    [owner, member, ownerB] = await Promise.all([
      registerUser(app),
      registerUser(app),
      registerUser(app),
    ]);
    ws = (await createWorkspace(owner)).id;
    wsB = (await createWorkspace(ownerB)).id;
    await addMember(app, ws, member, WorkspaceRole.MEMBER);
    board = await newBoard();
    listInB = await newList((await newBoard(wsB, ownerB)).id, wsB, ownerB);
    taskInB = await newTask(listInB.id, wsB, ownerB);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('task moves', () => {
    it('a) to the head, the tail, and between two tasks', async () => {
      const list = await newList();
      const [a, b, c, x] = await newTasks(list.id, 4);

      await moveTask(x.id, { targetListId: list.id, nextTaskId: a.id }).expect(
        200,
      );
      expect(await orderOf(list.id)).toEqual([x.id, a.id, b.id, c.id]);

      await moveTask(x.id, {
        targetListId: list.id,
        previousTaskId: c.id,
      }).expect(200);
      expect(await orderOf(list.id)).toEqual([a.id, b.id, c.id, x.id]);

      const res = await moveTask(x.id, {
        targetListId: list.id,
        previousTaskId: a.id,
        nextTaskId: b.id,
      }).expect(200);
      expect(await orderOf(list.id)).toEqual([a.id, x.id, b.id, c.id]);
      expect(res.body).toMatchObject({
        id: x.id,
        listId: list.id,
        position: 1500,
        reindexed: false,
      });
    });

    it('b) to an empty list', async () => {
      const source = await newList();
      const empty = await newList();
      const [task] = await newTasks(source.id, 1);

      const res = await moveTask(task.id, { targetListId: empty.id }).expect(
        200,
      );
      expect(res.body).toMatchObject({ listId: empty.id, position: SPACING });
      expect(await orderOf(empty.id)).toEqual([task.id]);
      expect(await orderOf(source.id)).toEqual([]);
    });

    it('409 when no neighbours are given but the target list is not empty', async () => {
      const [x] = await newTasks((await newList()).id, 1);
      const target = await newList();
      await newTasks(target.id, 1);

      await moveTask(x.id, { targetListId: target.id }).expect(409);
    });

    it('c) to a list of ANOTHER board of the same workspace', async () => {
      const source = await newList();
      const otherBoard = await newBoard();
      const target = await newList(otherBoard.id);
      const [t1] = await newTasks(target.id, 1);
      const [task] = await newTasks(source.id, 1);

      await moveTask(task.id, {
        targetListId: target.id,
        previousTaskId: t1.id,
      }).expect(200);
      const full = await member.agent
        .get(`/workspaces/${ws}/boards/${otherBoard.id}/full`)
        .expect(200);
      expect(full.body.lists[0].tasks.map((t: { id: string }) => t.id)).toEqual(
        [t1.id, task.id],
      );
    });

    it('d) 404 when the target list belongs to another workspace', async () => {
      const [task] = await newTasks((await newList()).id, 1);
      await moveTask(task.id, { targetListId: listInB.id }).expect(404);
      const stored = await dataSource
        .getRepository(Task)
        .findOneByOrFail({ id: task.id });
      expect(stored.listId).not.toBe(listInB.id);
    });

    it('e) 400 when a neighbour belongs to another list', async () => {
      const list = await newList();
      const other = await newList();
      const [x] = await newTasks(list.id, 1);
      const [foreign] = await newTasks(other.id, 1);

      const res = await moveTask(x.id, {
        targetListId: list.id,
        previousTaskId: foreign.id,
      }).expect(400);
      expect(res.body.message).toBe(
        'previousTaskId must belong to the target list',
      );
    });

    it('f) 404 when a neighbour belongs to another workspace', async () => {
      const list = await newList();
      const [x, a] = await newTasks(list.id, 2);
      await moveTask(x.id, {
        targetListId: list.id,
        previousTaskId: a.id,
        nextTaskId: taskInB.id,
      }).expect(404);
    });

    it('g) 400 when a neighbour is the moved task itself', async () => {
      const list = await newList();
      const [x, a] = await newTasks(list.id, 2);
      const res = await moveTask(x.id, {
        targetListId: list.id,
        previousTaskId: x.id,
        nextTaskId: a.id,
      }).expect(400);
      expect(res.body.message).toBe(
        'previousTaskId cannot be the moved item itself',
      );
    });

    it('400 when previous is not positioned before next', async () => {
      const list = await newList();
      const [a, b, x] = await newTasks(list.id, 3);
      await moveTask(x.id, {
        targetListId: list.id,
        previousTaskId: b.id,
        nextTaskId: a.id,
      }).expect(400);
    });

    it('h) moving a task to where it already is: 200, reindexed false, no write', async () => {
      const list = await newList();
      const [a, b, c] = await newTasks(list.id, 3);
      const before = await dataSource
        .getRepository(Task)
        .findOneByOrFail({ id: b.id });

      const res = await moveTask(b.id, {
        targetListId: list.id,
        previousTaskId: a.id,
        nextTaskId: c.id,
      }).expect(200);
      expect(res.body).toMatchObject({ position: 2000, reindexed: false });

      const after = await dataSource
        .getRepository(Task)
        .findOneByOrFail({ id: b.id });
      expect(after.position).toBe(before.position);
      expect(after.updatedAt).toEqual(before.updatedAt);
    });

    it('rejects position, listId, boardId and workspaceId in the body', async () => {
      const list = await newList();
      const [x] = await newTasks(list.id, 1);
      for (const extra of [
        { position: 1 },
        { listId: list.id },
        { boardId: board.id },
        { workspaceId: ws },
      ]) {
        await moveTask(x.id, { targetListId: list.id, ...extra }).expect(400);
      }
    });
  });

  describe('list and board moves', () => {
    it('i) a MEMBER can move a task but not a list or a board', async () => {
      const list = await newList();
      const [a, x] = await newTasks(list.id, 2);
      await moveTask(
        x.id,
        { targetListId: list.id, nextTaskId: a.id },
        member,
      ).expect(200);

      await member.agent
        .patch(`/workspaces/${ws}/lists/${list.id}/move`)
        .send({})
        .expect(403);
      await member.agent
        .patch(`/workspaces/${ws}/boards/${board.id}/move`)
        .send({})
        .expect(403);
    });

    it('reorders lists within their board', async () => {
      const b = await newBoard();
      const l1 = await newList(b.id);
      const l2 = await newList(b.id);
      const l3 = await newList(b.id);

      const res = await owner.agent
        .patch(`/workspaces/${ws}/lists/${l3.id}/move`)
        .send({ nextListId: l1.id })
        .expect(200);
      expect(res.body).toMatchObject({ id: l3.id, reindexed: false });

      const lists = await dataSource
        .getRepository(List)
        .find({ where: { boardId: b.id }, order: { position: 'ASC' } });
      expect(lists.map((l) => l.id)).toEqual([l3.id, l1.id, l2.id]);
    });

    it('400 when a list neighbour is on another board; boardId is rejected', async () => {
      const list = await newList();
      const elsewhere = await newList((await newBoard()).id);
      const res = await owner.agent
        .patch(`/workspaces/${ws}/lists/${list.id}/move`)
        .send({ previousListId: elsewhere.id })
        .expect(400);
      expect(res.body.message).toBe(
        'previousListId must belong to the same board',
      );
      await owner.agent
        .patch(`/workspaces/${ws}/lists/${list.id}/move`)
        .send({ boardId: board.id })
        .expect(400);
    });

    it('reorders boards within their workspace; 404 for a neighbour elsewhere', async () => {
      const own = await createWorkspace(owner, 'Boards order');
      const b1 = await newBoard(own.id);
      const b2 = await newBoard(own.id);

      await owner.agent
        .patch(`/workspaces/${own.id}/boards/${b2.id}/move`)
        .send({ nextBoardId: b1.id })
        .expect(200);
      const boards = await dataSource
        .getRepository(Board)
        .find({ where: { workspaceId: own.id }, order: { position: 'ASC' } });
      expect(boards.map((b) => b.id)).toEqual([b2.id, b1.id]);

      // A board of another workspace of the same user: still out of scope.
      await owner.agent
        .patch(`/workspaces/${own.id}/boards/${b2.id}/move`)
        .send({ previousBoardId: board.id })
        .expect(404);
    });
  });

  describe('response freshness', () => {
    it('returns the real updatedAt written by the move, for tasks, lists and boards', async () => {
      const own = await createWorkspace(owner, 'Freshness');
      const b1 = await newBoard(own.id);
      const b2 = await newBoard(own.id);
      const l1 = await newList(b1.id, own.id);
      const l2 = await newList(b1.id, own.id);
      const [t1, t2] = [
        await newTask(l1.id, own.id, owner),
        await newTask(l1.id, own.id, owner),
      ];
      const base = `/workspaces/${own.id}`;

      const cases = [
        {
          read: () =>
            dataSource.getRepository(Task).findOneByOrFail({ id: t2.id }),
          move: () =>
            owner.agent
              .patch(`${base}/tasks/${t2.id}/move`)
              .send({ targetListId: l1.id, nextTaskId: t1.id }),
        },
        {
          read: () =>
            dataSource.getRepository(List).findOneByOrFail({ id: l2.id }),
          move: () =>
            owner.agent
              .patch(`${base}/lists/${l2.id}/move`)
              .send({ nextListId: l1.id }),
        },
        {
          read: () =>
            dataSource.getRepository(Board).findOneByOrFail({ id: b2.id }),
          move: () =>
            owner.agent
              .patch(`${base}/boards/${b2.id}/move`)
              .send({ nextBoardId: b1.id }),
        },
      ];
      for (const { read, move } of cases) {
        const before = await read();
        const res = await move().expect(200);
        const stored = await read();

        const returned = new Date(res.body.updatedAt);
        expect(returned.getTime()).toBeGreaterThan(before.updatedAt.getTime());
        expect(returned.toISOString()).toBe(stored.updatedAt.toISOString());
        expect(res.body.position).toBe(stored.position);
      }
    });
  });

  describe('reindexing', () => {
    it('j) forced exhaustion: reindexes, keeps the order, respaces by 1000', async () => {
      const list = await newList();
      const [anchor, first, ...pool] = await newTasks(list.id, 45);

      let successor = first.id;
      let reindexedAt = -1;
      let orderBefore: string[] = [];
      let movedId = '';
      for (let i = 0; i < pool.length; i++) {
        // Always drop right after the anchor: the gap halves every time.
        orderBefore = await orderOf(list.id);
        movedId = pool[i].id;
        const res = await moveTask(movedId, {
          targetListId: list.id,
          previousTaskId: anchor.id,
          nextTaskId: successor,
        }).expect(200);
        if (res.body.reindexed) {
          reindexedAt = i;
          break;
        }
        successor = movedId;
      }
      // 1000 / 2^n drops below MIN_GAP (0.000001) around n = 30.
      expect(reindexedAt).toBeGreaterThanOrEqual(25);

      // Same relative order as before, plus the moved task right after the anchor.
      const expected = orderBefore.filter((id) => id !== movedId);
      expected.splice(1, 0, movedId);
      const after = await tasksOf(list.id);
      expect(after.map((t) => t.id)).toEqual(expected);

      // Every other task is back on the 1000 grid, in order; the moved one
      // sits in the middle of the first gap.
      const others = after.filter((t) => t.id !== movedId);
      others.forEach((task, i) => {
        expect(task.position % SPACING).toBe(0);
        if (i > 0) {
          expect(task.position).toBeGreaterThan(others[i - 1].position);
        }
      });
      expect(others[0].position).toBe(SPACING);
      expect(others[1].position).toBe(2 * SPACING);
      expect(after[1].position).toBe(1.5 * SPACING);
    });
  });

  describe('concurrency', () => {
    it('k) two simultaneous drops into the same gap get distinct, ordered positions', async () => {
      for (let round = 0; round < 5; round++) {
        const list = await newList();
        const [a, b] = await newTasks(list.id, 2);
        const source = await newList();
        const [x, y] = await newTasks(source.id, 2);
        const between = {
          targetListId: list.id,
          previousTaskId: a.id,
          nextTaskId: b.id,
        };

        const [rx, ry] = await Promise.all([
          moveTask(x.id, between),
          moveTask(y.id, between),
        ]);
        expect([rx.status, ry.status]).toEqual([200, 200]);
        expect(rx.body.position).not.toBe(ry.body.position);

        const order = await orderOf(list.id);
        expect(order[0]).toBe(a.id);
        expect(order[3]).toBe(b.id);
        expect(new Set(order.slice(1, 3))).toEqual(new Set([x.id, y.id]));
        const positions = (await tasksOf(list.id)).map((t) => t.position);
        expect(new Set(positions).size).toBe(4);
      }
    });

    it('l) crossed moves A->B and B->A at the same time never deadlock', async () => {
      for (let round = 0; round < 10; round++) {
        const listA = await newList();
        const listB = await newList();
        const [inA, anchorA] = await newTasks(listA.id, 2);
        const [inB, anchorB] = await newTasks(listB.id, 2);

        const [r1, r2] = await Promise.all([
          moveTask(inA.id, {
            targetListId: listB.id,
            previousTaskId: anchorB.id,
          }),
          moveTask(inB.id, {
            targetListId: listA.id,
            previousTaskId: anchorA.id,
          }),
        ]);
        expect([r1.status, r2.status]).toEqual([200, 200]);
        expect(await orderOf(listA.id)).toEqual([anchorA.id, inB.id]);
        expect(await orderOf(listB.id)).toEqual([anchorB.id, inA.id]);
      }
    });
  });
});
