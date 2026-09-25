import type { DataSourceOptions } from 'typeorm';
import { User } from '../users/user.entity.js';
import { Workspace } from '../workspaces/entities/workspace.entity.js';
import { WorkspaceMember } from '../workspaces/entities/workspace-member.entity.js';
import { migrations } from './migrations/index.js';

/**
 * Single source of truth for the database connection, shared by the Nest app
 * (TypeOrmModule) and the TypeORM CLI (data-source.ts).
 *
 * Entities and migrations are listed explicitly rather than globbed so the
 * same config works from compiled `dist/` and from TS sources under vitest.
 */
export function buildDataSourceOptions(
  env: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not defined');
  }

  return {
    type: 'postgres',
    url,
    // Managed Postgres (Render) terminates TLS with a certificate chain that
    // node-postgres does not trust by default.
    ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    // gen_random_uuid() is built into Postgres 13+, no uuid-ossp needed.
    uuidExtension: 'pgcrypto',
    entities: [User, Workspace, WorkspaceMember],
    migrations,
    synchronize: false,
  };
}
