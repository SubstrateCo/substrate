ALTER TABLE "agent_run_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_run_replies" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_run_requests" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_run_triggers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_runs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agent_run_events" CASCADE;--> statement-breakpoint
DROP TABLE "agent_run_replies" CASCADE;--> statement-breakpoint
DROP TABLE "agent_run_requests" CASCADE;--> statement-breakpoint
DROP TABLE "agent_run_triggers" CASCADE;--> statement-breakpoint
DROP TABLE "agent_runs" CASCADE;--> statement-breakpoint
ALTER TABLE "messaging_messages" ADD COLUMN "origin_turn_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_tool_requests" ADD COLUMN "turn_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_tool_requests" ADD COLUMN "attempt" integer;--> statement-breakpoint
CREATE INDEX "messaging_message_origin_turn_idx" ON "messaging_messages" USING btree ("origin_turn_id") WHERE "messaging_messages"."origin_turn_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_tool_requests_turn_idx" ON "agent_tool_requests" USING btree ("turn_id") WHERE "agent_tool_requests"."turn_id" IS NOT NULL;