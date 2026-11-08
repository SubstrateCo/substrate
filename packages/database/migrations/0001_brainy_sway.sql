DROP INDEX "contacts_organization_idx";--> statement-breakpoint
DROP INDEX "tasks_project_idx";--> statement-breakpoint
CREATE INDEX "messaging_message_thread_idx" ON "messaging_messages" USING btree ("conversation_id","thread_id","created_at","id");--> statement-breakpoint
CREATE INDEX "message_reference_conversation_idx" ON "message_entity_references" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "task_activity_source_message_idx" ON "task_activity" USING btree ("source_message_id") WHERE "task_activity"."source_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_message_idx" ON "notifications" USING btree ("message_id");