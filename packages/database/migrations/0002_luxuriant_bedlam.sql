DELETE FROM "agent_wakes" WHERE "source" = 'approval_result';--> statement-breakpoint
DELETE FROM "agent_requests" WHERE "kind" = 'proposal' OR "status" IN ('executing', 'executed', 'failed');--> statement-breakpoint
ALTER TABLE "agent_requests" DROP CONSTRAINT "agent_request_proposal_check";--> statement-breakpoint
ALTER TABLE "agent_requests" DROP COLUMN "proposed_action";--> statement-breakpoint
ALTER TABLE "agent_requests" DROP COLUMN "action_hash";--> statement-breakpoint
ALTER TABLE "agent_requests" DROP COLUMN "target_basis";--> statement-breakpoint
ALTER TABLE "agent_requests" DROP COLUMN "outcome";