import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source.options.js';

/**
 * Creates the test database if needed, then rebuilds its schema from the
 * migrations, so the e2e run also verifies that the migrations apply cleanly.
 */
export default async function setup(): Promise<void> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) {
    throw new Error('E2E_DATABASE_URL is not set (see vitest.config.e2e.ts)');
  }
  const testDbName = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!/^\w+$/.test(testDbName)) {
    throw new Error(`Refusing to use test database name "${testDbName}"`);
  }

  // Connect to the maintenance database to create the test one.
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new DataSource({
    type: 'postgres',
    url: adminUrl.toString(),
  });
  await admin.initialize();
  const exists = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [testDbName],
  );
  if (exists.length === 0) {
    await admin.query(`CREATE DATABASE "${testDbName}"`);
  }
  await admin.destroy();

  const dataSource = new DataSource(
    buildDataSourceOptions({ ...process.env, DATABASE_URL: url }),
  );
  await dataSource.initialize();
  await dataSource.dropDatabase();
  await dataSource.runMigrations();
  await dataSource.destroy();
}
