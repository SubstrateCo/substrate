CREATE INDEX "user_agents_image_file_idx" ON "user_agents" USING btree ("image_file_id") WHERE "user_agents"."image_file_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "messaging_message_conversation_created_idx" ON "messaging_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messaging_reactions_participant_idx" ON "messaging_reactions" USING btree ("conversation_id","actor_entity_id");--> statement-breakpoint
CREATE INDEX "messaging_sharing_event_invitation_idx" ON "messaging_sharing_events" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("organization_id","parent_task_entity_id") WHERE "tasks"."parent_task_entity_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_read_created_idx" ON "notifications" USING btree ("created_at") WHERE "notifications"."read_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notification_entity_idx" ON "notifications" USING btree ("organization_id","entity_id") WHERE "notifications"."entity_id" IS NOT NULL;