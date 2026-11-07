ALTER TABLE "actors" ADD COLUMN "user_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_user_agent_id_user_agents_id_fk" FOREIGN KEY ("user_agent_id") REFERENCES "public"."user_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_organization_user_agent_unique" UNIQUE("organization_id","user_agent_id");--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_user_agent_type_check" CHECK ("actors"."user_agent_id" IS NULL OR "actors"."type" = 'agent');