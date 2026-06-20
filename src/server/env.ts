/**
 * Validated environment — fail fast at startup with a clear message.
 * Only ever imported by server code + node scripts (migrate/seed); never by
 * client components, so secrets stay out of the client bundle.
 *
 * Driver: `DB_DRIVER` (default `postgres`) picks the database backend.
 *  - postgres → `DATABASE_URL` is required (connection string)
 *  - sqlite   → `SQLITE_PATH` (default `./data/iw.db`); no `DATABASE_URL` needed
 */
import { z } from 'zod';

const schema = z
  .object({
    DB_DRIVER: z.enum(['postgres', 'sqlite']).default('postgres'),
    DATABASE_URL: z
      .string()
      .url('DATABASE_URL must be a valid postgres connection string')
      .optional(),
    SQLITE_PATH: z.string().min(1).optional(),
    APP_PASSWORD: z.string().min(1).optional(), // deprecated — kept for docs/back-compat only
    ADMIN_EMAIL: z.string().email('ADMIN_EMAIL must be a valid email'),
    ADMIN_PASSWORD: z.string().min(1, 'ADMIN_PASSWORD is required (the web login password)'),
    COOKIE_SECRET: z
      .string()
      .min(32, 'COOKIE_SECRET must be at least 32 chars (used to sign the session cookie)'),
    API_TOKEN: z.string().min(1, 'API_TOKEN is required (Bearer token for REST + MCP)'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    // Cloudflare R2 (S3-compatible). All four required together in production uploads.
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_BUCKET: z.string().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.DB_DRIVER === 'postgres' && !val.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required when DB_DRIVER=postgres',
      });
    }
    const r2 = [val.R2_ACCOUNT_ID, val.R2_ACCESS_KEY_ID, val.R2_SECRET_ACCESS_KEY, val.R2_BUCKET];
    const anyR2 = r2.some(Boolean);
    const allR2 = r2.every(Boolean);
    if (anyR2 && !allR2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['R2_ACCOUNT_ID'],
        message: 'R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET must all be set together',
      });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const data = parsed.data;

export const env = {
  ...data,
  /** True when all R2 credentials are present — use R2 instead of the in-memory fallback. */
  R2_CONFIGURED: Boolean(
    data.R2_ACCOUNT_ID && data.R2_ACCESS_KEY_ID && data.R2_SECRET_ACCESS_KEY && data.R2_BUCKET,
  ),
};
