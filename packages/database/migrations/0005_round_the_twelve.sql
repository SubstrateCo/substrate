DROP TABLE "user_agent_callers" CASCADE;--> statement-breakpoint
DROP TABLE "agent_audit_events" CASCADE;--> statement-breakpoint
DROP TABLE "agent_invocations" CASCADE;--> statement-breakpoint
ALTER TABLE "user_agents" DROP COLUMN "caller_policy";