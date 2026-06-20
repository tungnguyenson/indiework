CREATE TABLE "workspace_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "projects_key_unique";--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "assignee_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan" text DEFAULT 'solo' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "seat_limit" integer;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ws_members_unique" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "ws_members_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_key_unique" ON "projects" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_idx" ON "tasks" USING btree ("workspace_id");--> statement-breakpoint
-- ── P1 tenant-boundary data backfill (idempotent) ──────────────────────────
-- Account type: the single 'admin' becomes a 'human' (RBAC now lives on
-- workspace_members, not users.role). See authorization-design.md §3.
UPDATE "users" SET "role" = 'human' WHERE "role" = 'admin';--> statement-breakpoint
-- Every existing workspace is solo (the column default also covers new rows).
UPDATE "workspaces" SET "plan" = 'solo' WHERE "plan" IS NULL;--> statement-breakpoint
-- Scope project tasks to their project's workspace.
UPDATE "tasks" t SET "workspace_id" = p."workspace_id"
  FROM "projects" p
  WHERE t."project_id" = p."id" AND t."workspace_id" IS NULL;--> statement-breakpoint
-- Scope remaining (Inbox + legacy null-workspace project) tasks to the default
-- (first-created) workspace.
UPDATE "tasks" SET "workspace_id" = (
    SELECT "id" FROM "workspaces" ORDER BY "created_at" ASC LIMIT 1
  )
  WHERE "workspace_id" IS NULL
  AND EXISTS (SELECT 1 FROM "workspaces");--> statement-breakpoint
-- The first human user becomes owner of the default workspace.
INSERT INTO "workspace_members" ("id", "user_id", "workspace_id", "role", "status", "joined_at")
  SELECT gen_random_uuid(), u."id", w."id", 'owner', 'active', now()
  FROM (SELECT "id" FROM "users" WHERE "role" = 'human' ORDER BY "created_at" ASC LIMIT 1) u
  CROSS JOIN (SELECT "id" FROM "workspaces" ORDER BY "created_at" ASC LIMIT 1) w
  WHERE NOT EXISTS (
    SELECT 1 FROM "workspace_members" m
    WHERE m."user_id" = u."id" AND m."workspace_id" = w."id"
  );