CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "messaging_conversations_name_trgm_idx" ON "messaging_conversations" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "messaging_messages_search_idx" ON "messaging_messages" USING gin (to_tsvector('simple', "body"));--> statement-breakpoint
CREATE INDEX "projects_search_idx" ON "projects" USING gin (to_tsvector('simple', "name" || ' ' || "description"));--> statement-breakpoint
CREATE INDEX "projects_name_trgm_idx" ON "projects" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tasks_search_idx" ON "tasks" USING gin (to_tsvector('simple', "title" || ' ' || "description"));--> statement-breakpoint
CREATE INDEX "tasks_title_trgm_idx" ON "tasks" USING gin (lower("title") gin_trgm_ops);