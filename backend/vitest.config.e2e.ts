import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// e2e tests never touch the dev database: they run against DATABASE_URL_TEST,
// or by default the same server with a `_test` suffix on the database name.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env (CI): rely on the real environment.
}

function deriveTestUrl(url: string | undefined): string {
  if (!url) {
    throw new Error('Set DATABASE_URL_TEST or DATABASE_URL to run e2e tests');
  }
  const parsed = new URL(url);
  parsed.pathname = `${parsed.pathname}_test`;
  return parsed.toString();
}

const testDatabaseUrl =
  process.env.DATABASE_URL_TEST ?? deriveTestUrl(process.env.DATABASE_URL);

// Read by the global setup, which runs in this process.
process.env.E2E_DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/e2e.global-setup.ts'],
    // All files share one database.
    fileParallelism: false,
    env: {
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: process.env.JWT_SECRET || 'e2e-test-secret',
      NODE_ENV: 'test',
    },
  },
});
