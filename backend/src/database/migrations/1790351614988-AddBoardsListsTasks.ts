import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBoardsListsTasks1790351614988 implements MigrationInterface {
  name = 'AddBoardsListsTasks1790351614988';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "task_assignees" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "taskId" uuid NOT NULL, "userId" uuid NOT NULL, "assignedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_task_assignees_task_user" UNIQUE ("taskId", "userId"), CONSTRAINT "PK_e23bc1438f7bb32f41e8d493e78" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_task_assignees_user" ON "task_assignees"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."task_priority" AS ENUM('LOW', 'MEDIUM', 'HIGH')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tasks" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "listId" uuid NOT NULL, "title" character varying(200) NOT NULL, "description" text, "position" double precision NOT NULL, "dueDate" TIMESTAMP WITH TIME ZONE, "priority" "public"."task_priority" NOT NULL DEFAULT 'MEDIUM', "reminderSent" boolean NOT NULL DEFAULT false, "createdById" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tasks_list" ON "tasks"  ("listId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tasks_due_reminder" ON "tasks"  ("dueDate", "reminderSent") `,
    );
    await queryRunner.query(
      `CREATE TABLE "lists" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "boardId" uuid NOT NULL, "name" character varying(100) NOT NULL, "position" double precision NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_268b525e9a6dd04d0685cb2aaaa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_lists_board" ON "lists"  ("boardId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "boards" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "workspaceId" uuid NOT NULL, "name" character varying(100) NOT NULL, "description" text, "position" double precision NOT NULL, "createdById" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_606923b0b068ef262dfdcd18f44" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_boards_workspace" ON "boards"  ("workspaceId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "task_assignees" ADD CONSTRAINT "FK_8b1600551063c485554bca74c13" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "task_assignees" ADD CONSTRAINT "FK_e1f7dbf3fd1b02451882ea7c7b4" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_fd078d23aa52482d19347a96274" FOREIGN KEY ("listId") REFERENCES "lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_660898d912c6e71107e9ef8f38d" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lists" ADD CONSTRAINT "FK_05460f5df61d54daeaf96c54c00" FOREIGN KEY ("boardId") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "boards" ADD CONSTRAINT "FK_f13eef6b2a45019e1df9cfe9963" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "boards" ADD CONSTRAINT "FK_b82b543934c5e662ec834e5ad48" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "boards" DROP CONSTRAINT "FK_b82b543934c5e662ec834e5ad48"`,
    );
    await queryRunner.query(
      `ALTER TABLE "boards" DROP CONSTRAINT "FK_f13eef6b2a45019e1df9cfe9963"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lists" DROP CONSTRAINT "FK_05460f5df61d54daeaf96c54c00"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_660898d912c6e71107e9ef8f38d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_fd078d23aa52482d19347a96274"`,
    );
    await queryRunner.query(
      `ALTER TABLE "task_assignees" DROP CONSTRAINT "FK_e1f7dbf3fd1b02451882ea7c7b4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "task_assignees" DROP CONSTRAINT "FK_8b1600551063c485554bca74c13"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_boards_workspace"`);
    await queryRunner.query(`DROP TABLE "boards"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_lists_board"`);
    await queryRunner.query(`DROP TABLE "lists"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_tasks_due_reminder"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_tasks_list"`);
    await queryRunner.query(`DROP TABLE "tasks"`);
    await queryRunner.query(`DROP TYPE "public"."task_priority"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_task_assignees_user"`);
    await queryRunner.query(`DROP TABLE "task_assignees"`);
  }
}
