import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserTimezone1790856700345 implements MigrationInterface {
  name = 'AddUserTimezone1790856700345';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "timezone" character varying(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "timezone"`);
  }
}
