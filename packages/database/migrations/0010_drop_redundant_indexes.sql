ALTER TABLE "stored_files" DROP CONSTRAINT "stored_file_organization_purpose";--> statement-breakpoint
DROP INDEX "contact_identifiers_lookup_idx";--> statement-breakpoint
DROP INDEX "messaging_message_timeline_idx";--> statement-breakpoint
DROP INDEX "agent_requests_thread_idx";