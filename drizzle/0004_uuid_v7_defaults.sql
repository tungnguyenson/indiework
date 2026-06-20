-- UUID PKs: drop Postgres v4 defaults (gen_random_uuid). New rows get UUID v7 from
-- the app layer (newUuid in src/lib/uuid.ts). Existing v4 rows are unchanged.
--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "milestones" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "modules" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "id" DROP DEFAULT;
