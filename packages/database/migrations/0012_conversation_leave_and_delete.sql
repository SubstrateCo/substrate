ALTER TABLE "task_activity" DROP CONSTRAINT "task_activity_source_message_id_messaging_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "messaging_participants" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_source_message_id_messaging_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messaging_messages"("id") ON DELETE set null ON UPDATE no action;