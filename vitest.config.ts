import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Load .env so unit tests can read non-DB config (cookie secret, API token, …).
try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional (e.g. CI provides env directly).
}

// Integration tests (services.int.test.ts) run ONLY when TEST_DATABASE_URL is
// set, and against THAT database — they are `describe.skipIf`'d on it. So a bare
// `pnpm test` skips them and NEVER writes to your dev DB. Point the db module at
// the dedicated test database when configured.
//   TEST_DATABASE_URL=postgres://…/indiework_test pnpm test
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Test defaults for vars added after older .env files were created.
process.env.ADMIN_EMAIL ??= 'test@example.com';
process.env.ADMIN_PASSWORD ??= process.env.APP_PASSWORD ?? 'test-password';
process.env.COOKIE_SECRET ??= 'test-cookie-secret-at-least-32-characters-long';
process.env.API_TOKEN ??= 'test-api-token';
// A placeholder so importing the db module doesn't fail env validation; the
// integration suite is skipped unless TEST_DATABASE_URL is set, so nothing
// actually connects to this.
process.env.DATABASE_URL ??= 'postgres://indiework:indiework@127.0.0.1:5432/indiework';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['tests/**/*.test.ts'],
    env: { ...process.env } as Record<string, string>,
    // Integration tests share one Postgres; run files serially to avoid races.
    fileParallelism: false,
    hookTimeout: 20000,
  },
});
