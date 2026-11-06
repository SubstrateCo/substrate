ALTER TABLE "tasks" DROP CONSTRAINT "tasks_organization_id_project_entity_id_status_id_project_statuses_organization_id_project_entity_id_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "status_id";
--> statement-breakpoint
ALTER TABLE "project_statuses" DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE "project_statuses" CASCADE;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "status" text DEFAULT 'not_started' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" IN ('not_started', 'in_progress', 'in_review', 'completed', 'canceled'));
