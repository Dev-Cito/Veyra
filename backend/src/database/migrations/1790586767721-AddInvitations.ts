import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvitations1790586767721 implements MigrationInterface {
  name = 'AddInvitations1790586767721';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."invitation_role" AS ENUM('ADMIN', 'MEMBER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "invitations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "workspaceId" uuid NOT NULL, "email" character varying(255) NOT NULL, "role" "public"."invitation_role" NOT NULL, "tokenHash" character varying(64) NOT NULL, "invitedById" uuid, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "acceptedAt" TIMESTAMP WITH TIME ZONE, "revokedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5dec98cfdfd562e4ad3648bbb07" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_invitations_workspace" ON "invitations"  ("workspaceId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_invitations_email" ON "invitations"  ("email") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_invitations_token_hash" ON "invitations"  ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_invitations_pending" ON "invitations"  ("workspaceId", "email") WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "invitations" ADD CONSTRAINT "FK_fd175905b95c6758d226a632d0e" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invitations" ADD CONSTRAINT "FK_b60325e5302be0dad38b423314c" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invitations" DROP CONSTRAINT "FK_b60325e5302be0dad38b423314c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invitations" DROP CONSTRAINT "FK_fd175905b95c6758d226a632d0e"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_invitations_pending"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_invitations_token_hash"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_invitations_email"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_invitations_workspace"`);
    await queryRunner.query(`DROP TABLE "invitations"`);
    await queryRunner.query(`DROP TYPE "public"."invitation_role"`);
  }
}
