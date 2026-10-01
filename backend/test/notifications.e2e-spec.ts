import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { MAIL_TRANSPORT } from '../src/mail/mail.config.js';
import { REMINDER_BATCH_SIZE } from '../src/notifications/reminder.service.js';
import { TaskAssignee } from '../src/tasks/entities/task-assignee.entity.js';
import { Task } from '../src/tasks/entities/task.entity.js';
import { WorkspaceRole } from '../src/workspaces/workspace.enums.js';
import {
  addMember,
  CapturingLogger,
  createTestApp,
  createWorkspace,
  InMemoryTransport,
  randomClientIp,
  registerUser,
  type TestUser,
} from './utils.js';

const HOUR = 3600 * 1000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR);
const frontendUrl = () => process.env.FRONTEND_URL!;

describe('Mail & reminders (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const transport = new InMemoryTransport();
  const logs = new CapturingLogger();
  let owner: TestUser;
  let member: TestUser;

  /** A workspace with one board and one list, member included: isolates runs. */
  async function freshWorkspace(name = 'Reminders') {
    const ws = (await createWorkspace(owner, name)).id;
    await addMember(app, ws, member, WorkspaceRole.MEMBER);
    const board = await owner.agent
      .post(`/workspaces/${ws}/boards`)
      .send({ name: 'Roadmap' })
      .expect(201);
    const list = await owner.agent
      .post(`/workspaces/${ws}/boards/${board.body.id}/lists`)
      .send({ name: 'Doing' })
      .expect(201);
    return {
      ws,
      boardId: board.body.id as string,
      listId: list.body.id as string,
    };
  }

  /** Inserted directly: a past dueDate is refused by the API on creation. */
  async function insertTask(
    listId: string,
    dueDate: Date | null,
    options: {
      title?: string;
      assignees?: TestUser[];
      reminderSent?: boolean;
    } = {},
  ): Promise<Task> {
    const task = await dataSource.getRepository(Task).save({
      listId,
      title: options.title ?? `Task ${randomUUID().slice(0, 8)}`,
      position: 1000,
      dueDate,
      reminderSent: options.reminderSent ?? false,
      createdById: owner.id,
    });
    for (const user of options.assignees ?? []) {
      await dataSource
        .getRepository(TaskAssignee)
        .save({ taskId: task.id, userId: user.id });
    }
    return task;
  }

  const reminderSentOf = async (taskId: string) =>
    (await dataSource.getRepository(Task).findOneByOrFail({ id: taskId }))
      .reminderSent;

  /** Each call from its own client IP: the 2/min limit has its own test. */
  const run = (workspaceId: string, user = owner, ip = randomClientIp()) =>
    user.agent
      .post(`/workspaces/${workspaceId}/reminders/run`)
      .set('X-Forwarded-For', ip);

  beforeAll(async () => {
    app = await createTestApp({ mailTransport: transport, logger: logs });
    dataSource = app.get(DataSource);
    [owner, member] = await Promise.all([
      registerUser(app, 'Olivia <b>Owner</b>'),
      registerUser(app, 'Max Member'),
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    transport.sent.length = 0;
    transport.failWith = null;
    transport.failEchoingMessage = false;
    transport.delayMs = 0;
  });

  describe('invitation email', () => {
    it('sends it after creation, with the token link, emailSent = true', async () => {
      const { ws } = await freshWorkspace('Acme');
      const email = `inv-${randomUUID()}@veyra.test`;
      const res = await owner.agent
        .post(`/workspaces/${ws}/invitations`)
        .send({ email, role: 'MEMBER' })
        .expect(201);
      expect(res.body.emailSent).toBe(true);

      expect(transport.sent).toHaveLength(1);
      const [mail] = transport.sent;
      expect(mail).toMatchObject({
        to: email,
        from: process.env.MAIL_FROM,
        subject: 'Invitation à rejoindre Acme',
      });
      // In the fragment: never sent to (nor logged by) the front's server.
      const link = `${frontendUrl()}/invite#token=${res.body.token}`;
      expect(mail.text).toContain(link);
      expect(mail.html).toContain(link);
      expect(mail.text).toContain('membre');
    });

    it('b) a failed send does not fail the invitation', async () => {
      const { ws } = await freshWorkspace();
      transport.failWith = Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNECTION',
      });

      const res = await owner.agent
        .post(`/workspaces/${ws}/invitations`)
        .send({ email: `inv-${randomUUID()}@veyra.test`, role: 'MEMBER' })
        .expect(201);
      expect(res.body.emailSent).toBe(false);
      // The invitation stands and its token works.
      await request(app.getHttpServer())
        .post('/invitations/preview')
        .send({ token: res.body.token })
        .expect(200);
    });

    it('c) user-provided names are HTML-escaped in the HTML part', async () => {
      const { ws } = await freshWorkspace('<img src=x onerror=alert(1)> & Co');
      await owner.agent
        .post(`/workspaces/${ws}/invitations`)
        .send({ email: `inv-${randomUUID()}@veyra.test`, role: 'ADMIN' })
        .expect(201);

      const [mail] = transport.sent;
      expect(mail.html).toContain(
        '&lt;img src=x onerror=alert(1)&gt; &amp; Co',
      );
      expect(mail.html).not.toContain('<img src=x');
      // The inviter's name is user input too.
      expect(mail.html).toContain('Olivia &lt;b&gt;Owner&lt;/b&gt;');
      expect(mail.html).not.toContain('<b>Owner</b>');
      // The text part carries the raw values: no HTML there to break.
      expect(mail.text).toContain('<img src=x onerror=alert(1)> & Co');
    });

    it('d) the raw token appears in no log line, even when the send fails', async () => {
      const { ws } = await freshWorkspace();
      transport.failEchoingMessage = true;
      const before = logs.lines.length;

      const res = await owner.agent
        .post(`/workspaces/${ws}/invitations`)
        .send({ email: `inv-${randomUUID()}@veyra.test`, role: 'MEMBER' })
        .expect(201);
      expect(res.body.emailSent).toBe(false);

      const newLines = logs.lines.slice(before);
      const failure = newLines.find((line) => line.includes('Failed to send'));
      expect(failure).toBeDefined();
      expect(failure).toContain('[redacted]');
      // Nor any fragment of it (a truncation through the token would leak one).
      const fragments = [
        res.body.token,
        res.body.token.slice(0, 12),
        res.body.token.slice(-12),
      ];
      for (const line of logs.lines) {
        for (const fragment of fragments) {
          expect(line).not.toContain(fragment);
        }
      }
    });
  });

  describe('manual reminder run', () => {
    it('e) a task due in 12 h, assigned: processed, emailed, marked', async () => {
      const { ws, boardId, listId } = await freshWorkspace();
      const task = await insertTask(listId, inHours(12), {
        title: 'Ship <v1>',
        assignees: [member],
      });

      const res = await run(ws).expect(200);
      expect(res.body).toEqual({
        tasksProcessed: 1,
        emailsSent: 1,
        emailsFailed: 0,
      });
      expect(await reminderSentOf(task.id)).toBe(true);

      const [mail] = transport.sent;
      expect(mail.to).toBe(member.email);
      expect(mail.subject).toBe('Échéance proche pour Ship <v1>');
      expect(mail.text).toContain('Board : Roadmap');
      expect(mail.text).toContain('Liste : Doing');
      expect(mail.text).toContain(`${frontendUrl()}/boards/${boardId}`);
      expect(mail.html).toContain('Ship &lt;v1&gt;');
    });

    it('f) g) h) due in 48 h, already past, or already reminded: not processed', async () => {
      const { ws, listId } = await freshWorkspace();
      const later = await insertTask(listId, inHours(48), {
        assignees: [member],
      });
      const past = await insertTask(listId, inHours(-1), {
        assignees: [member],
      });
      const done = await insertTask(listId, inHours(6), {
        assignees: [member],
        reminderSent: true,
      });
      const noDate = await insertTask(listId, null, { assignees: [member] });

      const res = await run(ws).expect(200);
      expect(res.body).toEqual({
        tasksProcessed: 0,
        emailsSent: 0,
        emailsFailed: 0,
      });
      expect(transport.sent).toEqual([]);
      expect(await reminderSentOf(later.id)).toBe(false);
      expect(await reminderSentOf(past.id)).toBe(false);
      expect(await reminderSentOf(done.id)).toBe(true);
      expect(await reminderSentOf(noDate.id)).toBe(false);
    });

    it('i) no assignee: marked anyway, no email', async () => {
      const { ws, listId } = await freshWorkspace();
      const task = await insertTask(listId, inHours(3));

      const res = await run(ws).expect(200);
      expect(res.body).toEqual({
        tasksProcessed: 1,
        emailsSent: 0,
        emailsFailed: 0,
      });
      expect(await reminderSentOf(task.id)).toBe(true);
      expect(transport.sent).toEqual([]);
    });

    it('j) two consecutive runs: the second processes nothing', async () => {
      const { ws, listId } = await freshWorkspace();
      await insertTask(listId, inHours(2), { assignees: [member, owner] });

      expect((await run(ws).expect(200)).body).toEqual({
        tasksProcessed: 1,
        emailsSent: 2,
        emailsFailed: 0,
      });
      expect((await run(ws).expect(200)).body).toEqual({
        tasksProcessed: 0,
        emailsSent: 0,
        emailsFailed: 0,
      });
      expect(transport.sent).toHaveLength(2);
    });

    it('failed sends are counted, and the task stays marked (no retry)', async () => {
      const { ws, listId } = await freshWorkspace();
      const task = await insertTask(listId, inHours(2), {
        assignees: [member],
      });
      transport.failWith = new Error('boom');

      expect((await run(ws).expect(200)).body).toEqual({
        tasksProcessed: 1,
        emailsSent: 0,
        emailsFailed: 1,
      });
      expect(await reminderSentOf(task.id)).toBe(true);
    });

    it('k) two simultaneous runs: every task processed exactly once overall', async () => {
      const { ws, listId } = await freshWorkspace();
      // More than one batch, so both runs have work to fight over.
      const count = REMINDER_BATCH_SIZE + 50;
      const tasks = await dataSource.getRepository(Task).save(
        Array.from({ length: count }, (_, i) => ({
          listId,
          title: `Concurrent ${i}`,
          position: (i + 1) * 1000,
          dueDate: inHours(1 + i / count),
          createdById: owner.id,
        })),
      );
      await dataSource
        .getRepository(TaskAssignee)
        .insert(tasks.map((t) => ({ taskId: t.id, userId: member.id })));
      transport.delayMs = 2; // let the two runs overlap

      const [r1, r2] = await Promise.all([run(ws), run(ws)]);
      expect([r1.status, r2.status]).toEqual([200, 200]);
      expect(r1.body.tasksProcessed + r2.body.tasksProcessed).toBe(count);
      expect(r1.body.emailsSent + r2.body.emailsSent).toBe(count);

      const subjects = transport.sent.map((mail) => mail.subject);
      expect(subjects).toHaveLength(count);
      expect(new Set(subjects).size).toBe(count);
      const unmarked = await dataSource
        .getRepository(Task)
        .countBy({ listId, reminderSent: false });
      expect(unmarked).toBe(0);
    });

    it('skips a task locked by another instance instead of waiting for it', async () => {
      const { ws, listId } = await freshWorkspace();
      const held = await insertTask(listId, inHours(1), {
        assignees: [member],
      });
      const free = await insertTask(listId, inHours(2), {
        assignees: [member],
      });

      // Another instance, mid-claim: holds the row lock on `held`.
      const other = dataSource.createQueryRunner();
      await other.connect();
      await other.startTransaction();
      try {
        await other.query('SELECT id FROM tasks WHERE id = $1 FOR UPDATE', [
          held.id,
        ]);

        // Without SKIP LOCKED this run would block on `held` until the other
        // transaction ends: fail fast instead of hanging.
        const res = await Promise.race([
          run(ws),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('run blocked on a locked row')),
              3000,
            ),
          ),
        ]);
        expect(res.status).toBe(200);
        expect(res.body.tasksProcessed).toBe(1);
        expect(await reminderSentOf(free.id)).toBe(true);
        expect(await reminderSentOf(held.id)).toBe(false);
      } finally {
        await other.rollbackTransaction();
        await other.release();
      }

      // Once released, the next run picks it up.
      expect((await run(ws).expect(200)).body.tasksProcessed).toBe(1);
      expect(await reminderSentOf(held.id)).toBe(true);
    });

    it('l) a MEMBER cannot trigger a run (403)', async () => {
      const { ws } = await freshWorkspace();
      await run(ws, member).expect(403);
    });

    it('m) only the requested workspace is processed', async () => {
      const a = await freshWorkspace('A');
      const b = await freshWorkspace('B');
      const inA = await insertTask(a.listId, inHours(4), {
        assignees: [member],
      });
      const inB = await insertTask(b.listId, inHours(4), {
        assignees: [member],
      });

      expect((await run(a.ws).expect(200)).body.tasksProcessed).toBe(1);
      expect(await reminderSentOf(inA.id)).toBe(true);
      expect(await reminderSentOf(inB.id)).toBe(false);
      // Clean up for other suites' global runs: none exist, but stay tidy.
      await run(b.ws).expect(200);
    });

    it('is rate limited to 2 runs per minute per client', async () => {
      const { ws } = await freshWorkspace();
      const ip = randomClientIp();
      await run(ws, owner, ip).expect(200);
      await run(ws, owner, ip).expect(200);
      await run(ws, owner, ip).expect(429);
    });
  });

  describe('a) mail disabled (MAIL_ENABLED=false, the default under test)', () => {
    let plainApp: INestApplication;
    const plainLogs = new CapturingLogger();

    beforeAll(async () => {
      plainApp = await createTestApp({ logger: plainLogs });
    });

    afterAll(async () => {
      await plainApp.close();
    });

    it('has no transport at all, and invitations still succeed with emailSent = false', async () => {
      // No transport object: nothing that could open a connection.
      expect(plainApp.get(MAIL_TRANSPORT)).toBeNull();

      const inviter = await registerUser(plainApp);
      const ws = (await createWorkspace(inviter)).id;
      const res = await inviter.agent
        .post(`/workspaces/${ws}/invitations`)
        .send({ email: `inv-${randomUUID()}@veyra.test`, role: 'MEMBER' })
        .expect(201);
      expect(res.body.emailSent).toBe(false);
      expect(res.body.token).toEqual(expect.any(String));

      expect(
        plainLogs.lines.some(
          (line) =>
            line.startsWith('debug') &&
            line.includes('Mail disabled, not sending'),
        ),
      ).toBe(true);
      for (const line of plainLogs.lines) {
        expect(line).not.toContain(res.body.token);
      }
    });
  });
});
