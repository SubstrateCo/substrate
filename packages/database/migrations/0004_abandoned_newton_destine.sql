CREATE TABLE "project_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"project_entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "project_statuses_project_id_unique" UNIQUE("organization_id","project_entity_id","id"),
	CONSTRAINT "project_statuses_name_unique" UNIQUE("project_entity_id","name"),
	CONSTRAINT "project_statuses_name_check" CHECK (length(trim("project_statuses"."name")) BETWEEN 1 AND 100),
	CONSTRAINT "project_statuses_category_check" CHECK ("project_statuses"."category" IN ('todo', 'active', 'done', 'canceled'))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" GENERATED ALWAYS AS ('project'::entity_type) STORED NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	CONSTRAINT "projects_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "projects_name_check" CHECK (length(trim("projects"."name")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" "entity_type" GENERATED ALWAYS AS ('task'::entity_type) STORED NOT NULL,
	"project_entity_id" uuid NOT NULL,
	"parent_task_entity_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status_id" uuid NOT NULL,
	"priority" text DEFAULT 'none' NOT NULL,
	"assignee_actor_entity_id" uuid,
	"due_date" date,
	CONSTRAINT "tasks_organization_entity_unique" UNIQUE("organization_id","entity_id"),
	CONSTRAINT "tasks_project_entity_unique" UNIQUE("organization_id","project_entity_id","entity_id"),
	CONSTRAINT "tasks_title_check" CHECK (length(trim("tasks"."title")) BETWEEN 1 AND 300),
	CONSTRAINT "tasks_priority_check" CHECK ("tasks"."priority" IN ('none', 'low', 'medium', 'high', 'urgent')),
	CONSTRAINT "tasks_parent_check" CHECK ("tasks"."entity_id" <> "tasks"."parent_task_entity_id")
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"task_entity_id" uuid NOT NULL,
	"author_actor_entity_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_comments_body_check" CHECK (length(trim("task_comments"."body")) BETWEEN 1 AND 20000)
);
--> statement-breakpoint
ALTER TABLE "project_statuses" ADD CONSTRAINT "project_statuses_organization_id_project_entity_id_projects_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","project_entity_id") REFERENCES "public"."projects"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_entity_id_entity_type_entities_organization_id_entity_id_entity_type_fk" FOREIGN KEY ("organization_id","entity_id","entity_type") REFERENCES "public"."entities"("organization_id","entity_id","entity_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_project_entity_id_projects_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","project_entity_id") REFERENCES "public"."projects"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_entity_id_project_entity_id_entity_access_parents_organization_id_entity_id_parent_entity_id_fk" FOREIGN KEY ("organization_id","entity_id","project_entity_id") REFERENCES "public"."entity_access_parents"("organization_id","entity_id","parent_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_project_entity_id_parent_task_entity_id_tasks_organization_id_project_entity_id_entity_id_fk" FOREIGN KEY ("organization_id","project_entity_id","parent_task_entity_id") REFERENCES "public"."tasks"("organization_id","project_entity_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_project_entity_id_status_id_project_statuses_organization_id_project_entity_id_id_fk" FOREIGN KEY ("organization_id","project_entity_id","status_id") REFERENCES "public"."project_statuses"("organization_id","project_entity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_assignee_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","assignee_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_organization_id_task_entity_id_tasks_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_organization_id_author_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","author_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("organization_id","project_entity_id");--> statement-breakpoint
CREATE INDEX "task_comments_timeline_idx" ON "task_comments" USING btree ("organization_id","task_entity_id","created_at","id");