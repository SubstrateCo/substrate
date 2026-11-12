ALTER TABLE "agent_wakes" DROP CONSTRAINT "agent_wake_source_check";--> statement-breakpoint
ALTER TABLE "user_agents" ADD COLUMN "caller_policy" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_organization_entity_user_unique" UNIQUE("organization_id","entity_id","user_id");--> statement-breakpoint
ALTER TABLE "user_agents" ADD CONSTRAINT "user_agent_caller_policy_check" CHECK ("user_agents"."caller_policy" IN ('owner', 'anyone', 'ask'));--> statement-breakpoint
ALTER TABLE "agent_wakes" ADD CONSTRAINT "agent_wake_source_check" CHECK ("agent_wakes"."source" IN ('owner_message', 'answer', 'approval_result', 'caller_message'));