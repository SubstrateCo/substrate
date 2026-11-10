CREATE TABLE "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_organization_id" text NOT NULL,
	"file_id" uuid NOT NULL,
	"file_purpose" text DEFAULT 'file' NOT NULL,
	"added_by_actor_entity_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	CONSTRAINT "message_attachment_file_unique" UNIQUE("message_id","file_id"),
	CONSTRAINT "message_attachment_purpose" CHECK ("message_attachments"."file_purpose" = 'file'),
	CONSTRAINT "message_attachment_position" CHECK ("message_attachments"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "task_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_organization_id" text NOT NULL,
	"file_id" uuid NOT NULL,
	"file_purpose" text DEFAULT 'file' NOT NULL,
	"added_by_actor_entity_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organization_id" text NOT NULL,
	"task_entity_id" uuid NOT NULL,
	CONSTRAINT "task_attachment_file_unique" UNIQUE("task_entity_id","file_id"),
	CONSTRAINT "task_attachment_organization" CHECK ("task_attachments"."organization_id" = "task_attachments"."file_organization_id"),
	CONSTRAINT "task_attachment_purpose" CHECK ("task_attachments"."file_purpose" = 'file'),
	CONSTRAINT "task_attachment_position" CHECK ("task_attachments"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "messaging_messages" DROP CONSTRAINT "messaging_body_check";--> statement-breakpoint
ALTER TABLE "stored_files" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_file_organization_purpose" UNIQUE("organization_id","id","purpose");--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_conversation_id_message_id_messaging_messages_conversation_id_id_fk" FOREIGN KEY ("conversation_id","message_id") REFERENCES "public"."messaging_messages"("conversation_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_file_organization_id_file_id_file_purpose_stored_files_organization_id_id_purpose_fk" FOREIGN KEY ("file_organization_id","file_id","file_purpose") REFERENCES "public"."stored_files"("organization_id","id","purpose") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_file_organization_id_added_by_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("file_organization_id","added_by_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_organization_id_task_entity_id_tasks_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_file_organization_id_file_id_file_purpose_stored_files_organization_id_id_purpose_fk" FOREIGN KEY ("file_organization_id","file_id","file_purpose") REFERENCES "public"."stored_files"("organization_id","id","purpose") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_file_organization_id_added_by_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("file_organization_id","added_by_actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_attachment_file_idx" ON "message_attachments" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "task_attachment_file_idx" ON "task_attachments" USING btree ("file_id");--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_body_check" CHECK (length("messaging_messages"."body") <= 20000);
