/**
 * Sync ADMIN_PASSWORD from .env into the admin user's password_hash.
 * Run via `pnpm db:reset-admin-password` after changing ADMIN_PASSWORD.
 *
 * Does not delete or modify tasks, comments, projects, or other users.
 */
import { env } from '@/server/env';
import { userService } from '@/server/services';

async function main() {
  await userService.resetAdminPassword(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  console.info(`✓ admin password updated for ${env.ADMIN_EMAIL}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✗ reset-admin-password failed:', err);
    process.exit(1);
  });
