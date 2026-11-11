DROP INDEX "messaging_messages_search_idx";--> statement-breakpoint
DROP INDEX "projects_search_idx";--> statement-breakpoint
DROP INDEX "tasks_search_idx";--> statement-breakpoint
CREATE INDEX "messaging_messages_search_idx" ON "messaging_messages" USING gin (to_tsvector('simple', regexp_replace("body", '[!-/:-@[-`{-~]', ' ', 'g')));--> statement-breakpoint
CREATE INDEX "projects_search_idx" ON "projects" USING gin (to_tsvector('simple', regexp_replace("name" || ' ' || "description", '[!-/:-@[-`{-~]', ' ', 'g')));--> statement-breakpoint
CREATE INDEX "tasks_search_idx" ON "tasks" USING gin (to_tsvector('simple', regexp_replace("title" || ' ' || "description", '[!-/:-@[-`{-~]', ' ', 'g')));