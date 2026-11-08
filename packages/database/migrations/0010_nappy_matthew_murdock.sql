ALTER TABLE "agent_tool_activity" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agent_tool_activity" CASCADE;--> statement-breakpoint
ALTER TABLE "entity_grants" DROP CONSTRAINT "entity_grants_organization_id_actor_entity_id_actor_type_actors_organization_id_entity_id_type_fk";
--> statement-breakpoint
ALTER TABLE "entity_grants" ADD CONSTRAINT "entity_grants_organization_id_actor_entity_id_actors_organization_id_entity_id_fk" FOREIGN KEY ("organization_id","actor_entity_id") REFERENCES "public"."actors"("organization_id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_grants" DROP COLUMN "actor_type";