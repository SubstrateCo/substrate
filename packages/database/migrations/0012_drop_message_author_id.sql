ALTER TABLE "messaging_messages" DROP CONSTRAINT "messaging_message_request_unique";--> statement-breakpoint
ALTER TABLE "messaging_messages" DROP CONSTRAINT "messaging_author_check";--> statement-breakpoint
ALTER TABLE "messaging_messages" DROP COLUMN "author_id";