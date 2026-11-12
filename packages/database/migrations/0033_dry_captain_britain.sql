ALTER TABLE "task_comments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_comment_references" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "task_comments" CASCADE;--> statement-breakpoint
DROP TABLE "task_comment_references" CASCADE;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD COLUMN "task_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversations_organization_id_task_entity_id_tasks_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","task_entity_id") REFERENCES "public"."tasks"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_conversation_task_unique" UNIQUE("task_entity_id");--> statement-breakpoint
ALTER TABLE "messaging_conversations" ADD CONSTRAINT "messaging_task_discussion_check" CHECK ("messaging_conversations"."task_entity_id" IS NULL OR ("messaging_conversations"."kind" = 'group' AND "messaging_conversations"."private" AND "messaging_conversations"."dm_key" IS NULL));