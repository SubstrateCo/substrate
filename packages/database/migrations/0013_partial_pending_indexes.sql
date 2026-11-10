DROP INDEX "file_upload_expiry_idx";--> statement-breakpoint
DROP INDEX "agent_wakes_pending_idx";--> statement-breakpoint
CREATE INDEX "notification_unread_idx" ON "notifications" USING btree ("organization_id","recipient_actor_entity_id","created_at","id") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "file_upload_expiry_idx" ON "file_uploads" USING btree ("expires_at") WHERE "file_uploads"."temporary_cleaned_at" IS NULL;--> statement-breakpoint
CREATE INDEX "agent_wakes_pending_idx" ON "agent_wakes" USING btree ("user_agent_id","created_at","id") WHERE "agent_wakes"."acked_at" IS NULL;