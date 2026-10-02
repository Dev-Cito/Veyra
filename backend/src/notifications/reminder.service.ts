import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { MailService } from '../mail/mail.service.js';

export const REMINDER_BATCH_SIZE = 100;
/** Guards against a data anomaly turning the loop infinite (100 x 100 tasks). */
export const REMINDER_MAX_BATCHES_PER_RUN = 100;

export interface ReminderRunResult {
  tasksProcessed: number;
  emailsSent: number;
  emailsFailed: number;
}

interface ClaimedTask {
  id: string;
  title: string;
  dueDate: Date;
  listName: string;
  workspaceId: string;
  boardId: string;
  boardName: string;
  recipients: { email: string; timezone: string | null }[];
}

/**
 * Due-date reminders: one email per assignee, for tasks due within the next
 * 24 hours, once per task (Task.reminderSent).
 *
 * Safe with several instances running the same cron: batches are claimed with
 * FOR UPDATE SKIP LOCKED, so a concurrent run skips rows another one holds
 * instead of waiting and processing them again after its COMMIT. Tasks are
 * marked BEFORE the emails go out, after the COMMIT: a failed send loses a
 * reminder, but none is ever sent twice (a sent email cannot be rolled back).
 */
@Injectable()
export class ReminderService {
  private readonly logger = new Logger('Reminders');

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mail: MailService,
  ) {}

  // Disabled under test: e2e suites trigger runs explicitly, and a cron firing
  // mid-suite would steal their tasks.
  @Cron(CronExpression.EVERY_HOUR, {
    name: 'due-date-reminders',
    disabled: process.env.NODE_ENV === 'test',
  })
  async runScheduled(): Promise<void> {
    await this.run();
  }

  /** All workspaces (cron), or one (manual trigger). */
  async run(workspaceId?: string): Promise<ReminderRunResult> {
    const result: ReminderRunResult = {
      tasksProcessed: 0,
      emailsSent: 0,
      emailsFailed: 0,
    };

    for (let batch = 0; batch < REMINDER_MAX_BATCHES_PER_RUN; batch++) {
      // 1-3: claim, mark and COMMIT. 4: only then, send.
      const tasks = await this.dataSource.transaction((manager) =>
        this.claimBatch(manager, workspaceId),
      );
      if (tasks.length === 0) {
        break;
      }
      result.tasksProcessed += tasks.length;
      for (const task of tasks) {
        for (const recipient of task.recipients) {
          const outcome = await this.mail.sendReminder({
            to: recipient.email,
            taskTitle: task.title,
            dueDate: task.dueDate,
            workspaceId: task.workspaceId,
            boardId: task.boardId,
            boardName: task.boardName,
            listName: task.listName,
            timeZone: recipient.timezone,
          });
          if (outcome === 'sent') {
            result.emailsSent++;
          } else if (outcome === 'failed') {
            result.emailsFailed++;
          }
        }
      }
      if (batch === REMINDER_MAX_BATCHES_PER_RUN - 1) {
        this.logger.warn(
          `Stopped after ${REMINDER_MAX_BATCHES_PER_RUN} batches; the rest waits for the next run`,
        );
      }
    }

    // Silent when there was nothing to do: otherwise one useless line an hour.
    if (result.tasksProcessed > 0) {
      this.logger.log(
        `Reminders${workspaceId ? ` (workspace ${workspaceId})` : ''}: ${result.tasksProcessed} tasks processed, ${result.emailsSent} emails sent, ${result.emailsFailed} failed`,
      );
    }
    return result;
  }

  /**
   * One batch, inside a transaction: lock eligible tasks (skipping those a
   * concurrent run holds), mark them, and read what the emails need. Tasks
   * without assignees are marked too, so they are not re-examined hourly.
   */
  private async claimBatch(
    manager: EntityManager,
    workspaceId: string | undefined,
  ): Promise<ClaimedTask[]> {
    // OF t: lock the task rows only. The joined lists/boards rows (joined for
    // the workspace filter) are what moves lock; locking them would make the
    // cron block drag & drop.
    const scoped = workspaceId !== undefined;
    const claimed = await manager.query<{ id: string }[]>(
      `SELECT t.id
       FROM tasks t
       ${scoped ? 'JOIN lists l ON l.id = t."listId" JOIN boards b ON b.id = l."boardId"' : ''}
       WHERE t."dueDate" BETWEEN now() AND now() + interval '24 hours'
         AND t."reminderSent" = false
         ${scoped ? 'AND b."workspaceId" = $2' : ''}
       ORDER BY t."dueDate" ASC
       LIMIT $1
       FOR UPDATE OF t SKIP LOCKED`,
      scoped ? [REMINDER_BATCH_SIZE, workspaceId] : [REMINDER_BATCH_SIZE],
    );
    if (claimed.length === 0) {
      return [];
    }
    const ids = claimed.map((row) => row.id);

    // A raw UPDATE on purpose: reminderSent is internal bookkeeping, it does
    // not bump the task's updatedAt.
    await manager.query(
      `UPDATE tasks SET "reminderSent" = true WHERE id = ANY($1)`,
      [ids],
    );

    // A plain read, no lock: the claim above locked the task rows only.
    const rows = await manager.query<
      {
        id: string;
        title: string;
        dueDate: Date;
        listName: string;
        workspaceId: string;
        boardId: string;
        boardName: string;
        email: string | null;
        timezone: string | null;
      }[]
    >(
      `SELECT t.id, t.title, t."dueDate", l.name AS "listName",
              b."workspaceId", b.id AS "boardId", b.name AS "boardName",
              u.email, u.timezone
       FROM tasks t
       JOIN lists l ON l.id = t."listId"
       JOIN boards b ON b.id = l."boardId"
       LEFT JOIN task_assignees ta ON ta."taskId" = t.id
       LEFT JOIN users u ON u.id = ta."userId"
       WHERE t.id = ANY($1)
       ORDER BY t."dueDate" ASC`,
      [ids],
    );

    const tasks = new Map<string, ClaimedTask>();
    for (const row of rows) {
      const task = tasks.get(row.id) ?? {
        id: row.id,
        title: row.title,
        dueDate: row.dueDate,
        listName: row.listName,
        workspaceId: row.workspaceId,
        boardId: row.boardId,
        boardName: row.boardName,
        recipients: [],
      };
      if (row.email) {
        task.recipients.push({ email: row.email, timezone: row.timezone });
      }
      tasks.set(row.id, task);
    }
    return [...tasks.values()];
  }
}
