ALTER TABLE "actors" DROP CONSTRAINT "actors_name_check";--> statement-breakpoint
ALTER TABLE "actors" DROP CONSTRAINT "actors_identity_check";--> statement-breakpoint
ALTER TABLE "actors" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "actors" DROP COLUMN "agent_config";--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_identity_check" CHECK (("actors"."type" = 'human' AND "actors"."user_id" IS NOT NULL) OR ("actors"."type" = 'agent' AND "actors"."user_id" IS NULL));