ALTER TABLE "message_attachments" DROP CONSTRAINT "message_attachments_conversation_id_message_id_messaging_messages_conversation_id_id_fk";
--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD CONSTRAINT "messaging_message_author_unique" UNIQUE("conversation_id","id","author_organization_id","author_actor_entity_id");--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachment_author_fk" FOREIGN KEY ("conversation_id","message_id","file_organization_id","added_by_actor_entity_id") REFERENCES "public"."messaging_messages"("conversation_id","id","author_organization_id","author_actor_entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_upload_uploader_idx" ON "file_uploads" USING btree ("uploaded_by","expires_at") WHERE "file_uploads"."purpose" = 'file' AND "file_uploads"."deleted_at" IS NULL;--> statement-breakpoint
