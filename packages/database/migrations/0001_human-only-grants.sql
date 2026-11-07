ALTER TABLE "entity_grants" DROP CONSTRAINT "entity_grants_organization_id_actor_entity_id_actors_organization_id_entity_id_fk";
--> statement-breakpoint
ALTER TABLE "entity_grants" ADD COLUMN "actor_type" "actor_type" GENERATED ALWAYS AS ('human'::actor_type) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_organization_entity_type_unique" UNIQUE("organization_id","entity_id","type");--> statement-breakpoint
ALTER TABLE "entity_grants" ADD CONSTRAINT "entity_grants_organization_id_actor_entity_id_actor_type_actors_organization_id_entity_id_type_fk" FOREIGN KEY ("organization_id","actor_entity_id","actor_type") REFERENCES "public"."actors"("organization_id","entity_id","type") ON DELETE cascade ON UPDATE no action;
