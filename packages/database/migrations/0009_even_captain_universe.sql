CREATE TABLE "agent_tool_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"actor_entity_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"targets" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_tool_activity" ADD CONSTRAINT "agent_tool_activity_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_tool_activity_actor_idx" ON "agent_tool_activity" USING btree ("organization_id","actor_entity_id","created_at");